import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { buildApp } from '../src/app.js';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { runSeed } from '../src/db/seed.js';
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import fs from 'node:fs';

describe('Phase 4 - Batch 4: Administrative Compliance, Audit Archival & Export Tooling (Real Google Chrome)', () => {
  let backendApp: FastifyInstance;
  let viteServer: ViteDevServer;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  const BACKEND_PORT = 3099;
  const FRONTEND_PORT = 5199;
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

    context = await browser.newContext({
      acceptDownloads: true
    });
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
    console.log(`[REAL_BROWSER_BATCH4] Google Chrome Version: ${version}`);
  });

  test('2. Authenticates Authority Commissioner and loads Audit Page with Export Panel', async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

    await page.fill('#username', 'commissioner');
    await page.fill('#password', 'commissioner_Pass123!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/authority/**', { timeout: 10000 });

    // Navigate to Audit page
    await page.goto(`${BASE_URL}/authority/audit`, { waitUntil: 'networkidle' });

    // Verify presence of the Administrative Compliance & Audit Export panel
    await page.waitForSelector('#audit-export-dataset', { timeout: 5000 });
    const datasetSelect = await page.isVisible('#audit-export-dataset');
    assert.equal(datasetSelect, true, 'Dataset selector must be visible');

    const formatSelect = await page.isVisible('#audit-export-format');
    assert.equal(formatSelect, true, 'Format selector must be visible');

    // Verify all 5 datasets exist in the dropdown
    const options = await page.$$eval('#audit-export-dataset option', (opts) =>
      opts.map((o) => o.value)
    );
    assert.deepEqual(options, [
      'audit-events',
      'operational-verification',
      'anomalies',
      'payments-reconciliation',
      'configuration-summary'
    ]);
  });

  test('3. Generates and downloads deterministic NDJSON export via real Chrome', async () => {
    // Select operational-verification dataset and ndjson format
    await page.selectOption('#audit-export-dataset', 'operational-verification');
    await page.selectOption('#audit-export-format', 'ndjson');

    // Trigger download and wait for real download event
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    const downloadBtn = page.locator('button:has-text("Generate & Download Export"), button:has-text("निर्यात उत्पन्न करें")');
    await downloadBtn.click();

    const download = await downloadPromise;
    const suggestedFilename = download.suggestedFilename();
    assert.ok(
      suggestedFilename.includes('operational-verification') && suggestedFilename.endsWith('.ndjson'),
      `Filename must match operational-verification*.ndjson, got: ${suggestedFilename}`
    );

    // Save download to temp path and verify contents
    const downloadPath = await download.path();
    assert.ok(downloadPath, 'Download path must exist');
    const content = fs.readFileSync(downloadPath, 'utf8');
    const lines = content.trim().split('\n');
    assert.ok(lines.length >= 1, 'NDJSON must have at least one line');

    const meta = JSON.parse(lines[0]!);
    assert.ok(meta._export_metadata, 'First line must be _export_metadata envelope');
    assert.equal(meta._export_metadata.dataset, 'operational-verification');
    assert.equal(meta._export_metadata.format, 'ndjson');
    assert.ok(meta._export_metadata.disclaimer.includes('NON-DESTRUCTIVE'));
  });

  test('4. Generates and downloads RFC 4180 CSV export with integer paise financial data via real Chrome', async () => {
    // Select payments-reconciliation dataset and csv format
    await page.selectOption('#audit-export-dataset', 'payments-reconciliation');
    await page.selectOption('#audit-export-format', 'csv');

    // Trigger download and wait for real download event
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    const downloadBtn = page.locator('button:has-text("Generate & Download Export"), button:has-text("निर्यात उत्पन्न करें")');
    await downloadBtn.click();

    const download = await downloadPromise;
    const suggestedFilename = download.suggestedFilename();
    assert.ok(
      suggestedFilename.includes('payments-reconciliation') && suggestedFilename.endsWith('.csv'),
      `Filename must match payments-reconciliation*.csv, got: ${suggestedFilename}`
    );

    const downloadPath = await download.path();
    assert.ok(downloadPath, 'Download path must exist');
    const content = fs.readFileSync(downloadPath, 'utf8');
    const lines = content.trim().split('\n');

    // Verify comment metadata
    const commentLines = lines.filter((l) => l.startsWith('# '));
    assert.ok(commentLines.some((l) => l.includes('export_type: payments-reconciliation')));
    assert.ok(commentLines.some((l) => l.includes('ordering_rule: ')));

    // Verify header line
    const headerLine = lines.find((l) => !l.startsWith('#'))!;
    assert.ok(headerLine.includes('amount_paise'), 'CSV header must include amount_paise');
    assert.ok(headerLine.includes('amount_inr_formatted'), 'CSV header must include amount_inr_formatted');
  });

  test('5. RBAC Isolation: Worker role cannot access audit export controls in browser', async () => {
    // Clear session
    await page.evaluate(() => localStorage.clear());

    // Login as worker
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('#username', 'worker_suresh');
    await page.fill('#password', 'worker_suresh_Pass123!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/worker', { timeout: 10000 });

    // Attempt to navigate directly to /authority/audit
    await page.goto(`${BASE_URL}/authority/audit`, { waitUntil: 'networkidle' });

    // The export panel should NOT be visible to Worker
    const exportDatasetVisible = await page.isVisible('#audit-export-dataset');
    assert.equal(exportDatasetVisible, false, 'Audit export controls must NOT be accessible to Worker role');
  });

  test('6. RBAC Isolation: Citizen role cannot access audit export controls in browser', async () => {
    // Clear session
    await page.evaluate(() => localStorage.clear());

    // Login as citizen
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('#username', 'citizen_priya');
    await page.fill('#password', 'citizen_priya_Pass123!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/citizen', { timeout: 10000 });

    // Attempt to navigate directly to /authority/audit
    await page.goto(`${BASE_URL}/authority/audit`, { waitUntil: 'networkidle' });

    // The export panel should NOT be visible to Citizen
    const exportDatasetVisible = await page.isVisible('#audit-export-dataset');
    assert.equal(exportDatasetVisible, false, 'Audit export controls must NOT be accessible to Citizen role');
  });
});
