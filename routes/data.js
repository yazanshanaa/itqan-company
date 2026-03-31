const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('./auth');

const router = express.Router();
const DATA_FILE = path.join(__dirname, '../data/site.json');

// GET /api/data — public (strips company.email); authenticated admin gets the full record
router.get('/', (req, res) => {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // Strip email from public response to prevent scraping.
    // Skip the strip when the request comes from an authenticated admin session
    // so that saveAll() in admin.html never overwrites email with an empty string.
    if (!req.session?.admin && raw.company) {
      const { email: _stripped, ...safeCompany } = raw.company;
      raw.company = safeCompany;
    }
    res.json(raw);
  } catch {
    res.status(500).json({ error: 'Could not read site data' });
  }
});

// PUT /api/data — requires admin session
router.put('/', requireAuth, (req, res) => {
  const body = req.body;
  // Validate top-level structure
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Invalid data: expected object' });
  }
  const required = ['company', 'content', 'services', 'stats', 'portfolio'];
  for (const key of required) {
    if (!body[key] || typeof body[key] !== 'object') {
      return res.status(400).json({ error: `Invalid data: missing or invalid key "${key}"` });
    }
  }
  // Validate array fields
  const arrays = ['services', 'stats', 'portfolio', 'process', 'aboutPoints'];
  for (const key of arrays) {
    if (body[key]) {
      for (const lang of ['ar', 'en']) {
        if (body[key][lang] !== undefined && !Array.isArray(body[key][lang])) {
          return res.status(400).json({ error: `Invalid data: ${key}.${lang} must be an array` });
        }
      }
    }
  }
  try {
    const json = JSON.stringify(body, null, 2);
    if (json.length > 500000) {
      return res.status(400).json({ error: 'Data too large' });
    }
    fs.writeFileSync(DATA_FILE, json);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Could not save site data' });
  }
});

module.exports = router;
