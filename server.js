require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const getClientIp = require('./lib/getClientIp');
const { seedDatabase } = require('./lib/seed');

// Fail fast if SESSION_SECRET is missing or weak
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('FATAL: SESSION_SECRET is missing or too short (min 32 chars). Set it in .env');
  process.exit(1);
}

// connect-mongo encrypts sessions with kruptein, which silently refuses to store a session
// when the secret lacks 2 uppercase, 2 lowercase, 2 digits and 2 symbols (admin login then
// appears to work but every following request is logged out). Warn loudly at startup.
const secretCounts = [/[A-Z]/g, /[a-z]/g, /[0-9]/g, /[!@#$%^&*()_+\-=[\]{};':"|,.<>/?]/g]
  .map(re => (process.env.SESSION_SECRET.match(re) || []).length);
if (secretCounts.some(n => n < 2)) {
  console.warn('WARNING: SESSION_SECRET needs at least 2 uppercase letters, 2 lowercase letters, 2 digits and 2 symbols for the MongoDB session store; admin sessions will not persist until it does.');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy when behind reverse proxy (Vercel, Nginx, etc.)
if (process.env.BEHIND_PROXY === 'true' || process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
      "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self'",
      "frame-ancestors 'self'"
    ].join('; ')
  );
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (req.path.includes('itqan-cp9x')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
  next();
});

app.use(express.json({ limit: '1mb' }));

// Initialize session store with MongoDB
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    dbName: 'itqan',
    collectionName: 'sessions',
    touchAfter: 24 * 3600, // lazy session update in seconds
    crypto: { secret: process.env.SESSION_SECRET },
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 2 * 60 * 60 * 1000  // 2 hours
  }
}));

// CSRF check: reject cross-origin state-changing requests (exact host comparison)
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const originHeader = req.headers.origin || req.headers.referer || '';
    if (originHeader) {
      try {
        const originHost = new URL(originHeader).host;
        if (originHost !== req.headers.host) return res.status(403).json({ error: 'Forbidden' });
      } catch {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
  }
  next();
});

// Rate limit contact form: max 5 requests per IP per minute
const contactRateMap = new Map();
// Prune expired entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of contactRateMap) {
    if (record.resetAt < now) contactRateMap.delete(ip);
  }
}, 5 * 60 * 1000).unref();

app.use('/api/contact', (req, res, next) => {
  if (req.method !== 'POST') return next();
  const ip = getClientIp(req);
  const now = Date.now();
  const record = contactRateMap.get(ip) || { count: 0, resetAt: now + 60000 };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + 60000; }
  record.count++;
  contactRateMap.set(ip, record);
  if (record.count > 5) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  }
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/data', require('./routes/data'));
app.use('/api/contact', require('./routes/contact'));
app.use(require('./routes/seo'));
// public/index.html is a template rendered by routes/seo.js; never let express.static serve it
// raw through path variants such as //index.html, /./index.html or /%69ndex.html
app.use((req, res, next) => {
  let p;
  try { p = path.posix.normalize(decodeURIComponent(req.path)); } catch { return next(); }
  if (p.toLowerCase() === '/index.html') return res.redirect(301, '/');
  next();
});

// The logo was renamed; keep the old URL working for anything that linked to it
app.get('/img/orginal.png', (req, res) => res.redirect(301, '/img/logo.png'));

// Express 4's mime table predates AVIF
express.static.mime.define({ 'image/avif': ['avif'] });
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    // Font files carry a version in their name, so they can be cached forever.
    // Images keep stable names, so cache them for a week and revalidate in the background.
    if (/[\\/]fonts[\\/]/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(png|jpe?g|webp|avif|svg|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    }
  }
}));

// Initialize database and seed if needed
const initPromise = seedDatabase().catch(err => {
  console.error('Failed to seed database:', err);
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  initPromise.then(() => {
    app.listen(PORT, () => console.log(`Itqan server running on http://localhost:${PORT}`));
  });
}

// Export for Vercel serverless
module.exports = app;
