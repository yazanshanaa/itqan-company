'use strict';
// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForHomeContent, expectSuccessToast, expectErrorToast } = require('./helpers');

/**
 * Contact form — UI and API tests.
 *
 * Form fields (stable IDs):
 *   #f-name    text      required
 *   #f-email   email     required
 *   #f-service select    optional
 *   #f-msg     textarea  required
 *   .form-submit  button  onclick="sendForm()"
 *
 * API:  POST /api/contact
 *   Validation: name, email (regex), message all required
 *   Rate limit: 5 requests / minute / IP → 429
 *
 * ⚠️  The rate-limit test is intentionally last in this file.
 * After it runs, POST /api/contact will be throttled for ≤60 s.
 * The files that follow alphabetically (homepage, navigation) make no
 * contact API requests, so it does not affect the suite.
 */

const VALID_PAYLOAD = {
  name: 'Playwright Test',
  email: 'playwright@test.dev',
  message: 'Automated E2E submission — please ignore.',
  service: 'Testing',
};

// ── UI Tests ──────────────────────────────────────────────────────────────────
test.describe('Contact Form — UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForHomeContent(page);
    await page.locator('#contact').scrollIntoViewIfNeeded();
  });

  test('all form fields and submit button are visible', async ({ page }) => {
    await expect(page.locator('#f-name')).toBeVisible();
    await expect(page.locator('#f-email')).toBeVisible();
    await expect(page.locator('#f-service')).toBeVisible();
    await expect(page.locator('#f-msg')).toBeVisible();
    await expect(page.locator('.form-submit')).toBeVisible();
  });

  test('submitting an empty form triggers required validation on #f-name', async ({ page }) => {
    await page.locator('.form-submit').click();
    const valid = await page.locator('#f-name').evaluate((el) => el.validity.valid);
    expect(valid).toBe(false);
  });

  test('invalid email format fails email validity check', async ({ page }) => {
    await page.locator('#f-name').fill('Test User');
    await page.locator('#f-email').fill('not-an-email');
    await page.locator('#f-msg').fill('Hello');
    await page.locator('.form-submit').click();
    const valid = await page.locator('#f-email').evaluate((el) => el.validity.valid);
    expect(valid).toBe(false);
  });

  test('service dropdown has at least 2 options (placeholder + real options)', async ({ page }) => {
    // Options: "اختر الخدمة...", "موقع ويب", "تطبيق موبايل", …
    const options = page.locator('#f-service option');
    expect(await options.count()).toBeGreaterThan(1);
  });

  test('valid form shows a success toast after submission', async ({ page }) => {
    await page.locator('#f-name').fill(VALID_PAYLOAD.name);
    await page.locator('#f-email').fill(VALID_PAYLOAD.email);
    await page.locator('#f-msg').fill(VALID_PAYLOAD.message);
    // Select first real option (index 1 = "موقع ويب")
    await page.locator('#f-service').selectOption({ index: 1 });

    await page.locator('.form-submit').click();

    // sendForm() calls showToast() with green color on success
    await expectSuccessToast(page, 8_000);
  });

  test('form fields are cleared after a successful submission', async ({ page }) => {
    await page.locator('#f-name').fill(VALID_PAYLOAD.name);
    await page.locator('#f-email').fill(VALID_PAYLOAD.email);
    await page.locator('#f-msg').fill(VALID_PAYLOAD.message);
    await page.locator('#f-service').selectOption({ index: 1 });

    await page.locator('.form-submit').click();
    await expectSuccessToast(page, 8_000);

    await expect(page.locator('#f-name')).toHaveValue('');
    await expect(page.locator('#f-email')).toHaveValue('');
    await expect(page.locator('#f-msg')).toHaveValue('');
  });
});

// ── API Tests ─────────────────────────────────────────────────────────────────
test.describe('Contact Form — API', () => {
  test('POST with empty name → 400', async ({ request }) => {
    const res = await request.post('/api/contact', {
      data: { name: '', email: 'ok@ok.com', message: 'Hello' },
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toHaveProperty('error');
  });

  test('POST with empty email → 400', async ({ request }) => {
    const res = await request.post('/api/contact', {
      data: { name: 'Test', email: '', message: 'Hello' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST with empty message → 400', async ({ request }) => {
    const res = await request.post('/api/contact', {
      data: { name: 'Test', email: 'ok@ok.com', message: '' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST with malformed email → 400', async ({ request }) => {
    const res = await request.post('/api/contact', {
      data: { name: 'Test', email: 'bad@@email', message: 'Hi' },
    });
    expect(res.status()).toBe(400);
  });

  test('valid POST → 200 { ok: true }', async ({ request }) => {
    const res = await request.post('/api/contact', { data: VALID_PAYLOAD });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  // ⚠️  Must be the very last test in this file.
  // It deliberately exhausts the per-minute rate limit.
  // homepage.spec.js and navigation.spec.js (which run after) never hit
  // POST /api/contact, so the 60-second window expires naturally.
  test('rate limit: 429 after 5 requests per minute', async ({ request }) => {
    let blocked = false;
    for (let i = 0; i < 10; i++) {
      const res = await request.post('/api/contact', { data: VALID_PAYLOAD });
      if (res.status() === 429) {
        blocked = true;
        const body = await res.json();
        expect(body).toHaveProperty('error');
        break;
      }
    }
    expect(blocked).toBe(true);
  });
});
