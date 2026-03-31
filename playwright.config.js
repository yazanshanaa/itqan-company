'use strict';
// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Itqan Tech — Playwright E2E Configuration
 *
 * Execution order (alphabetical inside tests/e2e/):
 *   admin.spec.js        – authenticated CRUD; uses correct password only
 *   api.spec.js          – 1 wrong + 1 correct login → lockout counter resets
 *   auth.spec.js         – 1 wrong + 1 correct login → lockout counter resets
 *   brute-force.spec.js  – SKIPPED unless RUN_LOCKOUT_TESTS=1
 *   contact.spec.js      – exhausts contact rate-limit only at the very end
 *   homepage.spec.js     – read-only, no auth
 *   navigation.spec.js   – read-only, no auth
 *
 * workers:1 keeps execution serial so the server's in-memory
 * IP/session state stays predictable across test files.
 */
module.exports = defineConfig({
  testDir: './tests/e2e',

  /* Serial — rate-limit maps and session state live in the server process */
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: 'http://localhost:3000',
    /* Collect a trace on first retry so failures are easy to debug */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    /* Default timeout for each action (click, fill, expect …) */
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      /* Mobile project only runs viewport-sensitive suites */
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
      testMatch: ['**/homepage.spec.js', '**/navigation.spec.js'],
    },
  ],

  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3000',
    /* Reuse an already-running server locally; always start fresh in CI */
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
