'use strict';
// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * ⚠️  ISOLATED — Never run this file as part of the main suite.
 *
 * This file intentionally triggers the IP-based brute-force lockout
 * (5 wrong passwords → 15-minute ban on the server's in-memory Map).
 * Once the lockout fires, ALL tests that need admin login will return 429
 * for up to 15 minutes — until the server restarts or the timer expires.
 *
 * How to opt-in:
 *   RUN_LOCKOUT_TESTS=1 npx playwright test brute-force.spec.js
 *
 * All tests here are skipped unless RUN_LOCKOUT_TESTS=1 is set.
 * They are also marked as serial so they run in order.
 */

const ENABLED = !!process.env.RUN_LOCKOUT_TESTS;

test.describe.serial('Brute-Force Lockout (opt-in / isolated)', () => {
  test('5-6 wrong passwords trigger 429 { error:"locked", remaining:<number> }', async ({ request }) => {
    test.skip(!ENABLED, 'Set  RUN_LOCKOUT_TESTS=1  to enable this test');

    const wrong = { password: 'WRONG__playwright_lockout_trigger' };
    let lockedBody = null;

    for (let i = 0; i < 7; i++) {
      const res = await request.post('/api/auth/login', { data: wrong });
      if (res.status() === 429) {
        lockedBody = await res.json();
        break;
      }
    }

    expect(lockedBody, 'Lockout was never triggered within 7 attempts').not.toBeNull();
    expect(lockedBody.error).toBe('locked');
    expect(typeof lockedBody.remaining).toBe('number');
    expect(lockedBody.remaining).toBeGreaterThan(0);
    expect(lockedBody.remaining).toBeLessThanOrEqual(15 * 60);  // max 15 min
  });

  test('correct password is ALSO rejected while IP is locked', async ({ request }) => {
    test.skip(!ENABLED, 'Set  RUN_LOCKOUT_TESTS=1  to enable this test');
    // Assumes the lockout was triggered by the previous test in the serial group
    const res = await request.post('/api/auth/login', {
      data: { password: process.env.TEST_ADMIN_PASS || 'itqan2024' },
    });
    expect(res.status()).toBe(429);
    expect((await res.json()).error).toBe('locked');
  });

  test('429 response carries a positive remaining time in seconds', async ({ request }) => {
    test.skip(!ENABLED, 'Set  RUN_LOCKOUT_TESTS=1  to enable this test');
    const res = await request.post('/api/auth/login', {
      data: { password: 'anything' },
    });
    if (res.status() === 429) {
      const body = await res.json();
      expect(body.remaining).toBeGreaterThan(0);
    } else {
      test.skip(true, 'IP lock not active — run the trigger test first');
    }
  });
});
