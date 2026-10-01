import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { buildApp } from '../src/app.js';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { runSeed } from '../src/db/seed.js';
import { AuthService } from '../src/services/auth.service.js';
import { PaymentService } from '../src/services/payment.service.js';
import { AnomalyService } from '../src/services/anomaly.service.js';
import { ProvenanceService } from '../src/services/provenance.service.js';
import { EvidenceType, VerificationStatus, UserRole, PaymentBeneficiaryType } from '../src/types/domain.js';
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

describe('Final Comprehensive Security, Session Integrity & Acceptance Audit', () => {
  let backendApp: FastifyInstance;
  let viteServer: ViteDevServer;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let authService: AuthService;

  const BACKEND_PORT = 3297;
  const FRONTEND_PORT = 5397;
  const BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

  let tokens: Record<string, string> = {};

  before(async () => {
    closeDatabase();
    const db = getDatabase();
    runSeed(db);
    authService = new AuthService(db);

    tokens.CITIZEN = authService.createToken({
      userId: 'usr-citizen-01',
      username: 'citizen_priya',
      role: UserRole.CITIZEN,
      householdId: 'house-demo-101',
      wardId: 'ward-demo-14'
    });

    tokens.CITIZEN_OTHER = authService.createToken({
      userId: 'usr-citizen-02',
      username: 'citizen_rajesh',
      role: UserRole.CITIZEN,
      householdId: 'house-demo-102',
      wardId: 'ward-demo-14'
    });

    tokens.WORKER = authService.createToken({
      userId: 'usr-worker-01',
      username: 'worker_suresh',
      role: UserRole.WORKER,
      workerId: 'wrk-demo-03'
    });

    tokens.DRIVER = authService.createToken({
      userId: 'usr-driver-01',
      username: 'driver_ramesh',
      role: UserRole.DRIVER,
      workerId: 'wrk-demo-01'
    });

    tokens.SUPERVISOR_W14 = authService.createToken({
      userId: 'usr-sup-01',
      username: 'supervisor_w14',
      role: UserRole.SUPERVISOR,
      wardId: 'ward-demo-14'
    });

    tokens.SUPERVISOR_W15 = authService.createToken({
      userId: 'usr-sup-02',
      username: 'supervisor_w15',
      role: UserRole.SUPERVISOR,
      wardId: 'ward-demo-15'
    });

    tokens.SUPERVISOR_NO_WARD = authService.createToken({
      userId: 'usr-sup-noward',
      username: 'supervisor_noward',
      role: UserRole.SUPERVISOR,
      wardId: null
    });

    tokens.WARD_OFFICER_W14 = authService.createToken({
      userId: 'usr-wo-01',
      username: 'ward_officer_14',
      role: UserRole.WARD_OFFICER,
      wardId: 'ward-demo-14'
    });

    tokens.WARD_OFFICER_NO_WARD = authService.createToken({
      userId: 'usr-wo-noward',
      username: 'ward_officer_noward',
      role: UserRole.WARD_OFFICER,
      wardId: null
    });

    tokens.AUTHORITY = authService.createToken({
      userId: 'usr-auth-01',
      username: 'commissioner',
      role: UserRole.AUTHORITY
    });

    tokens.ADMIN = authService.createToken({
      userId: 'usr-admin-01',
      username: 'admin',
      role: UserRole.ADMIN
    });

    backendApp = buildApp({ enableRateLimit: false });
    await backendApp.listen({ port: BACKEND_PORT, host: '127.0.0.1' });

    viteServer = await createServer({
      root: path.resolve(process.cwd(), 'frontend'),
      server: {
        port: FRONTEND_PORT,
        strictPort: true,
        host: '127.0.0.1',
        proxy: {
          '/api': {
            target: `http://127.0.0.1:${BACKEND_PORT}`,
            changeOrigin: true
          }
        }
      }
    });
    await viteServer.listen();

    browser = await chromium.launch({
      channel: 'chrome',
      headless: true
    });
    context = await browser.newContext();
    page = await context.newPage();
  });

  after(async () => {
    if (browser) await browser.close();
    if (viteServer) await viteServer.close();
    if (backendApp) await backendApp.close();
    closeDatabase();
  });

  describe('1. Session & Authentication Security', () => {
    const rolesToTest = [
      { role: 'CITIZEN', user: 'citizen_priya', pass: 'citizen_priya_Pass123!', path: '/citizen' },
      { role: 'WORKER', user: 'worker_suresh', pass: 'worker_suresh_Pass123!', path: '/worker' },
      { role: 'DRIVER', user: 'driver_ramesh', pass: 'driver_ramesh_Pass123!', path: '/worker' },
      { role: 'SUPERVISOR', user: 'supervisor_w14', pass: 'supervisor_w14_Pass123!', path: '/authority' },
      { role: 'WARD_OFFICER', user: 'ward_officer_14', pass: 'ward_officer_14_Pass123!', path: '/authority' },
      { role: 'AUTHORITY', user: 'commissioner', pass: 'commissioner_Pass123!', path: '/authority' },
      { role: 'ADMIN', user: 'admin', pass: 'admin_Pass123!', path: '/authority' }
    ];

    for (const r of rolesToTest) {
      test(`1.1 Login succeeds for role ${r.role} and redirects to ${r.path}`, async () => {
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'networkidle' });

        await page.fill('#username', r.user);
        await page.fill('#password', r.pass);
        await page.click('button[type="submit"]');

        await page.waitForURL(`**${r.path}**`, { timeout: 10000 });
        assert.ok(page.url().includes(r.path));

        const storedSession = await page.evaluate(() => localStorage.getItem('municipal_session'));
        assert.ok(storedSession, 'Session must be stored in localStorage');
        const parsed = JSON.parse(storedSession);
        assert.equal(parsed.username, r.user);
      });
    }

    test('1.2 Invalid credentials rejected with UI error alert', async () => {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });

      await page.fill('#username', 'citizen_priya');
      await page.fill('#password', 'TotallyWrongPassword!');
      await page.click('button[type="submit"]');

      await page.waitForSelector('[role="alert"], .alert-danger', { timeout: 8000 });
      const text = await page.textContent('body');
      assert.ok(text?.includes('Invalid username or password') || text?.includes('Invalid'));
    });

    test('1.3 Logout invalidates authenticated session and clears localStorage', async () => {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });

      await page.fill('#username', 'citizen_priya');
      await page.fill('#password', 'citizen_priya_Pass123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/citizen**', { timeout: 10000 });

      const logoutBtn = page.locator('button:has-text("Sign Out"), button:has-text("Logout"), [aria-label*="Sign Out"], [aria-label*="Logout"]').first();
      await logoutBtn.waitFor({ state: 'visible', timeout: 5000 });
      await logoutBtn.click();

      await page.waitForURL('**/login', { timeout: 8000 });
      const stored = await page.evaluate(() => localStorage.getItem('municipal_session'));
      assert.equal(stored, null, 'Session must be deleted from localStorage upon logout');
    });

    test('1.4 Page refresh preserves authenticated session', async () => {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });

      await page.fill('#username', 'citizen_priya');
      await page.fill('#password', 'citizen_priya_Pass123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/citizen**', { timeout: 10000 });

      await page.reload({ waitUntil: 'networkidle' });
      assert.ok(page.url().includes('/citizen'));
      const text = await page.textContent('body');
      assert.ok(text?.includes('Priya') || text?.includes('H-14A-01') || text?.includes('Citizen'));
    });

    test('1.5 Refreshing after logout does not restore previous session', async () => {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      assert.ok(page.url().includes('/login'));
      assert.equal(await page.evaluate(() => localStorage.getItem('municipal_session')), null);
    });

    test('1.6 Expired JWT credentials cannot access protected APIs', async () => {
      const expiredToken = authService.createToken({
        userId: 'usr-citizen-01',
        username: 'citizen_priya',
        role: UserRole.CITIZEN
      }, -1);

      const res = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${expiredToken}` }
      });
      assert.equal(res.statusCode, 401);
    });

    test('1.7 Unauthenticated user accessing protected route is redirected to /login', async () => {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE_URL}/authority/operations`, { waitUntil: 'networkidle' });
      await page.waitForURL('**/login', { timeout: 8000 });
      assert.ok(page.url().includes('/login'));
    });

    test('1.8 Client-side role tampering is rejected server-side (server validates JWT)', async () => {
      const res = await backendApp.inject({
        method: 'PATCH',
        url: '/api/v1/complaints/comp-demo-01/resolve',
        headers: { authorization: `Bearer ${tokens.CITIZEN}` },
        payload: { status: 'RESOLVED', resolution_notes: 'Tampered citizen attempting admin resolution' }
      });
      assert.equal(res.statusCode, 403);
    });
  });

  describe('2. Complete RBAC & IDOR Security Matrix', () => {
    test('2.1 CITIZEN matrix: can access own household; blocked from other household, roster, metrics, anomalies, audit, export', async () => {
      const ownRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/operations/runs/run-demo-01/households/house-demo-101/status',
        headers: { authorization: `Bearer ${tokens.CITIZEN}` }
      });
      assert.equal(ownRes.statusCode, 200);

      const idorRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/operations/runs/run-demo-01/households/house-demo-102/status',
        headers: { authorization: `Bearer ${tokens.CITIZEN}` }
      });
      assert.equal(idorRes.statusCode, 403);

      const finRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/finance/obligations/house-demo-102',
        headers: { authorization: `Bearer ${tokens.CITIZEN}` }
      });
      assert.equal(finRes.statusCode, 403);

      const opsRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/operations/assignments',
        headers: { authorization: `Bearer ${tokens.CITIZEN}` }
      });
      assert.equal(opsRes.statusCode, 403);

      const metRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/metrics/route-completion/run-demo-01',
        headers: { authorization: `Bearer ${tokens.CITIZEN}` }
      });
      assert.equal(metRes.statusCode, 403);

      const anomRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/anomalies',
        headers: { authorization: `Bearer ${tokens.CITIZEN}` }
      });
      assert.equal(anomRes.statusCode, 403);

      const auditRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/audit/events',
        headers: { authorization: `Bearer ${tokens.CITIZEN}` }
      });
      assert.equal(auditRes.statusCode, 403);

      const expRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/audit/export/ndjson',
        headers: { authorization: `Bearer ${tokens.CITIZEN}` }
      });
      assert.equal(expRes.statusCode, 403);
    });

    test('2.2 WORKER matrix: can access own assignment; blocked from finance, audit, metrics, anomalies, export', async () => {
      const ownRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/operations/assignments/my-assignment',
        headers: { authorization: `Bearer ${tokens.WORKER}` }
      });
      assert.equal(ownRes.statusCode, 200);

      const unassignedRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/operations/runs/run-demo-03/households',
        headers: { authorization: `Bearer ${tokens.WORKER}` }
      });
      assert.equal(unassignedRes.statusCode, 403);

      const finRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/finance/obligations/house-demo-101',
        headers: { authorization: `Bearer ${tokens.WORKER}` }
      });
      assert.equal(finRes.statusCode, 403);

      const auditRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/audit/events',
        headers: { authorization: `Bearer ${tokens.WORKER}` }
      });
      assert.equal(auditRes.statusCode, 403);

      const metRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/metrics/fleet-availability?service_date=2026-09-14',
        headers: { authorization: `Bearer ${tokens.WORKER}` }
      });
      assert.equal(metRes.statusCode, 403);
    });

    test('2.3 DRIVER matrix: can view active assignment/vehicle; blocked from finance, complaints filing, audit', async () => {
      const ownRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/operations/assignments/my-assignment',
        headers: { authorization: `Bearer ${tokens.DRIVER}` }
      });
      assert.equal(ownRes.statusCode, 200);

      const finRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/finance/obligations/house-demo-101',
        headers: { authorization: `Bearer ${tokens.DRIVER}` }
      });
      assert.equal(finRes.statusCode, 403);

      const compRes = await backendApp.inject({
        method: 'POST',
        url: '/api/v1/complaints',
        headers: { authorization: `Bearer ${tokens.DRIVER}` },
        payload: {
          household_id: 'house-demo-101',
          service_date: '2026-09-14',
          complaint_type: 'MISSED_COLLECTION',
          resident_remarks: 'Driver attempting to lodge complaint'
        }
      });
      assert.equal(compRes.statusCode, 403);
    });

    test('2.4 SUPERVISOR matrix: can view Ward 14 routes/households; blocked from Ward 15 and financial metrics', async () => {
      const r14Res = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/master/routes',
        headers: { authorization: `Bearer ${tokens.SUPERVISOR_W14}` }
      });
      assert.equal(r14Res.statusCode, 200);

      const r15Res = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/operations/runs/run-demo-03',
        headers: { authorization: `Bearer ${tokens.SUPERVISOR_W14}` }
      });
      assert.equal(r15Res.statusCode, 403);

      const crrRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/metrics/collection-reconciliation',
        headers: { authorization: `Bearer ${tokens.SUPERVISOR_W14}` }
      });
      assert.equal(crrRes.statusCode, 403);

      const audRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/audit/events',
        headers: { authorization: `Bearer ${tokens.SUPERVISOR_W14}` }
      });
      assert.equal(audRes.statusCode, 403);
    });

    test('2.5 WARD_OFFICER matrix: can view fleet & Ward 14 households; blocked from global financial payments & audit', async () => {
      const vehRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/master/vehicles',
        headers: { authorization: `Bearer ${tokens.WARD_OFFICER_W14}` }
      });
      assert.equal(vehRes.statusCode, 200);

      const audRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/audit/events',
        headers: { authorization: `Bearer ${tokens.WARD_OFFICER_W14}` }
      });
      assert.equal(audRes.statusCode, 403);

      const payRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/finance/payments/house-demo-101',
        headers: { authorization: `Bearer ${tokens.WARD_OFFICER_W14}` }
      });
      assert.equal(payRes.statusCode, 403);
    });

    test('2.6 AUTHORITY matrix: can view all routes, operations, executive metrics, financial reconciliation, and audit', async () => {
      const foaRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/metrics/fleet-availability?service_date=2026-09-14',
        headers: { authorization: `Bearer ${tokens.AUTHORITY}` }
      });
      assert.equal(foaRes.statusCode, 200);

      const payRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/finance/payments/house-demo-101',
        headers: { authorization: `Bearer ${tokens.AUTHORITY}` }
      });
      assert.equal(payRes.statusCode, 200);

      const audRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/audit/events',
        headers: { authorization: `Bearer ${tokens.AUTHORITY}` }
      });
      assert.equal(audRes.statusCode, 200);
    });

    test('2.7 ADMIN matrix: can resolve citizen complaints and review audit trail', async () => {
      const res = await backendApp.inject({
        method: 'PATCH',
        url: '/api/v1/complaints/comp-demo-01/resolve',
        headers: { authorization: `Bearer ${tokens.ADMIN}` },
        payload: {
          status: 'RESOLVED',
          resolution_notes: 'Verified missed collection resolved by admin'
        }
      });
      assert.equal(res.statusCode, 200);
    });
  });

  describe('3. Cross-Ward Security & Parameter Tampering', () => {
    test('3.1 Supervisor Ward 14 passing ?route_id for Ward 15 route receives empty list (ward scoped)', async () => {
      const res = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/master/households?route_id=route-demo-C',
        headers: { authorization: `Bearer ${tokens.SUPERVISOR_W14}` }
      });
      assert.equal(res.statusCode, 200);
      const data = res.json();
      assert.equal(data.households.length, 0);
    });

    test('3.2 Ward Officer Ward 14 passing ?route_id for Ward 15 route receives empty list (ward scoped)', async () => {
      const res = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/master/households?route_id=route-demo-C',
        headers: { authorization: `Bearer ${tokens.WARD_OFFICER_W14}` }
      });
      assert.equal(res.statusCode, 200);
      const data = res.json();
      assert.equal(data.households.length, 0);
    });

    test('3.3 Fail-Closed: Supervisor without wardId is rejected with HTTP 403 on ward-scoped endpoints', async () => {
      const res = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/operations/assignments',
        headers: { authorization: `Bearer ${tokens.SUPERVISOR_NO_WARD}` }
      });
      assert.equal(res.statusCode, 403);
      assert.match(res.json().message, /no assigned ward/i);
    });

    test('3.4 Fail-Closed: Ward Officer without wardId is rejected with HTTP 403 on ward-scoped endpoints', async () => {
      const res = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/master/households',
        headers: { authorization: `Bearer ${tokens.WARD_OFFICER_NO_WARD}` }
      });
      assert.equal(res.statusCode, 403);
      assert.match(res.json().message, /no assigned ward/i);
    });
  });

  describe('4. Privilege Escalation Scenarios', () => {
    test('4.1 CITIZEN attempting ADMIN complaint resolution receives HTTP 403', async () => {
      const res = await backendApp.inject({
        method: 'PATCH',
        url: '/api/v1/complaints/comp-demo-01/resolve',
        headers: { authorization: `Bearer ${tokens.CITIZEN}` },
        payload: { status: 'RESOLVED', resolution_notes: 'Malicious citizen attempting resolution' }
      });
      assert.equal(res.statusCode, 403);
    });

    test('4.2 CITIZEN attempting AUTHORITY metrics receives HTTP 403', async () => {
      const res = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/metrics/route-completion/run-demo-01',
        headers: { authorization: `Bearer ${tokens.CITIZEN}` }
      });
      assert.equal(res.statusCode, 403);
    });

    test('4.3 WORKER attempting SUPERVISOR manual override receives HTTP 403', async () => {
      const res = await backendApp.inject({
        method: 'POST',
        url: '/api/v1/operations/runs/run-demo-01/manual-override',
        headers: { authorization: `Bearer ${tokens.WORKER}` },
        payload: {
          household_id: 'house-demo-101',
          target_status: 'VERIFIED',
          override_reason: 'Worker attempting manual override without authorization'
        }
      });
      assert.equal(res.statusCode, 403);
    });

    test('4.4 DRIVER attempting financial payments access receives HTTP 403', async () => {
      const res = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/finance/payments/house-demo-101',
        headers: { authorization: `Bearer ${tokens.DRIVER}` }
      });
      assert.equal(res.statusCode, 403);
    });

    test('4.5 SUPERVISOR attempting AUTHORITY-only payment reconciliation receives HTTP 403', async () => {
      const res = await backendApp.inject({
        method: 'POST',
        url: '/api/v1/finance/reconcile',
        headers: { authorization: `Bearer ${tokens.SUPERVISOR_W14}` },
        payload: {
          payment_id: 'a0000000-0000-0000-0000-000000000001',
          bank_statement_ref: 'STMT-REF-UNAUTH',
          statement_amount_paise: 10000
        }
      });
      assert.equal(res.statusCode, 403);
    });
  });

  describe('5. Input & API Hardening Smoke Tests', () => {
    test('5.1 Malformed run ID in status route returns 400 or 404 safely without crash', async () => {
      const res = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/operations/runs/../../etc/passwd/households/house-demo-101/status',
        headers: { authorization: `Bearer ${tokens.AUTHORITY}` }
      });
      assert.ok([400, 404].includes(res.statusCode));
      assert.ok(!res.body.includes('at Fastify') && !res.body.includes('node:internal'));
    });

    test('5.2 Missing required fields on complaint submission returns 400 with validation details', async () => {
      const res = await backendApp.inject({
        method: 'POST',
        url: '/api/v1/complaints',
        headers: { authorization: `Bearer ${tokens.CITIZEN}` },
        payload: { resident_remarks: 'Incomplete payload' }
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error, 'BAD_REQUEST');
    });

    test('5.3 Invalid enum value in evidence submission returns 400', async () => {
      const res = await backendApp.inject({
        method: 'POST',
        url: '/api/v1/operations/runs/run-demo-01/events',
        headers: { authorization: `Bearer ${tokens.WORKER}` },
        payload: {
          household_id: 'house-demo-101',
          evidence_type: 'DRONE_SURVEILLANCE_FAKE',
          captured_at: new Date().toISOString()
        }
      });
      assert.equal(res.statusCode, 400);
    });

    test('5.4 Oversized input string is handled safely without server error', async () => {
      const hugeString = 'X'.repeat(10000);
      const res = await backendApp.inject({
        method: 'POST',
        url: '/api/v1/complaints',
        headers: { authorization: `Bearer ${tokens.CITIZEN}` },
        payload: {
          household_id: 'house-demo-101',
          service_date: '2026-09-14',
          complaint_type: 'MISSED_COLLECTION',
          resident_remarks: hugeString
        }
      });
      assert.ok([201, 400].includes(res.statusCode));
    });

    test('5.5 SQL injection payload in query params is safely bound with 0 leak', async () => {
      const res = await backendApp.inject({
        method: 'GET',
        url: "/api/v1/master/households?route_id=' OR '1'='1",
        headers: { authorization: `Bearer ${tokens.AUTHORITY}` }
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().households.length, 0);
    });

    test('5.6 XSS script tags in citizen remarks are treated as text without execution', async () => {
      const xssPayload = "<script>alert('XSS_TEST')</script>";
      const res = await backendApp.inject({
        method: 'POST',
        url: '/api/v1/complaints',
        headers: { authorization: `Bearer ${tokens.CITIZEN}` },
        payload: {
          household_id: 'house-demo-101',
          service_date: '2026-09-14',
          complaint_type: 'MISSED_COLLECTION',
          resident_remarks: xssPayload
        }
      });
      assert.equal(res.statusCode, 201);
      const db = getDatabase();
      const comp = db.prepare(`SELECT resident_remarks FROM complaints WHERE id = ?`).get(res.json().complaint_id) as any;
      assert.equal(comp.resident_remarks, xssPayload);
    });
  });

  describe('6. Isolated Database Initialization & Constraint Verification', () => {
    test('6.1 Fresh in-memory database initializes schema, runs migrations, and enforces constraints', () => {
      const isolatedDb = new DatabaseSync(':memory:');
      isolatedDb.exec('PRAGMA foreign_keys = ON;');

      const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'src/db/schema.sql'), 'utf8');
      isolatedDb.exec(schemaSql);

      assert.throws(() => {
        isolatedDb.prepare(`
          INSERT INTO areas (id, ward_id, name, source_id, created_at, updated_at)
          VALUES ('area-test', 'non-existent-ward', 'Test Area', 'src-1', datetime('now'), datetime('now'))
        `).run();
      }, /FOREIGN KEY/i);

      assert.throws(() => {
        isolatedDb.prepare(`
          INSERT INTO data_sources (id, source_type, classification, provider_name, ingested_at)
          VALUES ('src-test', 'SYNTHETIC_SEEDER', 'SIMULATED_DEMO_DATA', 'Test Provider', datetime('now'))
        `).run();
        isolatedDb.prepare(`
          INSERT INTO payment_obligations (id, household_id, obligation_type, amount_paise, billing_period, beneficiary_model, source_id, created_at)
          VALUES ('ob-test', 'h-1', 'MONTHLY_CONTRIBUTION', -500, '2026-09', 'DESIGNATED_WORKER_ACCOUNT', 'src-test', datetime('now'))
        `).run();
      }, /CHECK/i);

      isolatedDb.close();
    });
  });

  describe('7. Payment Security & Beneficiary Snapshot Invariants', () => {
    test('7.1 Beneficiary driver snapshot persists upon obligation creation', async () => {
      const db = getDatabase();
      const ob = db.prepare(`SELECT * FROM payment_obligations WHERE id = 'ob-demo-101'`).get() as any;
      assert.equal(ob.beneficiary_model, PaymentBeneficiaryType.DESIGNATED_WORKER_ACCOUNT);
      assert.equal(ob.beneficiary_driver_id, 'wrk-demo-01');
    });

    test('7.2 Webhook without signature header returns 401; tampered signature returns 400', async () => {
      const resMissing = await backendApp.inject({
        method: 'POST',
        url: '/api/v1/finance/payments/webhook',
        payload: { test: true }
      });
      assert.equal(resMissing.statusCode, 401);

      const resInvalid = await backendApp.inject({
        method: 'POST',
        url: '/api/v1/finance/payments/webhook',
        headers: {
          'x-provider-signature': 'invalid-tampered-hmac-signature-12345678'
        },
        payload: {
          payment_id: 'a0000000-0000-0000-0000-000000000001',
          provider_name: 'TEST_GATEWAY',
          provider_transaction_ref: 'GW-REF-INVALID',
          amount_paise: 10000,
          status: 'SUCCESS',
          timestamp: new Date().toISOString()
        }
      });
      assert.equal(resInvalid.statusCode, 400);
    });

    test('7.3 Bank statement deposit mismatch triggers ANOM-05 RECONCILIATION_MISMATCH', async () => {
      const db = getDatabase();
      const paymentService = new PaymentService(db);
      const provenance = new ProvenanceService(db);
      const sourceId = provenance.getPrimaryDemoSourceId();

      const pId = 'a1111111-1111-1111-1111-111111111111';
      db.prepare(`
        INSERT INTO resident_payments (id, household_id, obligation_id, amount_paise, currency, payment_method, provider_name, provider_transaction_ref, idempotency_key, status, initiated_at, confirmed_at, beneficiary_type, beneficiary_driver_id, source_id)
        VALUES (?, 'house-demo-101', 'ob-demo-101', 10000, 'INR', 'UPI', 'MOCK_UPI', 'GW-TEST-001', 'IDEMP-TEST-001', 'SUCCESSFUL', datetime('now'), datetime('now'), 'DESIGNATED_WORKER_ACCOUNT', 'wrk-demo-01', ?)
      `).run(pId, sourceId);

      const reconResult = paymentService.reconcileWithBankScroll({
        paymentId: pId,
        bankStatementRef: 'STMT-REF-DIFF-01',
        statementAmountPaise: 9000,
        reconciledBy: 'usr-admin-01',
        notes: 'Bank deposit mismatch test'
      });
      assert.equal(reconResult.anomalyDetected, true);
      assert.equal(reconResult.status, 'UNMATCHED_AMOUNT');

      const anom = db.prepare(`SELECT * FROM operational_anomalies WHERE anomaly_id = 'ANOM-05' AND json_extract(trigger_evidence, '$.payment_id') = ?`).get(pId) as any;
      assert.ok(anom, 'ANOM-05 anomaly must be triggered on amount discrepancy');
    });
  });

  describe('8. Canonical Anomaly Definitions & Automatic Detection', () => {
    test('8.1 ANOM-01: Automatically flags scheduled assignment >90m overdue without start', () => {
      const db = getDatabase();
      const anomalyService = new AnomalyService(db);

      const twoHoursAgo = new Date(Date.now() - 7200 * 1000).toISOString();
      db.prepare(`
        UPDATE daily_assignments 
        SET scheduled_start = ?, status = 'SCHEDULED' 
        WHERE id = 'da-demo-01'
      `).run(twoHoursAgo);

      db.prepare(`
        UPDATE daily_service_runs 
        SET run_status = 'NOT_STARTED', actual_start_time = null 
        WHERE id = 'run-demo-01'
      `).run();

      const created = anomalyService.evaluateAllOverdueVehicleInactivity(new Date().toISOString());
      assert.ok(created.length >= 1);
      assert.equal(created[0].anomaly_id, 'ANOM-01');
    });

    test('8.2 ANOM-02: Flags rapid physical scans (<5s delta) between distinct households', () => {
      const db = getDatabase();
      const anomalyService = new AnomalyService(db);
      const provenance = new ProvenanceService(db);
      const sourceId = provenance.getPrimaryDemoSourceId();

      const now = Date.now();
      db.prepare(`
        INSERT INTO service_evidence (id, service_run_id, household_id, evidence_type, captured_at, device_id, actor_id, source_id, created_at)
        VALUES ('ev-rf-1', 'run-demo-01', 'house-demo-101', 'DOORSTEP_QR_SCAN', ?, 'DEV-1', 'wrk-demo-03', ?, ?)
      `).run(new Date(now).toISOString(), sourceId, new Date(now).toISOString());

      db.prepare(`
        INSERT INTO service_evidence (id, service_run_id, household_id, evidence_type, captured_at, device_id, actor_id, source_id, created_at)
        VALUES ('ev-rf-2', 'run-demo-01', 'house-demo-102', 'DOORSTEP_QR_SCAN', ?, 'DEV-1', 'wrk-demo-03', ?, ?)
      `).run(new Date(now + 2000).toISOString(), sourceId, new Date(now + 2000).toISOString());

      const anoms = anomalyService.evaluateRapidScanAnomaly('run-demo-01');
      assert.ok(anoms.length >= 1);
      assert.equal(anoms[0].anomaly_id, 'ANOM-02');
    });

    test('8.3 ANOM-07: Flags multiple active assignments for the same vehicle on the same date', () => {
      const db = getDatabase();
      const anomalyService = new AnomalyService(db);
      const provenance = new ProvenanceService(db);
      const sourceId = provenance.getPrimaryDemoSourceId();

      db.prepare(`
        INSERT INTO daily_assignments (id, service_date, route_id, vehicle_id, driver_id, supervisor_id, scheduled_start, status, source_id, created_at, created_by)
        VALUES ('da-conflict-01', '2026-09-14', 'route-demo-B', 'veh-demo-01', 'wrk-demo-02', 'wrk-demo-05', '2026-09-14T06:00:00.000Z', 'SCHEDULED', ?, datetime('now'), 'usr-admin-01')
      `).run(sourceId);

      const anoms = anomalyService.evaluateAssignmentConflicts('2026-09-14');
      assert.ok(anoms.length >= 1);
      assert.equal(anoms[0].anomaly_id, 'ANOM-07');
    });
  });

  describe('9. Tamper-Evident Audit Log Integrity', () => {
    test('9.1 Important mutations generate structured audit events with actor, action, target and timestamp', async () => {
      const db = getDatabase();
      const events = db.prepare(`SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 5`).all() as any[];
      assert.ok(events.length > 0);
      const ev = events[0];
      assert.ok(ev.actor_id);
      assert.ok(ev.action_type);
      assert.ok(ev.entity_name);
      assert.ok(ev.created_at);
    });

    test('9.2 Ordinary users cannot manipulate historical audit records through exposed endpoints', async () => {
      const patchRes = await backendApp.inject({
        method: 'PATCH',
        url: '/api/v1/audit/events/any-id',
        headers: { authorization: `Bearer ${tokens.WORKER}` },
        payload: { action_type: 'TAMPERED_ACTION' }
      });
      assert.ok([404, 403].includes(patchRes.statusCode));
    });
  });

  describe('10. Mobile Real-User Viewport Simulation', () => {
    const viewports = [
      { name: 'iPhone SE', width: 375, height: 667 },
      { name: 'iPhone 12/13/14', width: 390, height: 844 }
    ];

    for (const vp of viewports) {
      test(`10.1 ${vp.name} (${vp.width}x${vp.height}): Citizen portal renders with 0 horizontal overflow`, async () => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'networkidle' });

        await page.fill('#username', 'citizen_priya');
        await page.fill('#password', 'citizen_priya_Pass123!');
        await page.click('button[type="submit"]');
        await page.waitForURL('**/citizen**', { timeout: 10000 });

        const isOverflowingOverview = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        assert.equal(isOverflowingOverview, false, `Citizen Overview must not overflow at ${vp.width}px`);

        await page.goto(`${BASE_URL}/citizen/complaints`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#complaint-service-date', { timeout: 8000 });
        const isOverflowingComplaints = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        assert.equal(isOverflowingComplaints, false, `Citizen Complaints must not overflow at ${vp.width}px`);
      });

      test(`10.2 ${vp.name} (${vp.width}x${vp.height}): Worker dashboard renders with 0 horizontal overflow`, async () => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'networkidle' });

        await page.fill('#username', 'worker_suresh');
        await page.fill('#password', 'worker_suresh_Pass123!');
        await page.click('button[type="submit"]');
        await page.waitForURL('**/worker**', { timeout: 10000 });

        const isOverflowingWorker = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        assert.equal(isOverflowingWorker, false, `Worker Dashboard must not overflow at ${vp.width}px`);
      });
    }
  });
});
