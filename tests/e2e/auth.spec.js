'use strict';
// @ts-check
const { test, expect } = require('@playwright/test');
const { ADMIN_PASS, loginAsAdmin, expectErrorToast } = require('./helpers');

/**
 * Authentication tests — login, logout, session, wrong password.
 *
 * Stable selectors (all from admin.html):
 *   #login-page    — login card wrapper
 *   #l-pass        — password input
 *   .login-btn     — submit button (class, not id)
 *   #login-err     — inline error message
 *   #admin-page    — main admin wrapper (gains no special class; just becomes visible)
 *   .logout-btn    — logout button (sidebar)
 *   .sidebar       — sidebar (visible only when logged in)
 *
 * Security notes verified:
 *   • Wrong-password 401 response must NOT include attemptsLeft field
 *   • Error text in #login-err must NOT mention attempt counts
 *   • Brute-force lockout tests live in brute-force.spec.js (skipped by default)
 *
 * Each test uses at most ONE failed login attempt, so the 5-attempt lockout
 * threshold is never reached within this file. A successful login resets
 * the server-side counter (lockouts.delete(ip)).
 */
test.describe.serial('Authentication', () => {

  // ── Unauthenticated state ──────────────────────────────────────────────────
  test('GET /api/auth/me → { admin:false } without a session', async ({ request }) => {
    const res = await request.get('/api/auth/me');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ admin: false });
  });

  test('/itqan-cp9x.html shows login form; sidebar is absent', async ({ page }) => {
    await page.goto('/itqan-cp9x.html');
    await expect(page.locator('#login-page')).toBeVisible();
    await expect(page.locator('#l-pass')).toBeVisible();
    await expect(page.locator('.login-btn')).toBeVisible();
    // Sidebar is part of #admin-page which should be hidden
    await expect(page.locator('.sidebar')).toBeHidden();
  });

  // ── Wrong password ─────────────────────────────────────────────────────────
  test('wrong password: #login-err is shown; no attempt-count hint', async ({ page }) => {
    await page.goto('/itqan-cp9x.html');
    await page.locator('#l-pass').fill('completelyWrongPassword_playwright');
    await page.locator('.login-btn').click();

    const err = page.locator('#login-err');
    await expect(err).toBeVisible({ timeout: 5_000 });
    await expect(err).not.toBeEmpty();

    // Security: UI must not reveal how many attempts remain
    const text = await err.innerText();
    expect(text).not.toMatch(/\d+\s*(attempt|محاولة)/i);
    expect(text).not.toMatch(/remaining|متبق/i);
  });

  test('POST /api/auth/login wrong password → 401 { error:"wrong" }, no attemptsLeft', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { password: 'wrongPass_auth_spec' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('wrong');
    // attemptsLeft was explicitly removed from the 401 response for security
    expect(body).not.toHaveProperty('attemptsLeft');
  });

  // ── Successful login ───────────────────────────────────────────────────────
  // A successful login calls lockouts.delete(ip) on the server, resetting
  // the failed-attempt counter to 0.
  test('correct password: login page hides; sidebar becomes visible', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.locator('#login-page')).toBeHidden();
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  test('GET /api/auth/me → { admin:true } after browser login', async ({ page }) => {
    await loginAsAdmin(page);
    // page.request shares the same session cookie as the browser
    const res = await page.request.get('/api/auth/me');
    expect((await res.json()).admin).toBe(true);
  });

  test('Enter key on #l-pass submits the login form', async ({ page }) => {
    await page.goto('/itqan-cp9x.html');
    await page.locator('#l-pass').fill(ADMIN_PASS);
    await page.locator('#l-pass').press('Enter');
    await expect(page.locator('#login-page')).toBeHidden({ timeout: 8_000 });
  });

  // ── Logout ────────────────────────────────────────────────────────────────
  test('.logout-btn shows login page again', async ({ page }) => {
    await loginAsAdmin(page);
    await page.locator('.logout-btn').click();
    await expect(page.locator('#login-page')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.sidebar')).toBeHidden();
  });

  test('GET /api/auth/me → { admin:false } after logout', async ({ page }) => {
    await loginAsAdmin(page);
    await page.locator('.logout-btn').click();
    await expect(page.locator('#login-page')).toBeVisible({ timeout: 5_000 });

    const res = await page.request.get('/api/auth/me');
    expect((await res.json()).admin).toBe(false);
  });

  test('POST /api/auth/logout → 200 { ok:true }', async ({ request }) => {
    await request.post('/api/auth/login', { data: { password: ADMIN_PASS } });
    const res = await request.post('/api/auth/logout', { data: {} });
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  // ── Protected routes without session ─────────────────────────────────────
  test('PUT /api/data without session → 401', async ({ request }) => {
    const res = await request.put('/api/data', {
      data: { company: { nameAr: 'hack' } },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/auth/change-password without session → 401', async ({ request }) => {
    const res = await request.post('/api/auth/change-password', {
      data: { oldPassword: 'x', newPassword: 'y' },
    });
    expect(res.status()).toBe(401);
  });
});
