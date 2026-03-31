const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const getClientIp = require('../lib/getClientIp');

const router = express.Router();
const PASS_FILE = path.join(__dirname, '../data/password.txt');

// In-memory IP lockout: { ip: { attempts, lockedUntil } }
const lockouts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// Prune expired lockout entries every 10 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, r] of lockouts) {
    if (r.lockedUntil && r.lockedUntil <= now) lockouts.delete(ip);
  }
}, 10 * 60 * 1000).unref();

function getRecord(ip) {
  if (!lockouts.has(ip)) lockouts.set(ip, { attempts: 0, lockedUntil: 0 });
  return lockouts.get(ip);
}

function isLocked(ip) {
  const r = getRecord(ip);
  if (r.lockedUntil > Date.now()) return true;
  if (r.lockedUntil && r.lockedUntil <= Date.now()) {
    // Lockout expired — reset
    lockouts.delete(ip);
  }
  return false;
}

function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// GET /api/auth/me
router.get('/me', (req, res) => {
  res.json({ admin: req.session.admin === true });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const ip = getClientIp(req);
  if (isLocked(ip)) {
    const r = getRecord(ip);
    const remaining = Math.ceil((r.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({ error: 'locked', remaining });
  }

  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  let hash;
  try {
    hash = fs.readFileSync(PASS_FILE, 'utf8').trim();
  } catch {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const ok = await bcrypt.compare(password, hash);
  if (!ok) {
    const r = getRecord(ip);
    r.attempts += 1;
    if (r.attempts >= MAX_ATTEMPTS) {
      r.lockedUntil = Date.now() + LOCKOUT_MS;
      return res.status(429).json({ error: 'locked', remaining: 15 });
    }
    return res.status(401).json({ error: 'wrong' });
  }

  // Success — regenerate session to prevent session fixation
  lockouts.delete(ip);
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    req.session.admin = true;
    res.json({ ok: true });
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Both fields required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password too short (min 8)' });

  let hash;
  try {
    hash = fs.readFileSync(PASS_FILE, 'utf8').trim();
  } catch {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const ok = await bcrypt.compare(oldPassword, hash);
  if (!ok) return res.status(401).json({ error: 'Old password is incorrect' });

  const newHash = await bcrypt.hash(newPassword, 10);
  fs.writeFileSync(PASS_FILE, newHash);
  res.json({ ok: true });
});

module.exports = router;
module.exports.requireAuth = requireAuth;
