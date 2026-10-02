const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const INDEX_FILE = path.join(__dirname, '../public/index.html');
const SITE_URL_TOKEN = /__SITE_URL__/g;
const SAFE_HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

// Absolute origin used in canonical, Open Graph, JSON-LD, robots.txt and sitemap.xml.
// Prefer SITE_URL (e.g. https://itqan.tech); otherwise derive it from the request.
function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const host = req.get('host') || '';
  if (!SAFE_HOST.test(host)) return '';
  return `${req.protocol}://${host}`;
}

let indexTemplate = null;
function renderIndex(req) {
  if (!indexTemplate || process.env.NODE_ENV !== 'production') {
    indexTemplate = fs.readFileSync(INDEX_FILE, 'utf8');
  }
  return indexTemplate.replace(SITE_URL_TOKEN, siteUrl(req));
}

router.get(['/', '/index.html'], (req, res) => {
  res.type('html').send(renderIndex(req));
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    'User-agent: *\n' +
    'Allow: /\n' +
    'Disallow: /api/\n\n' +
    `Sitemap: ${siteUrl(req)}/sitemap.xml\n`
  );
});

router.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `  <url><loc>${siteUrl(req)}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>\n` +
    '</urlset>\n'
  );
});

module.exports = router;
