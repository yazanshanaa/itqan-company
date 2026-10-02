'use strict';

/**
 * Shared helpers for all Itqan E2E test suites.
 *
 * Admin password:  set  TEST_ADMIN_PASS=yourPassword  or leave blank to use
 * the project default.
 */
const ADMIN_PASS = process.env.TEST_ADMIN_PASS || 'itqan2024';

/**
 * Navigate to /itqan-cp9x.html and authenticate.
 * Resolves once the login page is hidden (server session established).
 *
 * Selectors used (stable IDs from admin.html):
 *   #login-page  — the login card wrapper
 *   #l-pass      — password input
 *   .login-btn   — the submit button (class, not id)
 *
 * @param {import('@playwright/test').Page} page
 */
async function loginAsAdmin(page) {
  await page.goto('/itqan-cp9x.html');
  await page.locator('#login-page').waitFor({ state: 'visible' });
  await page.locator('#l-pass').fill(ADMIN_PASS);
  await page.locator('.login-btn').click();
  // server.js: session.regenerate() → { ok:true }
  // admin.html JS: login-page gets display:none
  await page.locator('#login-page').waitFor({ state: 'hidden', timeout: 8_000 });
}

/**
 * Wait until index.html's init() has fetched /api/data and rendered all grids.
 * Uses the services grid as the indicator — it's always populated (DEFAULT
 * fallback kicks in even if the API is unreachable).
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForHomeContent(page) {
  await page.waitForSelector('#services-grid .service-card', { timeout: 10_000 });
}

/**
 * Assert the green success toast is visible.
 * #toast gets class "show" when showToast() is called.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout=6000]
 */
async function expectSuccessToast(page, timeout = 6_000) {
  const { expect } = require('@playwright/test');
  const toast = page.locator('#toast.show');
  await expect(toast).toBeVisible({ timeout });
  // Success toasts use #34D399. The toast has `transition: all .4s`, so a one-off
  // getComputedStyle read can land mid-fade from the previous toast's colour;
  // toHaveCSS retries until the final colour is reached.
  await expect(toast).toHaveCSS('background-color', 'rgb(52, 211, 153)', { timeout });
}

/**
 * Assert an error (red) toast is visible.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout=6000]
 */
async function expectErrorToast(page, timeout = 6_000) {
  const { expect } = require('@playwright/test');
  const toast = page.locator('#toast.show');
  await expect(toast).toBeVisible({ timeout });
  // Error toasts use #EF4444 (retrying for the same transition reason as above)
  await expect(toast).toHaveCSS('background-color', 'rgb(239, 68, 68)', { timeout });
}

module.exports = { ADMIN_PASS, loginAsAdmin, waitForHomeContent, expectSuccessToast, expectErrorToast };
