require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const getClientIp = require('./lib/getClientIp');

// Fail fast if SESSION_SECRET is missing or weak
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('FATAL: SESSION_SECRET is missing or too short (min 32 chars). Set it in .env');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy when behind Nginx/reverse proxy
if (process.env.BEHIND_PROXY === 'true') app.set('trust proxy', 1);

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

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
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
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => console.log(`Itqan server running on http://localhost:${PORT}`));
