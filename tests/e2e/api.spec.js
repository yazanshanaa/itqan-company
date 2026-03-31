'use strict';
// @ts-check
const { test, expect } = require('@playwright/test');
const { ADMIN_PASS } = require('./helpers');

/**
 * Direct API tests — all via Playwright's APIRequestContext (no browser).
 * Covers: public endpoints, auth flow, data CRUD, security headers, CSRF.
 *
 * The request fixture automatically manages cookies within each test, so
 * login → subsequent requests share the session cookie without extra work.
 */

// ── Public endpoints ──────────────────────────────────────────────────────────
test.describe('Public Endpoints', () => {
  test('GET / → 200 with HTML doctype', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('<!DOCTYPE html');
  });

  test('GET /itqan-cp9x.html → 200', async ({ request }) => {
    const res = await request.get('/itqan-cp9x.html');
    expect(res.status()).toBe(200);
  });

  test('GET /api/auth/me → { admin:false } without session', async ({ request }) => {
    const res = await request.get('/api/auth/me');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ admin: false });
  });

  test('GET /api/data → 200 with all required top-level keys', async ({ request }) => {
    const res = await request.get('/api/data');
    expect(res.status()).toBe(200);
    const data = await res.json();
    for (const key of ['company', 'content', 'services', 'stats', 'portfolio', 'process', 'testimonials']) {
      expect(data, `missing key: ${key}`).toHaveProperty(key);
    }
  });

  test('GET /api/data → company.email is stripped (security)', async ({ request }) => {
    // routes/data.js strips email from the public GET to prevent scraping
    const data = await (await request.get('/api/data')).json();
    expect(data.company).not.toHaveProperty('email');
  });

  test('GET /api/data → services array is non-empty', async ({ request }) => {
    const data = await (await request.get('/api/data')).json();
    // services may be { ar: [...], en: [...] } or a flat array
    const svcs = Array.isArray(data.services)
      ? data.services
      : (data.services?.ar ?? []);
    expect(svcs.length).toBeGreaterThan(0);
  });
});

// ── Auth API ──────────────────────────────────────────────────────────────────
test.describe('Auth API', () => {
  test('wrong password → 401 { error:"wrong" }, no attemptsLeft field', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { password: 'playwright_wrong_api_spec' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('wrong');
    expect(body).not.toHaveProperty('attemptsLeft');
  });

  test('correct password → 200 { ok:true } + session cookie', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { password: ADMIN_PASS },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);

    // Verify the session cookie was set
    const state = await request.storageState();
    const sid = state.cookies.find((c) => c.name === 'connect.sid');
    expect(sid).toBeDefined();
  });

  test('GET /api/auth/me → { admin:true } after login', async ({ request }) => {
    await request.post('/api/auth/login', { data: { password: ADMIN_PASS } });
    const res = await request.get('/api/auth/me');
    expect((await res.json()).admin).toBe(true);
  });

  test('POST /api/auth/logout → 200 { ok:true }', async ({ request }) => {
    await request.post('/api/auth/login', { data: { password: ADMIN_PASS } });
    const res = await request.post('/api/auth/logout', { data: {} });
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  test('GET /api/auth/me → { admin:false } after logout', async ({ request }) => {
    await request.post('/api/auth/login', { data: { password: ADMIN_PASS } });
    await request.post('/api/auth/logout', { data: {} });
    const me = await request.get('/api/auth/me');
    expect((await me.json()).admin).toBe(false);
  });
});

// ── Protected Data API ────────────────────────────────────────────────────────
test.describe('Protected Data API', () => {
  test('PUT /api/data without session → 401', async ({ request }) => {
    const res = await request.put('/api/data', {
      data: { company: { nameAr: 'hack' } },
    });
    expect(res.status()).toBe(401);
  });

  test('PUT /api/data without "company" key → 400', async ({ request }) => {
    await request.post('/api/auth/login', { data: { password: ADMIN_PASS } });
    const res = await request.put('/api/data', {
      data: { services: [] }, // missing required "company" key
    });
    expect(res.status()).toBe(400);
  });

  test('authenticated PUT /api/data with valid body → 200 { ok:true }', async ({ request }) => {
    await request.post('/api/auth/login', { data: { password: ADMIN_PASS } });

    // Fetch current data and PUT it back unchanged (round-trip test)
    const current = await (await request.get('/api/data')).json();
    const res = await request.put('/api/data', {
      // Restore company.email (stripped from GET, needed for PUT)
      data: { ...current, company: { ...current.company, email: 'test@playwright.dev' } },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  test('POST /api/auth/change-password without session → 401', async ({ request }) => {
    const res = await request.post('/api/auth/change-password', {
      data: { oldPassword: 'x', newPassword: 'y' },
    });
    expect(res.status()).toBe(401);
  });
});

// ── Security Headers ──────────────────────────────────────────────────────────
test.describe('Security Headers', () => {
  test('X-Frame-Options: SAMEORIGIN', async ({ request }) => {
    const headers = (await request.get('/')).headers();
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  test('X-Content-Type-Options: nosniff', async ({ request }) => {
    const headers = (await request.get('/')).headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
  });

  test('X-XSS-Protection header is present', async ({ request }) => {
    const headers = (await request.get('/')).headers();
    expect(headers['x-xss-protection']).toBeTruthy();
  });

  test('/itqan-cp9x.html has X-Robots-Tag: noindex', async ({ request }) => {
    const headers = (await request.get('/itqan-cp9x.html')).headers();
    expect(headers['x-robots-tag']).toMatch(/noindex/i);
  });
});

// ── CSRF Protection ───────────────────────────────────────────────────────────
test.describe('CSRF Protection', () => {
  /**
   * server.js CSRF check:
   *   const originHost = new URL(originHeader).host;
   *   if (originHost !== req.headers.host) → 403
   *
   * When no Origin/Referer header is present the check is skipped (API clients).
   * We explicitly set a foreign origin to trigger the guard.
   */
  test('POST /api/auth/login with foreign Origin → 403', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { password: 'anything' },
      headers: { origin: 'http://evil.example.com' },
    });
    expect(res.status()).toBe(403);
  });

  test('PUT /api/data with foreign Origin → 403', async ({ request }) => {
    const res = await request.put('/api/data', {
      data: { company: {} },
      headers: { origin: 'http://evil.example.com' },
    });
    expect(res.status()).toBe(403);
  });

  test('POST /api/contact with foreign Origin → 403', async ({ request }) => {
    const res = await request.post('/api/contact', {
      data: { name: 'X', email: 'x@x.com', message: 'csrf' },
      headers: { origin: 'http://attacker.example.com' },
    });
    expect(res.status()).toBe(403);
  });

  test('POST with matching Origin (localhost:3000) is NOT rejected', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { password: 'somepass' },
      headers: { origin: 'http://localhost:3000' },
    });
    // 401 = wrong password — that means CSRF check passed. Correct.
    expect(res.status()).not.toBe(403);
  });
});
