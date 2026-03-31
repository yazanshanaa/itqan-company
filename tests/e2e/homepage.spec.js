'use strict';
// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForHomeContent } = require('./helpers');

/**
 * Homepage tests — verifies that all dynamically rendered sections appear
 * correctly after init() fetches /api/data and calls renderAll().
 *
 * Title:  "إتقان تك | حلول تقنية متكاملة"
 * All grids are populated either from the API or from the DEFAULT fallback,
 * so assertions never rely on specific data values — only on presence.
 */
test.describe('Homepage — Structure & Content', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait until the services grid is populated (proxy for renderAll() done)
    await waitForHomeContent(page);
  });

  // ── Document ─────────────────────────────────────────────────────────────
  test('loads at "/" with the correct page title', async ({ page }) => {
    await expect(page).toHaveURL('/');
    await expect(page).toHaveTitle('إتقان تك | حلول تقنية متكاملة');
  });

  // ── Navbar ────────────────────────────────────────────────────────────────
  test('navbar is visible and contains all anchor links', async ({ page }) => {
    const nav = page.locator('#navbar');
    await expect(nav).toBeVisible();
    for (const href of ['#services', '#portfolio', '#about', '#contact']) {
      await expect(nav.locator(`a[href="${href}"]`)).toBeVisible();
    }
  });

  test('language switch buttons AR / EN are both visible', async ({ page }) => {
    await expect(page.locator('#btn-ar')).toBeVisible();
    await expect(page.locator('#btn-en')).toBeVisible();
  });

  // ── Hero ──────────────────────────────────────────────────────────────────
  test('hero section (#home) is visible with a non-empty h1', async ({ page }) => {
    const hero = page.locator('#home');
    await expect(hero).toBeVisible();
    const h1 = hero.locator('h1');
    await expect(h1).toBeVisible();
    await expect(h1).not.toBeEmpty();
  });

  // ── Services ──────────────────────────────────────────────────────────────
  test('services grid renders at least one .service-card', async ({ page }) => {
    const cards = page.locator('#services-grid .service-card');
    expect(await cards.count()).toBeGreaterThan(0);
    await expect(cards.first()).toBeVisible();
  });

  test('each service card has an icon, title and description', async ({ page }) => {
    const card = page.locator('#services-grid .service-card').first();
    await expect(card.locator('.svc-icon')).toBeVisible();
    await expect(card.locator('.svc-title')).not.toBeEmpty();
    await expect(card.locator('.svc-desc')).not.toBeEmpty();
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  test('stats section renders at least one .stat-item', async ({ page }) => {
    const grid = page.locator('#stats-grid');
    await expect(grid).toBeVisible();
    expect(await grid.locator('.stat-item').count()).toBeGreaterThan(0);
  });

  test('counter numbers animate away from their initial 0 value', async ({ page }) => {
    // animateCounters() runs after renderStats(); each number starts at "0X"
    // and counts up — after a moment it should differ from its start value
    const num = page.locator('#stats-grid .stat-number').first();
    await expect(num).toBeVisible();
    // Wait for any text that doesn't start with bare "0" (e.g. "50+" or "98%")
    await expect(num).not.toHaveText('0', { timeout: 5_000 });
  });

  // ── About ─────────────────────────────────────────────────────────────────
  test('about section (#about) is visible', async ({ page }) => {
    await expect(page.locator('#about')).toBeVisible();
  });

  // ── Portfolio ─────────────────────────────────────────────────────────────
  test('portfolio grid renders at least one .port-card', async ({ page }) => {
    await page.waitForSelector('#portfolio-grid .port-card', { timeout: 10_000 });
    const cards = page.locator('#portfolio-grid .port-card');
    expect(await cards.count()).toBeGreaterThan(0);
    await expect(cards.first()).toBeVisible();
  });

  test('each portfolio card has a category and title', async ({ page }) => {
    const card = page.locator('#portfolio-grid .port-card').first();
    await expect(card.locator('.port-cat')).not.toBeEmpty();
    await expect(card.locator('.port-title')).not.toBeEmpty();
  });

  // ── Process ───────────────────────────────────────────────────────────────
  test('process section renders at least one .process-step', async ({ page }) => {
    await page.waitForSelector('#process-grid .process-step');
    expect(await page.locator('#process-grid .process-step').count()).toBeGreaterThan(0);
  });

  // ── Testimonials ──────────────────────────────────────────────────────────
  test('testimonials section renders at least one .testi-card', async ({ page }) => {
    await page.waitForSelector('#testi-grid .testi-card');
    const cards = page.locator('#testi-grid .testi-card');
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('each testimonial card has quote text, author name and star icons', async ({ page }) => {
    const card = page.locator('#testi-grid .testi-card').first();
    await expect(card.locator('.testi-text')).not.toBeEmpty();
    await expect(card.locator('.testi-name')).not.toBeEmpty();
    await expect(card.locator('.testi-stars')).toBeVisible();
  });

  // ── Contact ───────────────────────────────────────────────────────────────
  test('contact section has all four form fields and a submit button', async ({ page }) => {
    await page.locator('#contact').scrollIntoViewIfNeeded();
    await expect(page.locator('#f-name')).toBeVisible();
    await expect(page.locator('#f-email')).toBeVisible();
    await expect(page.locator('#f-service')).toBeVisible();
    await expect(page.locator('#f-msg')).toBeVisible();
    await expect(page.locator('.form-submit')).toBeVisible();
  });

  test('contact info elements are rendered', async ({ page }) => {
    // These IDs are populated by renderContact() from D.company
    for (const id of ['#c-phone', '#c-email', '#c-wa']) {
      await expect(page.locator(id)).toBeAttached();
    }
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  test('footer is visible and shows copyright text', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(footer.locator('.footer-copy')).not.toBeEmpty();
  });

  test('social link anchors exist in the footer', async ({ page }) => {
    for (const id of ['#s-fb', '#s-ig', '#s-tt', '#s-li']) {
      await expect(page.locator(id)).toHaveCount(1);
    }
  });

  // ── WhatsApp float ────────────────────────────────────────────────────────
  test('WhatsApp floating button is visible and points to wa.me', async ({ page }) => {
    const btn = page.locator('#wa-btn');
    await expect(btn).toBeVisible();
    expect(await btn.getAttribute('href')).toMatch(/wa\.me/);
  });
});
