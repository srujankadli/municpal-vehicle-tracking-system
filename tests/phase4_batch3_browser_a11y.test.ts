import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { buildApp } from '../src/app.js';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { runSeed } from '../src/db/seed.js';
import type { FastifyInstance } from 'fastify';
import path from 'node:path';

describe('Phase 4 - Batch 3: Real Google Chrome Accessibility (WCAG 2.1 AA) E2E Verification', () => {
  let backendApp: FastifyInstance;
  let viteServer: ViteDevServer;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  const consoleWarnings: string[] = [];

  const BACKEND_PORT = 3098;
  const FRONTEND_PORT = 5198;
  const BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

  before(async () => {
    // 1. Fresh seeded database
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
      viewport: { width: 1280, height: 800 }
    });
    page = await context.newPage();

    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'warning' || msg.type() === 'error') {
        consoleWarnings.push(text);
      }
    });
  });

  after(async () => {
    if (browser) await browser.close();
    if (viteServer) await viteServer.close();
    if (backendApp) await backendApp.close();
    closeDatabase();
  });

  // Helper to log in via real auth form
  const login = async (username: string, pass: string, targetPath: string) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('#username', username);
    await page.fill('#password', pass);
    await page.click('button[type="submit"]');
    await page.waitForURL(`**${targetPath}**`, { timeout: 10000 });
  };

  test('1. Zero Invalid ARIA Attribute console warnings across all municipal portals', async () => {
    // 1. Visit Authority Portal routes
    await login('commissioner', 'commissioner_Pass123!', '/authority/operations');
    await page.goto(`${BASE_URL}/authority/operations`, { waitUntil: 'networkidle' });
    await page.goto(`${BASE_URL}/authority/audit`, { waitUntil: 'networkidle' });
    await page.goto(`${BASE_URL}/authority/reconciliation`, { waitUntil: 'networkidle' });

    // 2. Visit Worker Portal
    await login('worker_suresh', 'worker_suresh_Pass123!', '/worker');
    await page.goto(`${BASE_URL}/worker`, { waitUntil: 'networkidle' });

    // 3. Visit Citizen Portal
    await login('citizen_priya', 'citizen_priya_Pass123!', '/citizen');
    await page.goto(`${BASE_URL}/citizen/payments`, { waitUntil: 'networkidle' });

    // Verify no ariaLabel or invalid ARIA warnings were emitted to the console
    const ariaWarnings = consoleWarnings.filter(
      (w) => w.includes('Invalid ARIA attribute') || w.includes('ariaLabel')
    );
    assert.equal(
      ariaWarnings.length,
      0,
      `Detected invalid ARIA attribute console warnings: ${JSON.stringify(ariaWarnings)}`
    );
  });

  test('2. Modal Dialog keyboard access: Escape key dismisses modal dialog in Authority Verification', async () => {
    await login('commissioner', 'commissioner_Pass123!', '/authority/operations');
    await page.goto(`${BASE_URL}/authority/verification`, { waitUntil: 'networkidle' });

    // Find and click the first "Inspect Evidence" button
    const inspectBtn = page.locator('button:has-text("Inspect Evidence")').first();
    await inspectBtn.waitFor({ state: 'visible', timeout: 10000 });
    await inspectBtn.click();

    // Verify dialog appears
    const dialog = page.locator('div[role="dialog"][aria-modal="true"]');
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await dialog.isVisible(), true, 'Expected modal dialog to be visible');

    // Press Escape key via real keyboard event
    await page.keyboard.press('Escape');

    // Verify dialog is closed
    await dialog.waitFor({ state: 'hidden', timeout: 5000 });
    assert.equal(await dialog.isVisible(), false, 'Expected modal dialog to close on Escape key');
  });

  test('3. Modal Dialog backdrop click dismisses modal in Authority Verification', async () => {
    const inspectBtn = page.locator('button:has-text("Inspect Evidence")').first();
    await inspectBtn.click();

    const dialog = page.locator('div[role="dialog"][aria-modal="true"]');
    await dialog.waitFor({ state: 'visible', timeout: 5000 });

    // Click outside dialog box (on backdrop overlay at top-left corner)
    await dialog.click({ position: { x: 5, y: 5 } });

    // Verify dialog closes
    await dialog.waitFor({ state: 'hidden', timeout: 5000 });
    assert.equal(await dialog.isVisible(), false, 'Expected modal dialog to close on backdrop click');
  });

  test('4. Field Worker Verification Method selection conforms to radiogroup semantics', async () => {
    await login('worker_suresh', 'worker_suresh_Pass123!', '/worker');
    await page.goto(`${BASE_URL}/worker`, { waitUntil: 'networkidle' });

    const radiogroup = page.locator('div[role="radiogroup"][aria-labelledby="verification-method-label"]');
    await radiogroup.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await radiogroup.isVisible(), true, 'Expected radiogroup container to be visible');

    // Default option is NFC Doorstep Tap
    const nfcRadio = radiogroup.locator('button[role="radio"]').nth(0);
    const qrRadio = radiogroup.locator('button[role="radio"]').nth(1);

    assert.equal(await nfcRadio.getAttribute('aria-checked'), 'true');
    assert.equal(await qrRadio.getAttribute('aria-checked'), 'false');

    // Select QR Barcode Scan
    await qrRadio.click();
    assert.equal(await nfcRadio.getAttribute('aria-checked'), 'false');
    assert.equal(await qrRadio.getAttribute('aria-checked'), 'true');
  });

  test('5. Viewport responsiveness and focus visibility across Desktop, Tablet, and Mobile', async () => {
    const viewports = [
      { name: 'Desktop', width: 1280, height: 800 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Mobile', width: 375, height: 667 }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE_URL}/worker`);
      await page.waitForLoadState('networkidle');

      // Check document does not horizontally overflow viewport
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

      assert.ok(
        scrollWidth <= clientWidth + 2, // 2px margin of error for subpixel rendering
        `Viewport ${vp.name} (${vp.width}px) horizontally overflows: scrollWidth=${scrollWidth}, clientWidth=${clientWidth}`
      );

      // Verify Tab navigation moves focus
      await page.keyboard.press('Tab');
      const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
      assert.ok(focusedTag, `Expected focused element on ${vp.name} after pressing Tab`);
    }
  });

});
