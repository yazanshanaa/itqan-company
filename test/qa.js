'use strict';
// QA Test Runner — Itqan Company Website
// Usage: TEST_PASS=itqan2024 node test/qa.js
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3001;
const HOST = `localhost:${PORT}`;
let passed = 0;
let failed = 0;

// ── HTTP helper ───────────────────────────────────────────────────────────────
function request(method, urlPath, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: PORT, path: urlPath, method,
      headers: {
        'Content-Type': 'application/json',
        'Origin': `http://${HOST}`,
        'Host': HOST,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...extraHeaders
      }
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        let json; try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, body: json, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function assert(cond, label) {
  if (cond) { console.log(`  ✓  ${label}`); passed++; }
  else       { console.error(`  ✗  ${label}`); failed++; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractCookie(headers) {
  const sc = headers['set-cookie'];
  if (!sc) return null;
  const arr = Array.isArray(sc) ? sc : [sc];
  const sid = arr.find(c => c.startsWith('connect.sid='));
  return sid ? sid.split(';')[0] : null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
async function runTests() {
  const PASS = process.env.TEST_PASS || 'itqan2024';

  // ── AUTH ──────────────────────────────────────────────────────────────────
  console.log('\n══ AUTH TESTS ══════════════════════════════');

  // 1. Correct login → 200 + session cookie
  let adminCookie;
  {
    const r = await request('POST', '/api/auth/login', { password: PASS });
    assert(r.status === 200, 'T01 — Login correct password → 200');
    assert(r.body.ok === true, 'T02 — Login correct → body.ok:true');
    adminCookie = extractCookie(r.headers);
    assert(adminCookie !== null, 'T03 — Login correct → Set-Cookie present');
  }

  // 2. GET /me with valid session → admin:true
  {
    const r = await request('GET', '/api/auth/me', null, { Cookie: adminCookie });
    assert(r.status === 200 && r.body.admin === true, 'T04 — GET /me with session → admin:true');
  }

  // 3. Logout → admin:false
  {
    const r = await request('POST', '/api/auth/logout', {}, { Cookie: adminCookie });
    assert(r.status === 200, 'T05 — Logout → 200');
    const me = await request('GET', '/api/auth/me', null, { Cookie: adminCookie });
    assert(me.body.admin === false, 'T06 — After logout → admin:false');
  }

  // 4. GET /me without session → admin:false
  {
    const r = await request('GET', '/api/auth/me');
    assert(r.body.admin === false, 'T07 — GET /me no session → admin:false');
  }

  // 5. Change password — wrong old → 401
  {
    const login = await request('POST', '/api/auth/login', { password: PASS });
    const cookie = extractCookie(login.headers);
    const r = await request('POST', '/api/auth/change-password',
      { oldPassword: 'wrongOld!!!', newPassword: 'newpass123' }, { Cookie: cookie });
    assert(r.status === 401, 'T08 — change-password wrong old → 401');
    // Logout so it doesn't interfere
    await request('POST', '/api/auth/logout', {}, { Cookie: cookie });
  }

  // 6. Change password — short new (<6) → 400
  {
    const login = await request('POST', '/api/auth/login', { password: PASS });
    const cookie = extractCookie(login.headers);
    const r = await request('POST', '/api/auth/change-password',
      { oldPassword: PASS, newPassword: 'abc' }, { Cookie: cookie });
    assert(r.status === 400, 'T09 — change-password short new → 400');
    await request('POST', '/api/auth/logout', {}, { Cookie: cookie });
  }

  // 7. CSRF bypass → 403 (evil origin)
  {
    const r = await request('POST', '/api/auth/login', { password: PASS }, {
      Origin: 'http://evil.example.com',
      Host: HOST
    });
    assert(r.status === 403, 'T10 — CSRF bypass (evil origin) → 403');
  }

  // Obtain a fresh cookie BEFORE lockout tests (lockout makes future logins impossible)
  let freshCookie = null;
  {
    const login = await request('POST', '/api/auth/login', { password: PASS });
    freshCookie = extractCookie(login.headers);
  }

  // 8. Wrong password → 401 {error:'wrong'} (1st bad attempt)
  {
    const r = await request('POST', '/api/auth/login', { password: 'badpass0' });
    assert(r.status === 401 && r.body.error === 'wrong', 'T11 — Login wrong → 401 error:wrong');
    assert(!('attemptsLeft' in r.body), 'T12 — Login wrong → no attemptsLeft leaked');
  }

  // 9. Lockout after 5 total bad attempts (send 4 more)
  {
    let last;
    for (let i = 1; i <= 4; i++) {
      last = await request('POST', '/api/auth/login', { password: `badpass${i}` });
      await sleep(80);
    }
    assert(last.status === 429 && last.body.error === 'locked', 'T13 — 5 bad attempts → 429 locked');
    assert(typeof last.body.remaining === 'number', 'T14 — Lockout response has remaining minutes');
  }

  // ── DATA ──────────────────────────────────────────────────────────────────
  console.log('\n══ DATA TESTS ══════════════════════════════');

  // 10. GET /api/data → 200, has company, NO email
  {
    const r = await request('GET', '/api/data');
    assert(r.status === 200, 'T15 — GET /api/data → 200');
    assert(r.body && typeof r.body.company === 'object', 'T16 — GET /api/data → has company key');
    assert(!('email' in (r.body.company || {})), 'T17 — GET /api/data → company.email stripped');
  }

  // 11. PUT /api/data unauthenticated → 401
  {
    const r = await request('PUT', '/api/data', { company: { nameAr: 'test' } });
    assert(r.status === 401, 'T18 — PUT /api/data unauth → 401');
  }

  // 12. PUT /api/data authenticated valid body → 200
  if (freshCookie) {
    const getR = await request('GET', '/api/data');
    const writeBody = { ...getR.body, company: { ...getR.body.company, email: 'qa@test.com' } };
    const r = await request('PUT', '/api/data', writeBody, { Cookie: freshCookie });
    assert(r.status === 200, 'T19 — PUT /api/data authenticated valid → 200');
  } else {
    assert(false, 'T19 — PUT /api/data authenticated valid → SKIPPED (locked)');
  }

  // 13. PUT /api/data without company key → 400
  if (freshCookie) {
    const r = await request('PUT', '/api/data', { services: [] }, { Cookie: freshCookie });
    assert(r.status === 400, 'T20 — PUT /api/data no company key → 400');
    await request('POST', '/api/auth/logout', {}, { Cookie: freshCookie });
  } else {
    assert(false, 'T20 — PUT /api/data no company key → SKIPPED (locked)');
  }

  // ── CONTACT ───────────────────────────────────────────────────────────────
  console.log('\n══ CONTACT TESTS ═══════════════════════════');

  // 14. Missing required fields → 400
  {
    const r = await request('POST', '/api/contact', { name: 'Test' });
    assert(r.status === 400, 'T21 — /api/contact missing fields → 400');
  }

  // 15. Invalid email → 400
  {
    const r = await request('POST', '/api/contact', { name: 'Test', email: 'notanemail', message: 'hi' });
    assert(r.status === 400, 'T22 — /api/contact invalid email → 400');
  }

  // 16. Valid submission (SMTP not configured) → 200
  {
    const r = await request('POST', '/api/contact', { name: 'QA User', email: 'qa@example.com', message: 'Test message from QA', service: 'موقع ويب' });
    assert(r.status === 200 && r.body.ok === true, 'T23 — /api/contact valid → 200 ok:true');
  }

  // 17. Rate limit: 5 more requests → 6th gets 429
  {
    for (let i = 0; i < 4; i++) {
      await request('POST', '/api/contact', { name: `U${i}`, email: `u${i}@test.com`, message: 'msg' });
      await sleep(30);
    }
    const r = await request('POST', '/api/contact', { name: 'Flood', email: 'flood@test.com', message: 'flood' });
    assert(r.status === 429, 'T24 — /api/contact 6th request → 429');
  }
}

// ── Server lifecycle ──────────────────────────────────────────────────────────
async function main() {
  // Ensure SESSION_SECRET meets minimum length for test run
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = 'qa-test-secret-for-itqan-min-32chars!!';
  }
  process.env.PORT = String(PORT);

  console.log(`\nStarting server on port ${PORT}...`);
  const server = spawn('node', [path.join(__dirname, '../server.js')], {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stderr.on('data', d => process.stderr.write(d));

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timeout (8s)')), 8000);
    server.stdout.on('data', (d) => {
      if (d.toString().includes('running on')) { clearTimeout(timeout); resolve(); }
    });
    server.on('error', reject);
    server.on('exit', (code) => { if (code !== 0) reject(new Error(`Server exited with code ${code}`)); });
  });

  console.log('Server ready.\n');

  try {
    await runTests();
  } finally {
    server.kill();
    console.log(`\n${'═'.repeat(44)}`);
    console.log(`  Results: ${passed} passed  |  ${failed} failed`);
    console.log(`${'═'.repeat(44)}\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
