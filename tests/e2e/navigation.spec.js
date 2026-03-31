'use strict';
// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForHomeContent } = require('./helpers');

// ── Desktop navigation ────────────────────────────────────────────────────────
test.describe('Navigation — Desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForHomeContent(page);
  });

  test('clicking "services" link scrolls #services into view', async ({ page }) => {
    await page.locator('#navbar a[href="#services"]').click();
    await expect(page.locator('#services')).toBeInViewport({ ratio: 0.3 });
  });

  test('clicking "portfolio" link scrolls #portfolio into view', async ({ page }) => {
    await page.locator('#navbar a[href="#portfolio"]').click();
    await expect(page.locator('#portfolio')).toBeInViewport({ ratio: 0.3 });
  });

  test('clicking "about" link scrolls #about into view', async ({ page }) => {
    await page.locator('#navbar a[href="#about"]').click();
    await expect(page.locator('#about')).toBeInViewport({ ratio: 0.3 });
  });

  test('clicking "contact" link scrolls #contact into view', async ({ page }) => {
    await page.locator('#navbar a[href="#contact"]').click();
    await expect(page.locator('#contact')).toBeInViewport({ ratio: 0.3 });
  });

  // ── Language switch ─────────────────────────────────────────────────────
  test('#btn-en switches html[dir] to ltr', async ({ page }) => {
    await page.locator('#btn-en').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('#btn-ar restores html[dir] to rtl after switching to EN', async ({ page }) => {
    await page.locator('#btn-en').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await page.locator('#btn-ar').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('switching to EN changes nav link text (AR ≠ EN)', async ({ page }) => {
    const link = page.locator('#navbar a[href="#services"]').first();
    const arText = await link.innerText();

    await page.locator('#btn-en').click();

    const enText = await link.innerText();
    expect(enText.trim()).not.toEqual(arText.trim());
    expect(enText.trim().length).toBeGreaterThan(0);
  });

  test('hero CTA buttons link to #contact', async ({ page }) => {
    // Both primary and secondary hero buttons link to the contact section
    const cta = page.locator('#home a[href="#contact"]').first();
    await expect(cta).toBeVisible();
  });

  test('WhatsApp button href contains a valid wa.me number', async ({ page }) => {
    const href = await page.locator('#wa-btn').getAttribute('href');
    expect(href).toMatch(/wa\.me\/\d+/);
  });
});

// ── Mobile navigation ─────────────────────────────────────────────────────────
test.describe('Navigation — Mobile (390 × 844)', () => {
  // Override viewport for this entire describe block
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForHomeContent(page);
  });

  test('hamburger button is visible; desktop .nav-menu is hidden', async ({ page }) => {
    // Hamburger: onclick="toggleMobile()" — no id, but unique by its onclick
    await expect(page.locator('[onclick="toggleMobile()"]').first()).toBeVisible();
    // .nav-menu is hidden via CSS at ≤768 px
    await expect(page.locator('.nav-menu')).toBeHidden();
  });

  test('clicking hamburger reveals #mobile-menu', async ({ page }) => {
    await page.locator('[onclick="toggleMobile()"]').first().click();
    await expect(page.locator('#mobile-menu')).toBeVisible();
  });

  test('mobile menu contains all four section links', async ({ page }) => {
    await page.locator('[onclick="toggleMobile()"]').first().click();
    const menu = page.locator('#mobile-menu');
    for (const href of ['#services', '#portfolio', '#about', '#contact']) {
      await expect(menu.locator(`a[href="${href}"]`)).toBeVisible();
    }
  });

  test('clicking a mobile menu link hides the menu', async ({ page }) => {
    await page.locator('[onclick="toggleMobile()"]').first().click();
    await expect(page.locator('#mobile-menu')).toBeVisible();
    // The mobile-close button (×) or any nav link closes the menu
    await page.locator('#mobile-menu a[href="#contact"]').click();
    await expect(page.locator('#mobile-menu')).toBeHidden();
  });

  test('mobile language buttons #btn-ar-m and #btn-en-m are visible', async ({ page }) => {
    await expect(page.locator('#btn-ar-m')).toBeVisible();
    await expect(page.locator('#btn-en-m')).toBeVisible();
  });

  test('mobile EN button switches html[dir] to ltr', async ({ page }) => {
    await page.locator('#btn-en-m').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('mobile AR button restores html[dir] to rtl', async ({ page }) => {
    await page.locator('#btn-en-m').click();
    await page.locator('#btn-ar-m').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });
});
