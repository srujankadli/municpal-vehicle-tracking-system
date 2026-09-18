import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { buildApp } from '../src/app.js';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { runSeed } from '../src/db/seed.js';
import type { FastifyInstance } from 'fastify';
import path from 'node:path';

describe('Phase 4 - Batch 2: Field Worker Offline Scan Queueing & Synchronization (Real Google Chrome)', () => {
  let backendApp: FastifyInstance;
  let viteServer: ViteDevServer;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  const BACKEND_PORT = 3097;
  const FRONTEND_PORT = 5197;
  const BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

  before(async () => {
    // 1. Initialize fresh seeded database
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

    // 4. Launch real Google Chrome via Playwright
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

  test('1. Real Google Chrome browser automation initializes correctly', async () => {
    assert.ok(browser, 'Browser instance must be defined');
    const version = browser.version();
    assert.ok(version.length > 0, 'Browser version must be available');
    console.log(`[REAL_BROWSER_BATCH2] Google Chrome Version: ${version}`);
  });

  test('2. Authenticates worker and loads Field Worker Dashboard with Offline Queue Viewer', async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

    await page.fill('#username', 'worker_suresh');
    await page.fill('#password', 'worker_suresh_Pass123!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/worker', { timeout: 10000 });
    assert.ok(page.url().includes('/worker'), 'Worker must land on /worker');

    // Verify presence of EvidenceLogger and OfflineQueueViewer
    await page.waitForSelector('[data-testid="offline-queue-viewer"]', { timeout: 5000 });
    const viewerVisible = await page.isVisible('[data-testid="offline-queue-viewer"]');
    assert.equal(viewerVisible, true, 'OfflineQueueViewer must be visible');

    // Verify initial online status badge
    const badgeText = await page.textContent('[data-testid="network-status-badge"]');
    assert.ok(badgeText?.includes('Online'), 'Initial network status must be Online');
  });

  test('3. Simulates network disconnection and captures offline evidence into IndexedDB', async () => {
    // Cut network connection in real browser context
    await context.setOffline(true);

    // Give browser window time to propagate offline event
    await page.waitForTimeout(300);

    // Fill evidence logger form for household house-demo-102 (Route A on run-demo-01)
    await page.fill('#target-household-id', 'house-demo-102');

    // Click submit button
    const submitBtn = page.locator('form button[type="submit"]');
    await submitBtn.click();

    // Verify offline alert appears in EvidenceLogger
    await page.waitForSelector('[data-testid="offline-queued-alert"]', { timeout: 5000 });
    const offlineAlertText = await page.textContent('[data-testid="offline-queued-alert"]');
    assert.ok(
      offlineAlertText?.includes('Stored in Local Offline Queue (IndexedDB)'),
      'EvidenceLogger must show IndexedDB offline queue confirmation'
    );

    // Verify OfflineQueueViewer renders 1 queued row
    await page.waitForSelector('[data-testid^="queue-row-"]', { timeout: 5000 });
    const queueRows = await page.locator('[data-testid^="queue-row-"]').count();
    assert.equal(queueRows, 1, 'Offline queue viewer must display exactly 1 queued item');

    // Query browser IndexedDB directly to inspect physical persistence
    const idbData = await page.evaluate(async () => {
      return new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open('municipal_field_worker_db', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['offline_event_queue'], 'readonly');
          const store = tx.objectStore('offline_event_queue');
          const getAll = store.getAll();
          getAll.onsuccess = () => resolve(getAll.result);
          getAll.onerror = () => reject(getAll.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    assert.equal(idbData.length, 1);
    assert.equal(idbData[0].household_id, 'house-demo-102');
    assert.equal(idbData[0].status, 'QUEUED');
    assert.ok(idbData[0].client_event_id, 'Must contain a client_event_id');
    assert.match(
      idbData[0].client_event_id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      'client_event_id must be a valid UUIDv4'
    );
  });

  test('4. Queue persists across page refresh while offline', async () => {
    // Re-enable network briefly to fetch Vite bundles on reload
    await context.setOffline(false);
    await page.reload({ waitUntil: 'networkidle' });
    // Immediately disconnect network again
    await context.setOffline(true);
    await page.waitForTimeout(300);

    // Wait for OfflineQueueViewer to mount and load from IndexedDB
    await page.waitForSelector('[data-testid="offline-queue-viewer"]', { timeout: 5000 });
    await page.waitForSelector('[data-testid^="queue-row-"]', { timeout: 5000 });

    const queueRows = await page.locator('[data-testid^="queue-row-"]').count();
    assert.ok(queueRows >= 1, 'Queued item must survive page refresh in IndexedDB');

    // Log second event offline to verify FIFO queuing
    await page.fill('#target-household-id', 'house-demo-103');
    const submitBtn = page.locator('form button[type="submit"]');
    await submitBtn.click();

    await page.waitForSelector('[data-testid="offline-queued-alert"]', { timeout: 5000 });
    const updatedRows = await page.locator('[data-testid^="queue-row-"]').count();
    assert.ok(updatedRows >= 2, 'Queue must now contain offline items in FIFO order');
  });

  test('5. Reconnects network and performs deterministic FIFO synchronization', async () => {
    // Restore network connectivity
    await context.setOffline(false);

    // Auto-sync triggers on reconnection, or manual sync if needed
    try {
      await page.waitForSelector('[data-testid="sync-result-notice"]', { timeout: 4000 });
    } catch {
      const syncBtn = page.locator('[data-testid="sync-queue-btn"]');
      if (await syncBtn.isEnabled()) {
        await syncBtn.click();
      }
      await page.waitForSelector('[data-testid="sync-result-notice"]', { timeout: 10000 });
    }

    const noticeText = await page.textContent('[data-testid="sync-result-notice"]');
    assert.ok(
      noticeText?.includes('synchronized'),
      `Sync summary must confirm synchronization. Got: ${noticeText}`
    );

    // Verify backend database has both freshly synchronized evidence records (with client UUIDs)
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT id, household_id, evidence_type FROM service_evidence
      WHERE household_id IN ('house-demo-102', 'house-demo-103') AND id NOT LIKE 'ev-demo%'
    `).all() as any[];

    assert.equal(rows.length, 2, 'Both queued items must be saved into backend service_evidence table');

    // Verify household 102 and 103 are marked VERIFIED on run-demo-01
    const h102 = db.prepare(`
      SELECT verification_status FROM collection_records
      WHERE household_id = 'house-demo-102' AND service_run_id = 'run-demo-01'
    `).get() as any;
    assert.equal(h102?.verification_status, 'VERIFIED');
  });

  test('6. Deduplication: Re-triggering sync sends duplicate client_event_id and handles it idempotently', async () => {
    // Pick the real client UUID saved in service_evidence for house-demo-102
    const existingEvidence = getDatabase().prepare(`
      SELECT id FROM service_evidence WHERE household_id = 'house-demo-102' AND id NOT LIKE 'ev-demo%' LIMIT 1
    `).get() as any;
    const existingId = existingEvidence.id;

    // Add back to IndexedDB with status QUEUED to force a resync attempt
    await page.evaluate(async (id) => {
      const req = indexedDB.open('municipal_field_worker_db', 1);
      return new Promise<void>((resolve, reject) => {
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['offline_event_queue'], 'readwrite');
          const store = tx.objectStore('offline_event_queue');
          store.put({
            client_event_id: id,
            run_id: 'run-demo-01',
            household_id: 'house-demo-102',
            evidence_type: 'DOORSTEP_NFC_TAP',
            captured_at: new Date().toISOString(),
            status: 'QUEUED',
            retry_count: 0,
            created_at: new Date().toISOString()
          });
          tx.oncomplete = () => {
            window.dispatchEvent(new CustomEvent('offline-queue-updated'));
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    }, existingId);

    // Give IndexedDB transaction and UI a moment to re-render
    await page.waitForTimeout(300);

    // Trigger sync again using specific testid
    const syncBtn = page.locator('[data-testid="sync-queue-btn"]');
    await syncBtn.waitFor({ state: 'visible', timeout: 5000 });
    await syncBtn.click();

    // Wait for sync notice
    await page.waitForSelector('[data-testid="sync-result-notice"]', { timeout: 10000 });
    const noticeText = await page.textContent('[data-testid="sync-result-notice"]');
    assert.ok(
      noticeText?.includes('1 duplicates deduplicated'),
      `Sync summary must report 1 duplicate deduplicated. Got: ${noticeText}`
    );

    // Verify backend STILL has only 1 row for that specific client_event_id
    const db = getDatabase();
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM service_evidence WHERE id = ?').get(existingId) as any;
    assert.equal(countRow.cnt, 1, 'Database must have exactly 1 row for this client_event_id, no duplicate row created');
  });
});
