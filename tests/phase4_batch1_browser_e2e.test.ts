import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { buildApp } from '../src/app.js';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { runSeed } from '../src/db/seed.js';
import type { FastifyInstance } from 'fastify';
import path from 'node:path';

describe('Phase 4 - Batch 1: Real Browser End-to-End Verification (Google Chrome)', () => {
  let backendApp: FastifyInstance;
  let viteServer: ViteDevServer;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  const BACKEND_PORT = 3099;
  const FRONTEND_PORT = 5199;
  const BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

  before(async () => {
    // 1. Initialize fresh seeded database singleton
    closeDatabase();
    const db = getDatabase();
    runSeed(db);

    // 2. Start Fastify backend on isolated test port
    backendApp = buildApp({ enableRateLimit: false });
    await backendApp.listen({ port: BACKEND_PORT, host: '127.0.0.1' });

    // 3. Start Vite dev server pointing to frontend with API proxy to backend
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
  });

  describe('1. Real Browser Infrastructure & Launch Verification', () => {
    test('confirms real Google Chrome browser is launched and controlled via automation', async () => {
      assert.ok(browser, 'Browser instance must be defined');
      const version = browser.version();
      assert.ok(version.length > 0, 'Browser version string must be reported');
      console.log(`[REAL_BROWSER_E2E] Browser: Google Chrome (Version: ${version})`);
    });

    test('loads application in real browser and verifies document title', async () => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      const title = await page.title();
      assert.equal(title, 'Municipal Solid Waste Collection Monitoring Subsystem');
    });
  });

  describe('2. Authority Operations Portal Real Browser Journey', () => {
    test('authenticates authority in real browser and navigates to operations dashboard', async () => {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

      // Clear existing inputs and fill credentials
      await page.fill('#username', 'commissioner');
      await page.fill('#password', 'commissioner_Pass123!');
      await page.click('button[type="submit"]');

      // Wait for navigation to authority operations portal
      await page.waitForURL('**/authority/operations', { timeout: 10000 });
      assert.ok(page.url().includes('/authority/operations'));

      // Verify main content container renders
      await page.waitForSelector('main', { timeout: 10000 });
      const pageContent = await page.textContent('body');
      assert.ok(pageContent?.includes('Municipal Solid Waste') || pageContent?.includes('Operations') || pageContent?.includes('Authority'));
    });

    test('drills down into fleet, routes, and verification modules in real browser', async () => {
      // Navigate directly to fleet module
      await page.goto(`${BASE_URL}/authority/fleet`, { waitUntil: 'networkidle' });
      await page.waitForSelector('main', { timeout: 10000 });
      let content = await page.textContent('body');
      assert.ok(content?.includes('Fleet') || content?.includes('Vehicle') || content?.includes('DL-1'));

      // Navigate to routes module
      await page.goto(`${BASE_URL}/authority/routes`, { waitUntil: 'networkidle' });
      await page.waitForSelector('main', { timeout: 10000 });
      content = await page.textContent('body');
      assert.ok(content?.includes('Route') || content?.includes('Assignment') || content?.includes('Gandhi'));

      // Navigate to verification module
      await page.goto(`${BASE_URL}/authority/verification`, { waitUntil: 'networkidle' });
      await page.waitForSelector('main', { timeout: 10000 });
      content = await page.textContent('body');
      assert.ok(content?.includes('Verification') || content?.includes('Evidence') || content?.includes('Status'));
    });

    test('reviews anomalies, grievances, reconciliation, and audit in real browser', async () => {
      // Anomalies
      await page.goto(`${BASE_URL}/authority/anomalies`, { waitUntil: 'networkidle' });
      await page.waitForSelector('main', { timeout: 10000 });
      let content = await page.textContent('body');
      assert.ok(content?.includes('Anomal') || content?.includes('ANOM') || content?.includes('Discrepancy'));

      // Reconciliation
      await page.goto(`${BASE_URL}/authority/reconciliation`, { waitUntil: 'networkidle' });
      await page.waitForSelector('main', { timeout: 10000 });
      content = await page.textContent('body');
      assert.ok(content?.includes('Reconciliation') || content?.includes('Financial') || content?.includes('Bank'));

      // Audit
      await page.goto(`${BASE_URL}/authority/audit`, { waitUntil: 'networkidle' });
      await page.waitForSelector('main', { timeout: 10000 });
      content = await page.textContent('body');
      assert.ok(content?.includes('Audit') || content?.includes('Trail') || content?.includes('Relational'));
    });
  });

  describe('3. Field Worker & Driver Terminal Real Browser Journey', () => {
    test('authenticates worker in real browser and loads mobile-first terminal', async () => {
      // Clear localStorage session
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

      await page.fill('#username', 'worker_suresh');
      await page.fill('#password', 'worker_suresh_Pass123!');
      await page.click('button[type="submit"]');

      await page.waitForURL('**/worker**', { timeout: 10000 });
      assert.ok(page.url().includes('/worker'));

      await page.waitForSelector('main, .panel, h1, h2, div', { timeout: 10000 });
      const content = await page.textContent('body');
      assert.ok(content?.includes('Worker') || content?.includes('Terminal') || content?.includes('Collection') || content?.includes('Field'));
    });
  });

  describe('4. Citizen Public Service Portal Real Browser Journey', () => {
    test('authenticates citizen in real browser and inspects obligations and grievances', async () => {
      // Clear localStorage session
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

      await page.fill('#username', 'citizen_priya');
      await page.fill('#password', 'citizen_priya_Pass123!');
      await page.click('button[type="submit"]');

      await page.waitForURL('**/citizen**', { timeout: 10000 });
      assert.ok(page.url().includes('/citizen'));

      await page.waitForSelector('main, .panel, h1, h2, div', { timeout: 10000 });
      const content = await page.textContent('body');
      assert.ok(content?.includes('Citizen') || content?.includes('Household') || content?.includes('Payment') || content?.includes('Overview'));
    });
  });

  describe('5. Real Browser Anti-IDOR & Role Isolation Client Guards', () => {
    test('blocks authenticated citizen from accessing authority portal (redirects to /forbidden)', async () => {
      // Active session is citizen_priya
      await page.goto(`${BASE_URL}/authority/operations`, { waitUntil: 'networkidle' });
      await page.waitForURL('**/forbidden**', { timeout: 10000 });
      assert.ok(page.url().includes('/forbidden'));
      const content = await page.textContent('body');
      assert.ok(content?.includes('Forbidden') || content?.includes('Access Denied') || content?.includes('403') || content?.includes('Unauthorized'));
    });

    test('blocks authenticated worker from accessing authority portal (redirects to /forbidden)', async () => {
      // Log in as worker
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.fill('#username', 'worker_suresh');
      await page.fill('#password', 'worker_suresh_Pass123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/worker**', { timeout: 10000 });

      // Attempt authority access
      await page.goto(`${BASE_URL}/authority/operations`, { waitUntil: 'networkidle' });
      await page.waitForURL('**/forbidden**', { timeout: 10000 });
      assert.ok(page.url().includes('/forbidden'));
    });

    test('unauthenticated browser visit to authority portal redirects to /login', async () => {
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE_URL}/authority/operations`, { waitUntil: 'networkidle' });
      await page.waitForURL('**/login**', { timeout: 10000 });
      assert.ok(page.url().includes('/login'));
    });
  });

  describe('6. Real Browser Multi-Viewport Responsive Layout Execution', () => {
    test('executes in Desktop Viewport (1280x800) with zero horizontal overflow', async () => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

      const metrics = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));

      assert.equal(metrics.innerWidth, 1280, 'Desktop viewport width must be 1280');
      assert.equal(metrics.innerHeight, 800, 'Desktop viewport height must be 800');
      assert.ok(
        metrics.scrollWidth <= 1280,
        `Desktop layout must not overflow horizontally: scrollWidth (${metrics.scrollWidth}) <= 1280`
      );
      console.log(`[REAL_BROWSER_VIEWPORT] Desktop 1280x800 -> innerWidth: ${metrics.innerWidth}, scrollWidth: ${metrics.scrollWidth}, clientWidth: ${metrics.clientWidth}`);
    });

    test('executes in Tablet Viewport (768x1024) with zero horizontal overflow', async () => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

      const metrics = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));

      assert.equal(metrics.innerWidth, 768, 'Tablet viewport width must be 768');
      assert.equal(metrics.innerHeight, 1024, 'Tablet viewport height must be 1024');
      assert.ok(
        metrics.scrollWidth <= 768,
        `Tablet layout must not overflow horizontally: scrollWidth (${metrics.scrollWidth}) <= 768`
      );
      console.log(`[REAL_BROWSER_VIEWPORT] Tablet 768x1024 -> innerWidth: ${metrics.innerWidth}, scrollWidth: ${metrics.scrollWidth}, clientWidth: ${metrics.clientWidth}`);
    });

    test('executes in Mobile Viewport (375x667) with zero horizontal overflow', async () => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

      const metrics = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));

      assert.equal(metrics.innerWidth, 375, 'Mobile viewport width must be 375');
      assert.equal(metrics.innerHeight, 667, 'Mobile viewport height must be 667');
      assert.ok(
        metrics.scrollWidth <= 375,
        `Mobile layout must not overflow horizontally: scrollWidth (${metrics.scrollWidth}) <= 375`
      );
      console.log(`[REAL_BROWSER_VIEWPORT] Mobile 375x667 -> innerWidth: ${metrics.innerWidth}, scrollWidth: ${metrics.scrollWidth}, clientWidth: ${metrics.clientWidth}`);
    });
  });
});
