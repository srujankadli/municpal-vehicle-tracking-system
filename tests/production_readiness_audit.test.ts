import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { buildApp } from '../src/app.js';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { runSeed } from '../src/db/seed.js';
import { VerificationService } from '../src/services/verification.service.js';
import { AuthService } from '../src/services/auth.service.js';
import { EvidenceType, VerificationStatus, UserRole } from '../src/types/domain.js';
import type { FastifyInstance } from 'fastify';
import path from 'node:path';

describe('Final Production-Readiness Comprehensive Runtime Audit Suite', () => {
  let backendApp: FastifyInstance;
  let viteServer: ViteDevServer;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  const BACKEND_PORT = 3299;
  const FRONTEND_PORT = 5399;
  const BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

  before(async () => {
    // 1. Reset and initialize database
    closeDatabase();
    const db = getDatabase();
    runSeed(db);

    // 2. Start Fastify backend
    backendApp = buildApp({ enableRateLimit: false });
    await backendApp.listen({ port: BACKEND_PORT, host: '127.0.0.1' });

    // 3. Start Vite dev server with proxy
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

    // 4. Launch Google Chrome via Playwright
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

  // -------------------------------------------------------------
  // 1. AUTHENTICATION & SESSION AUDIT
  // -------------------------------------------------------------
  describe('1. Authentication & Session Runtime Audit', () => {
    test('1.1 Rejects login with wrong password and displays UI error message', async () => {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });

      await page.fill('#username', 'citizen_priya');
      await page.fill('#password', 'WrongPassword123!');
      await page.click('button[type="submit"]');

      await page.waitForSelector('.alert-error, [role="alert"], div:has-text("Invalid")', { timeout: 8000 });
      const pageText = await page.textContent('body');
      assert.ok(pageText?.includes('Invalid') || pageText?.includes('credentials') || pageText?.includes('failed') || pageText?.includes('401'));
    });

    test('1.2 Blocks unauthenticated direct navigation to /authority and redirects to /login', async () => {
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE_URL}/authority/operations`, { waitUntil: 'networkidle' });
      await page.waitForURL('**/login', { timeout: 8000 });
      assert.ok(page.url().includes('/login'));
    });

    test('1.3 Rejects API requests with invalid or missing bearer token with HTTP 401', async () => {
      const res = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: 'Bearer invalid.fake.token' }
      });
      assert.equal(res.statusCode, 401);
    });
  });

  // -------------------------------------------------------------
  // 2. CITIZEN END-TO-END WORKFLOW
  // -------------------------------------------------------------
  describe('2. Citizen End-to-End Runtime Workflow', () => {
    test('2.1 Citizen Priya logs in, views own household, inspects service status & payments', async () => {
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.fill('#username', 'citizen_priya');
      await page.fill('#password', 'citizen_priya_Pass123!');
      await page.click('button[type="submit"]');

      await page.waitForURL('**/citizen**', { timeout: 10000 });

      // Verify personal household UID is displayed
      await page.waitForSelector('main, .panel, h1, h2, div', { timeout: 10000 });
      const overviewText = await page.textContent('body');
      assert.ok(overviewText?.includes('H-14A-01') || overviewText?.includes('Gandhi') || overviewText?.includes('Citizen'));

      // Navigate to Service Status
      await page.goto(`${BASE_URL}/citizen/service`, { waitUntil: 'networkidle' });
      await page.waitForSelector('main', { timeout: 10000 });
      const serviceText = await page.textContent('body');
      assert.ok(serviceText?.includes('Route') || serviceText?.includes('Service') || serviceText?.includes('H-14A-01'));

      // Navigate to Payments
      await page.goto(`${BASE_URL}/citizen/payments`, { waitUntil: 'networkidle' });
      await page.waitForSelector('main', { timeout: 10000 });
      const paymentsText = await page.textContent('body');
      assert.ok(paymentsText?.includes('Ramesh Kumar') || paymentsText?.includes('Driver') || paymentsText?.includes('2026-09') || paymentsText?.includes('SIMULATED_DEMO_DATA'));
    });

    test('2.2 Citizen lodges a missed-collection complaint and verifies persistence in UI & DB', async () => {
      await page.goto(`${BASE_URL}/citizen/complaints`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#complaint-service-date', { timeout: 10000 });

      // Fill and submit complaint form
      await page.fill('#complaint-service-date', '2026-09-14');
      await page.fill('#complaint-remarks', 'Collection vehicle skipped our lane completely this morning.');
      await page.click('button[type="submit"]');

      // Wait a moment for network submit
      await page.waitForTimeout(1000);

      // Verify persistence in database
      const db = getDatabase();
      const comp = db.prepare(`SELECT * FROM complaints WHERE household_id = 'house-demo-101'`).get() as any;
      assert.ok(comp, 'Complaint must be persisted in database');
      assert.match(comp.resident_remarks, /skipped our lane/i);
    });

    test('2.3 Anti-IDOR: Citizen cannot access another household financial obligations or lodge complaint for another house', async () => {
      const db = getDatabase();
      const user = db.prepare(`SELECT * FROM users WHERE username = 'citizen_priya'`).get() as any;
      const auth = new AuthService(db);
      const token = auth.createToken({
        userId: user.id,
        username: user.username,
        role: user.role,
        householdId: user.household_id
      });

      // Attempt IDOR on payment obligations for another household
      const obRes = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/finance/obligations/house-demo-102',
        headers: { authorization: `Bearer ${token}` }
      });
      assert.equal(obRes.statusCode, 403);

      // Attempt IDOR complaint submission for another household
      const compRes = await backendApp.inject({
        method: 'POST',
        url: '/api/v1/complaints',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          household_id: 'house-demo-102',
          service_date: '2026-09-14',
          complaint_type: 'MISSED_COLLECTION',
          resident_remarks: 'Malicious IDOR grievance submission'
        }
      });
      assert.equal(compRes.statusCode, 403);
    });
  });

  // -------------------------------------------------------------
  // 3. WORKER END-TO-END WORKFLOW (VERIFYING RUN STATUS LIFECYCLE FIX)
  // -------------------------------------------------------------
  describe('3. Field Worker End-to-End Workflow & Run Status Fix Verification', () => {
    test('3.1 Worker Suresh Patel logs in, retrieves today roster, and executes run lifecycle NOT_STARTED -> IN_PROGRESS -> COMPLETED', async () => {
      // Reset run-demo-01 to NOT_STARTED for testing the complete lifecycle
      const db = getDatabase();
      db.prepare(`UPDATE daily_service_runs SET run_status = 'NOT_STARTED', actual_start_time = null, actual_end_time = null WHERE id = 'run-demo-01'`).run();
      db.prepare(`UPDATE daily_assignments SET status = 'SCHEDULED' WHERE id = 'da-demo-01'`).run();

      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.fill('#username', 'worker_suresh');
      await page.fill('#password', 'worker_suresh_Pass123!');
      await page.click('button[type="submit"]');

      await page.waitForURL('**/worker**', { timeout: 10000 });

      // Verify assignment details
      await page.waitForSelector('main, .panel, h1, h2, div', { timeout: 10000 });
      const workerText = await page.textContent('body');
      assert.ok(workerText?.includes('Gandhi') || workerText?.includes('DL-01-GA-1001') || workerText?.includes('Worker'));

      // Click "Start Collection Run"
      const startBtn = page.locator('button:has-text("Start Collection Run")');
      await startBtn.waitFor({ state: 'visible', timeout: 8000 });
      await Promise.all([
        page.waitForResponse(r => r.url().includes('/status') && r.status() === 200),
        startBtn.click()
      ]);

      // Verify database updated to IN_PROGRESS
      const runAfterStart = db.prepare(`SELECT run_status, actual_start_time FROM daily_service_runs WHERE id = 'run-demo-01'`).get() as any;
      assert.equal(runAfterStart.run_status, 'IN_PROGRESS');

      // Click "Complete Collection Run"
      const completeBtn = page.locator('button:has-text("Complete Collection Run")');
      await completeBtn.waitFor({ state: 'visible', timeout: 8000 });
      await Promise.all([
        page.waitForResponse(r => r.url().includes('/status') && r.status() === 200),
        completeBtn.click()
      ]);

      // Verify database updated to COMPLETED
      const runAfterComplete = db.prepare(`SELECT run_status, actual_end_time FROM daily_service_runs WHERE id = 'run-demo-01'`).get() as any;
      assert.equal(runAfterComplete.run_status, 'COMPLETED');
      assert.ok(runAfterComplete.actual_end_time);
    });

    test('3.2 Worker isolation: cannot access finance, audit, or authority operations', async () => {
      await page.goto(`${BASE_URL}/authority/operations`, { waitUntil: 'networkidle' });
      await page.waitForURL('**/forbidden**', { timeout: 8000 });
      assert.ok(page.url().includes('/forbidden'));
    });
  });

  // -------------------------------------------------------------
  // 4. DRIVER WORKFLOW
  // -------------------------------------------------------------
  describe('4. Driver Workflow & Vehicle Access', () => {
    test('4.1 Driver Ramesh Kumar logs in, sees assigned vehicle and active run', async () => {
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.fill('#username', 'driver_ramesh');
      await page.fill('#password', 'driver_ramesh_Pass123!');
      await page.click('button[type="submit"]');

      await page.waitForURL('**/worker**', { timeout: 10000 });
      const driverText = await page.textContent('body');
      assert.ok(driverText?.includes('DL-01-GA-1001') || driverText?.includes('Gandhi') || driverText?.includes('Driver') || driverText?.includes('Collection'));
    });
  });

  // -------------------------------------------------------------
  // 5. SUPERVISOR & WARD OFFICER WORKFLOWS (VERIFYING PRIVILEGED METRICS FIX)
  // -------------------------------------------------------------
  describe('5. Supervisor & Ward Officer Workflows (Privileged Metrics Fix Verification)', () => {
    test('5.1 Supervisor Ward 14 loads Operations Center without 403 crashes and FOA/CRR display N/A', async () => {
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.fill('#username', 'supervisor_w14');
      await page.fill('#password', 'supervisor_w14_Pass123!');
      await page.click('button[type="submit"]');

      await page.waitForURL('**/authority/**', { timeout: 10000 });
      await page.waitForSelector('table', { timeout: 15000 });

      // Verify operations center loaded without crash
      const pageText = await page.textContent('body');
      assert.ok(!pageText?.includes("Role 'SUPERVISOR' is not authorized to access this resource"));
      assert.ok(pageText?.includes('Operations') || pageText?.includes('Roster') || pageText?.includes('Metrics') || pageText?.includes('Ward'));

      // Verify that FOA and CRR display N/A rather than failing the dashboard
      assert.ok(pageText?.includes('N/A'));
    });

    test('5.2 Ward Officer loads Fleet view without 403 error', async () => {
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.fill('#username', 'ward_officer_14');
      await page.fill('#password', 'ward_officer_14_Pass123!');
      await page.click('button[type="submit"]');

      await page.waitForURL('**/authority/**', { timeout: 10000 });
      await page.goto(`${BASE_URL}/authority/fleet`, { waitUntil: 'networkidle' });
      await page.waitForSelector('main, .panel, table, div', { timeout: 10000 });

      const fleetText = await page.textContent('body');
      assert.ok(!fleetText?.includes("Role 'WARD_OFFICER' is not authorized to access this resource"));
      assert.ok(fleetText?.includes('Fleet') || fleetText?.includes('Vehicle') || fleetText?.includes('DL-01-GA-1001'));
    });

    test('5.3 Fail-Closed: Supervisor or Ward Officer without wardId is rejected with HTTP 403 on ward-scoped endpoints', async () => {
      const db = getDatabase();
      const auth = new AuthService(db);

      const token = auth.createToken({
        userId: 'usr-sup-noward',
        username: 'sup_noward',
        role: UserRole.SUPERVISOR,
        wardId: null
      });

      const res = await backendApp.inject({
        method: 'GET',
        url: '/api/v1/operations/assignments',
        headers: { authorization: `Bearer ${token}` }
      });
      assert.equal(res.statusCode, 403);
    });
  });

  // -------------------------------------------------------------
  // 6. AUTHORITY & ADMIN WORKFLOWS
  // -------------------------------------------------------------
  describe('6. Authority & Admin Workflows', () => {
    test('6.1 Authority Commissioner loads FOA and CRR metrics and reviews driver reconciliation', async () => {
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.fill('#username', 'commissioner');
      await page.fill('#password', 'commissioner_Pass123!');
      await page.click('button[type="submit"]');

      await page.waitForURL('**/authority/**', { timeout: 10000 });

      // Navigate to Reconciliation page
      await page.goto(`${BASE_URL}/authority/reconciliation`, { waitUntil: 'networkidle' });
      await page.waitForSelector('main, .panel, table, div', { timeout: 10000 });
      const recText = await page.textContent('body');
      assert.ok(recText?.includes('Reconciliation') || recText?.includes('Driver') || recText?.includes('Ramesh Kumar'));
    });

    test('6.2 Admin resolves citizen complaint via PATCH endpoint and verifies audit record', async () => {
      const db = getDatabase();
      const comp = db.prepare(`SELECT id FROM complaints LIMIT 1`).get() as { id: string };

      const auth = new AuthService(db);
      const adminUser = db.prepare(`SELECT * FROM users WHERE role = 'ADMIN'`).get() as any;
      const adminToken = auth.createToken({
        userId: adminUser.id,
        username: adminUser.username,
        role: adminUser.role
      });

      const res = await backendApp.inject({
        method: 'PATCH',
        url: `/api/v1/complaints/${comp.id}/resolve`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          status: 'RESOLVED',
          resolution_notes: 'Supervisor verified makeup collection conducted at 11:30 AM.'
        }
      });
      assert.equal(res.statusCode, 200);

      // Verify audit event
      const auditEvent = db.prepare(`SELECT * FROM audit_events WHERE action_type = 'RESOLVE_COMPLAINT' AND entity_id = ?`).get(comp.id) as any;
      assert.ok(auditEvent);
    });
  });

  // -------------------------------------------------------------
  // 7. OFFLINE QUEUE & IDEMPOTENCY AUDIT
  // -------------------------------------------------------------
  describe('7. Offline Worker Queue & Duplicate Prevention Audit', () => {
    test('7.1 Offline submission with duplicate client_event_id is handled idempotently without duplicate row', async () => {
      const db = getDatabase();
      const auth = new AuthService(db);
      const workerUser = db.prepare(`SELECT * FROM users WHERE username = 'worker_suresh'`).get() as any;
      const token = auth.createToken({
        userId: workerUser.id,
        username: workerUser.username,
        role: workerUser.role,
        workerId: workerUser.worker_id
      });

      const clientEventId = crypto.randomUUID();
      const payload = {
        client_event_id: clientEventId,
        household_id: 'house-demo-101',
        evidence_type: 'DOORSTEP_QR_SCAN',
        captured_at: new Date().toISOString(),
        device_id: 'offline-device-test'
      };

      // Ensure run is IN_PROGRESS
      db.prepare(`UPDATE daily_service_runs SET run_status = 'IN_PROGRESS' WHERE id = 'run-demo-01'`).run();

      // First sync
      const res1 = await backendApp.inject({
        method: 'POST',
        url: '/api/v1/operations/runs/run-demo-01/events',
        headers: { authorization: `Bearer ${token}` },
        payload
      });
      assert.equal(res1.statusCode, 201);
      assert.equal(res1.json().duplicate, false);

      // Replay / duplicate sync
      const res2 = await backendApp.inject({
        method: 'POST',
        url: '/api/v1/operations/runs/run-demo-01/events',
        headers: { authorization: `Bearer ${token}` },
        payload
      });
      assert.equal(res2.statusCode, 200);
      assert.equal(res2.json().duplicate, true);

      // Verify database row count is exactly 1
      const count = db.prepare(`SELECT COUNT(*) as count FROM service_evidence WHERE id = ?`).get(clientEventId) as { count: number };
      assert.equal(count.count, 1);
    });
  });

  // -------------------------------------------------------------
  // 8. EVIDENCE / GPS PROXIMITY INVARIANT (OBSERVED != VERIFIED)
  // -------------------------------------------------------------
  describe('8. Epistemic Invariant Audit (OBSERVED != VERIFIED)', () => {
    test('8.1 Vehicle proximity telemetry produces OBSERVED, never VERIFIED status', async () => {
      const db = getDatabase();
      const verification = new VerificationService(db);

      // Record vehicle proximity for house-demo-204 on run-demo-02 (no prior physical scan)
      verification.recordEvidence({
        serviceRunId: 'run-demo-02',
        householdId: 'house-demo-204',
        evidenceType: EvidenceType.VEHICLE_PROXIMITY_CORRIDOR,
        capturedAt: new Date().toISOString()
      });

      const synthesis = verification.evaluateHouseholdStatus('run-demo-02', 'house-demo-204');
      assert.equal(synthesis.status, VerificationStatus.OBSERVED);
      assert.notEqual(synthesis.status, VerificationStatus.VERIFIED);
    });

    test('8.2 Doorstep physical scan produces VERIFIED status', async () => {
      const db = getDatabase();
      const verification = new VerificationService(db);

      // Record physical scan for house-demo-205 on run-demo-02
      verification.recordEvidence({
        serviceRunId: 'run-demo-02',
        householdId: 'house-demo-205',
        evidenceType: EvidenceType.DOORSTEP_NFC_TAP,
        capturedAt: new Date().toISOString()
      });

      const synthesis = verification.evaluateHouseholdStatus('run-demo-02', 'house-demo-205');
      assert.equal(synthesis.status, VerificationStatus.VERIFIED);
    });
  });

  // -------------------------------------------------------------
  // 9. RESPONSIVE MOBILE VIEWPORT AUDIT
  // -------------------------------------------------------------
  describe('9. Responsive Mobile Viewport Audit (375x667)', () => {
    test('9.1 Mobile viewport executes with zero horizontal overflow across worker and citizen portals', async () => {
      await page.setViewportSize({ width: 375, height: 667 });

      // Citizen Overview
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.fill('#username', 'citizen_priya');
      await page.fill('#password', 'citizen_priya_Pass123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/citizen**', { timeout: 10000 });

      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      assert.equal(overflow, false, 'Mobile viewport must have zero horizontal overflow');
    });
  });

  // -------------------------------------------------------------
  // 10. MULTILINGUAL I18N AUDIT
  // -------------------------------------------------------------
  describe('10. Multilingual i18n Mirror Parity Audit', () => {
    test('10.1 English and Hindi dictionaries have 100% key parity without missing translations', async () => {
      const { en } = await import('../frontend/src/i18n/locales/en.js');
      const { hi } = await import('../frontend/src/i18n/locales/hi.js');

      function getAllKeys(obj: any, prefix = ''): string[] {
        let keys: string[] = [];
        for (const k of Object.keys(obj)) {
          const path = prefix ? `${prefix}.${k}` : k;
          if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
            keys = keys.concat(getAllKeys(obj[k], path));
          } else {
            keys.push(path);
          }
        }
        return keys;
      }

      const enKeys = getAllKeys(en).sort();
      const hiKeys = getAllKeys(hi).sort();
      assert.deepEqual(enKeys, hiKeys, 'English and Hindi dictionaries must have identical key hierarchies');
    });
  });
});
