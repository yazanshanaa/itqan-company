const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const INDEX_FILE = path.join(__dirname, '../public/index.html');
const DATA_FILE = path.join(__dirname, '../data/site.json');
const SITE_URL_TOKEN = /__SITE_URL__/g;
const SAFE_HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

// Head metadata for the English page (/en/). The Arabic values live in public/index.html.
const EN = {
  title: 'Itqan Tech | Web & App Development and n8n Automation in Jenin',
  description: 'Itqan Tech (إتقان تك) builds websites and apps, automates businesses with n8n, and provides cybersecurity and digital marketing services in Barta\'a and Jenin.',
  imageAlt: 'Itqan Tech (إتقان تك): We build your digital future',
};

// Absolute origin used in canonical, hreflang, Open Graph, JSON-LD, robots.txt and sitemap.xml.
// SITE_URL overrides it. Production and preview deployments use the real domain (so previews
// never compete with it); local, dev and test servers use the request's own origin.
const PRODUCTION_ORIGIN = 'https://itqantech.io';
const isDeployed = () =>
  process.env.NODE_ENV === 'production' || ['production', 'preview'].includes(process.env.VERCEL_ENV);

function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  if (isDeployed()) return PRODUCTION_ORIGIN;
  const host = req.get('host') || '';
  if (!SAFE_HOST.test(host)) return '';
  // req.protocol comes from X-Forwarded-Proto behind a proxy: never echo it raw
  return `${req.protocol === 'https' ? 'https' : 'http'}://${host}`;
}

const escText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => escText(s).replace(/"/g, '&quot;');

const cache = {};
function readCached(file, parse) {
  if (!cache[file] || process.env.NODE_ENV !== 'production') {
    const raw = fs.readFileSync(file, 'utf8');
    cache[file] = parse ? parse(raw) : raw;
  }
  return cache[file];
}

// Swap the Arabic head metadata for English and pre-render the English UI strings
// (the same ones the page's JS applies), so /en/ is English before any script runs.
function toEnglish(html) {
  const swaps = [
    [/<title>[^<]*<\/title>/, `<title>${escText(EN.title)}</title>`],
    [/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escAttr(EN.description)}">`],
    [/<link rel="canonical" href="([^"]*)\/">/, '<link rel="canonical" href="$1/en/">'],
    [/<meta property="og:locale" content="ar_AR">\n(\s*)<meta property="og:locale:alternate" content="en_US">/,
      '<meta property="og:locale" content="en_US">\n$1<meta property="og:locale:alternate" content="ar_AR">'],
    [/<meta property="og:url" content="([^"]*)\/">/, '<meta property="og:url" content="$1/en/">'],
    [/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escAttr(EN.title)}">`],
    [/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escAttr(EN.description)}">`],
    [/<meta property="og:image:alt" content="[^"]*">/, `<meta property="og:image:alt" content="${escAttr(EN.imageAlt)}">`],
    [/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${escAttr(EN.title)}">`],
    [/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${escAttr(EN.description)}">`],
    [/<meta name="twitter:image:alt" content="[^"]*">/, `<meta name="twitter:image:alt" content="${escAttr(EN.imageAlt)}">`],
  ];
  for (const [re, rep] of swaps) {
    if (!re.test(html)) console.warn('[seo] /en/ head tag not found:', re);
    html = html.replace(re, rep);
  }
  let strings = {};
  try { strings = readCached(DATA_FILE, JSON.parse).content.en || {}; } catch { /* JS renders them anyway */ }
  // Markup only: the inline script has data-key templates of its own that must stay intact
  return html.split(/(<script\b[\s\S]*?<\/script>)/).map((part, i) => (i % 2 ? part :
    part.replace(/(<(\w+)\b[^>]*\sdata-key="([^"]+)"[^>]*>)[\s\S]*?(<\/\2>)/g,
      (m, open, tag, key, close) => (strings[key] ? open + escText(strings[key]) + close : m)))).join('');
}

function renderIndex(req, lang) {
  const base = siteUrl(req);
  // Replacer function: a `$` in SITE_URL must never act as a replacement pattern
  let html = readCached(INDEX_FILE).replace(SITE_URL_TOKEN, () => base);
  const arTitle = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  // Both titles ride along so the language toggle can update the tab title
  html = html.replace('<html lang="ar" dir="rtl" id="html-root">',
    `<html lang="${lang}" dir="${lang === 'en' ? 'ltr' : 'rtl'}" id="html-root" data-title-ar="${arTitle.replace(/"/g, '&quot;')}" data-title-en="${escAttr(EN.title)}">`);
  return lang === 'en' ? toEnglish(html) : html;
}

router.get(['/', '/index.html'], (req, res) => {
  res.type('html').send(renderIndex(req, 'ar'));
});

// Express routing is neither strict nor case-sensitive: '/en', '/EN/', ... all land here,
// and everything but the exact canonical '/en/' is redirected to it
router.get('/en', (req, res) => {
  if (req.path !== '/en/') return res.redirect(301, '/en/' + req.originalUrl.slice(req.path.length));
  res.type('html').send(renderIndex(req, 'en'));
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    'User-agent: *\n' +
    'Allow: /\n' +
    // The page renders from /api/data; crawlers must be able to fetch it to see real content
    'Allow: /api/data\n' +
    'Disallow: /api/\n\n' +
    `Sitemap: ${siteUrl(req)}/sitemap.xml\n`
  );
});

router.get('/sitemap.xml', (req, res) => {
  const base = siteUrl(req);
  const alternates =
    `<xhtml:link rel="alternate" hreflang="ar" href="${base}/"/>` +
    `<xhtml:link rel="alternate" hreflang="en" href="${base}/en/"/>` +
    `<xhtml:link rel="alternate" hreflang="x-default" href="${base}/"/>`;
  res.type('application/xml').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    `  <url><loc>${base}/</loc><changefreq>monthly</changefreq><priority>1.0</priority>${alternates}</url>\n` +
    `  <url><loc>${base}/en/</loc><changefreq>monthly</changefreq><priority>0.8</priority>${alternates}</url>\n` +
    '</urlset>\n'
  );
});

module.exports = router;
