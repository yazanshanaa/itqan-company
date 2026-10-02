'use strict';
// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForHomeContent } = require('./helpers');

/**
 * SEO plumbing served by routes/seo.js: per-language URLs, head metadata,
 * hreflang, structured data, robots.txt, sitemap.xml and static asset URLs.
 */
const AR_TITLE = 'إتقان تك | تطوير مواقع وتطبيقات وأتمتة n8n في جنين';
const EN_TITLE = 'Itqan Tech | Web & App Development and n8n Automation in Jenin';

test.describe('SEO — head metadata', () => {
  test('/ is Arabic with canonical, hreflang, Open Graph and JSON-LD', async ({ page, baseURL }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page).toHaveTitle(AR_TITLE);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${baseURL}/`);
    await expect(page.locator('link[hreflang="ar"]')).toHaveAttribute('href', `${baseURL}/`);
    await expect(page.locator('link[hreflang="en"]')).toHaveAttribute('href', `${baseURL}/en/`);
    await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute('href', `${baseURL}/`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /إتقان تك/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${baseURL}/img/og-image.jpg`);

    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    const types = ld['@graph'].map((n) => n['@type']);
    expect(types).toEqual(expect.arrayContaining(['Organization', 'LocalBusiness', 'WebSite']));
    const biz = ld['@graph'].find((n) => n['@type'] === 'LocalBusiness');
    expect(biz.name).toBe('إتقان تك - Itqan Tech');
    expect(biz.address.addressLocality).toBe('برطعة');
  });

  test('/en/ is English with its own canonical and pre-rendered English text', async ({ page, request, baseURL }) => {
    // Raw HTML (before any script) already carries the English metadata and UI strings
    const html = await (await request.get('/en/')).text();
    expect(html).toContain('<html lang="en" dir="ltr"');
    expect(html).toContain('data-key="nav.services">Services<');

    await page.goto('/en/');
    await expect(page).toHaveTitle(EN_TITLE);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${baseURL}/en/`);
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'en_US');
    await waitForHomeContent(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('#navbar .nav-menu a[href="#services"]')).toHaveText('Services');
  });

  test('/en redirects permanently to /en/', async ({ request }) => {
    const res = await request.get('/en', { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()['location']).toBe('/en/');
  });
});

test.describe('SEO — language toggle keeps URL and title in sync', () => {
  test('EN then AR switches /en/ <-> / without reloading', async ({ page }) => {
    await page.goto('/');
    await waitForHomeContent(page);
    await page.locator('#btn-en').click();
    await expect(page).toHaveURL(/\/en\/$/);
    await expect(page).toHaveTitle(EN_TITLE);
    await page.locator('#btn-ar').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page).toHaveTitle(AR_TITLE);
  });
});

test.describe('SEO — crawl files and assets', () => {
  test('robots.txt allows the site, blocks /api/ and points to the sitemap', async ({ request, baseURL }) => {
    const body = await (await request.get('/robots.txt')).text();
    expect(body).toContain('Disallow: /api/');
    expect(body).toContain(`Sitemap: ${baseURL}/sitemap.xml`);
    expect(body).not.toContain('itqan-cp9x');
  });

  test('sitemap.xml lists both languages with hreflang alternates', async ({ request, baseURL }) => {
    const body = await (await request.get('/sitemap.xml')).text();
    expect(body).toContain(`<loc>${baseURL}/</loc>`);
    expect(body).toContain(`<loc>${baseURL}/en/</loc>`);
    expect(body).toContain(`hreflang="en" href="${baseURL}/en/"`);
  });

  test('favicon, OG image and the renamed logo are served; the old logo URL redirects', async ({ request }) => {
    for (const path of ['/favicon.ico', '/apple-touch-icon.png', '/img/og-image.jpg', '/img/logo.png']) {
      expect((await request.get(path)).status(), path).toBe(200);
    }
    const old = await request.get('/img/orginal.png', { maxRedirects: 0 });
    expect(old.status()).toBe(301);
    expect(old.headers()['location']).toBe('/img/logo.png');
  });

  test('admin page is marked noindex', async ({ request }) => {
    const res = await request.get('/itqan-cp9x.html');
    expect(res.headers()['x-robots-tag']).toContain('noindex');
    expect(await res.text()).toContain('<meta name="robots" content="noindex, nofollow">');
  });
});
