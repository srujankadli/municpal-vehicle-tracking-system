import { describe, it } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Button } from '../src/components/ui/Button.js';
import { StatusBadge } from '../src/components/ui/StatusBadge.js';
import { I18nProvider } from '../src/i18n/I18nContext.js';
import { en } from '../src/i18n/locales/en.js';
import { hi } from '../src/i18n/locales/hi.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 4 - Batch 3: WCAG 2.1 AA Accessibility Audit & Remediation Tests', () => {

  describe('1. WCAG 4.1.2 & ARIA Valid Attributes: Button Component', () => {
    it('Button emits standard aria-label attribute when ariaLabel prop is supplied', () => {
      const html = renderToString(
        React.createElement(Button, { ariaLabel: 'Close Dialog' }, 'X')
      );
      assert.ok(html.includes('aria-label="Close Dialog"'), 'Expected rendered HTML to include aria-label');
      assert.ok(!html.includes('ariaLabel='), 'Expected rendered HTML to NOT include invalid React prop ariaLabel');
    });

    it('Button emits standard aria-label attribute when standard aria-label prop is supplied', () => {
      const html = renderToString(
        React.createElement(Button, { 'aria-label': 'Refresh Data' }, 'Refresh')
      );
      assert.ok(html.includes('aria-label="Refresh Data"'), 'Expected rendered HTML to include aria-label');
    });

    it('Button renders icon with aria-hidden="true" to avoid screen reader noise', () => {
      const icon = React.createElement('svg', { 'data-testid': 'sample-icon' });
      const html = renderToString(
        React.createElement(Button, { icon }, 'Save')
      );
      assert.ok(html.includes('aria-hidden="true"'), 'Expected icon wrapper to have aria-hidden="true"');
    });
  });

  describe('2. WCAG 1.4.1 (Non-Color-Alone) & 1.3.1 (Info and Relationships): StatusBadge Queue Support', () => {
    it('StatusBadge supports category="queue" with distinct icons and text for QUEUED, SYNCING, SYNCED', () => {
      const statuses = ['QUEUED', 'SYNCING', 'SYNCED'] as const;

      for (const status of statuses) {
        const html = renderToString(
          React.createElement(
            I18nProvider,
            null,
            React.createElement(StatusBadge, { category: 'queue', status })
          )
        );

        // Verify it rendered a badge container with status title prefix
        assert.ok(html.includes('class="status-badge"'), `Expected badge class for ${status}`);
        assert.ok(html.includes('aria-hidden="true"'), `Expected non-color icon for ${status}`);
        
        // Verify text content matches English localization
        const expectedText = (en as any).status.queue[status];
        assert.ok(html.includes(expectedText), `Expected HTML to contain localized text "${expectedText}" for ${status}`);
      }
    });

    it('Bilingual i18n parity exists for status.queue between English and Hindi', () => {
      const enQueue = (en as any).status.queue;
      const hiQueue = (hi as any).status.queue;

      assert.ok(enQueue, 'English status.queue must exist');
      assert.ok(hiQueue, 'Hindi status.queue must exist');

      const requiredKeys = ['QUEUED', 'SYNCING', 'SYNCED', 'FAILED'];
      for (const key of requiredKeys) {
        assert.ok(enQueue[key], `Missing English key for status.queue.${key}`);
        assert.ok(hiQueue[key], `Missing Hindi key for status.queue.${key}`);
      }
    });
  });

  describe('3. WCAG 2.1.1 (Keyboard) & 2.1.2 (No Keyboard Trap): Modal Dialog Escape Handlers', () => {
    const modalFiles = [
      'AuthorityAuditPage.tsx',
      'AuthorityAnomaliesPage.tsx',
      'AuthorityReconciliationPage.tsx',
      'AuthorityVerificationPage.tsx',
      'CitizenPaymentsPage.tsx'
    ];

    it('All modal views implement Escape key event listener to enable keyboard dismissal', () => {
      for (const fileName of modalFiles) {
        const fullPath = path.resolve(process.cwd(), 'frontend', 'src', 'routes', fileName.startsWith('Citizen') ? 'citizen' : 'authority', fileName);
        const content = fs.readFileSync(fullPath, 'utf8');

        assert.ok(
          content.includes("e.key === 'Escape'"),
          `Expected ${fileName} to handle e.key === 'Escape'`
        );
        assert.ok(
          content.includes("addEventListener('keydown'") || content.includes('addEventListener("keydown"'),
          `Expected ${fileName} to add keydown listener`
        );
        assert.ok(
          content.includes("removeEventListener('keydown'") || content.includes('removeEventListener("keydown"'),
          `Expected ${fileName} to clean up keydown listener`
        );
      }
    });

    it('All modal containers specify role="dialog" and aria-modal="true"', () => {
      for (const fileName of modalFiles) {
        const fullPath = path.resolve(process.cwd(), 'frontend', 'src', 'routes', fileName.startsWith('Citizen') ? 'citizen' : 'authority', fileName);
        const content = fs.readFileSync(fullPath, 'utf8');

        assert.ok(content.includes('role="dialog"'), `Expected ${fileName} to contain role="dialog"`);
        assert.ok(content.includes('aria-modal="true"'), `Expected ${fileName} to contain aria-modal="true"`);
        assert.ok(content.includes('aria-labelledby="'), `Expected ${fileName} to contain aria-labelledby for accessible name`);
      }
    });
  });

  describe('4. WCAG 1.3.1 (Info and Relationships) & 3.3.2 (Labels or Instructions): Field Worker & Citizen Forms', () => {
    it('EvidenceLogger provides accessible radiogroup semantics for verification method selection', () => {
      const fullPath = path.resolve(process.cwd(), 'frontend', 'src', 'components', 'worker', 'EvidenceLogger.tsx');
      const content = fs.readFileSync(fullPath, 'utf8');

      assert.ok(content.includes('role="radiogroup"'), 'EvidenceLogger must contain role="radiogroup"');
      assert.ok(content.includes('aria-labelledby="verification-method-label"'), 'EvidenceLogger must label the radiogroup');
      assert.ok(content.includes('role="radio"'), 'EvidenceLogger options must specify role="radio"');
      assert.ok(content.includes('aria-checked='), 'EvidenceLogger options must specify aria-checked state');
    });

    it('EvidenceLogger household input is explicitly linked to label via htmlFor and id', () => {
      const fullPath = path.resolve(process.cwd(), 'frontend', 'src', 'components', 'worker', 'EvidenceLogger.tsx');
      const content = fs.readFileSync(fullPath, 'utf8');

      assert.ok(content.includes('htmlFor="target-household-id"'), 'EvidenceLogger must have htmlFor="target-household-id"');
      assert.ok(content.includes('id="target-household-id"'), 'EvidenceLogger input must have id="target-household-id"');
    });

    it('Citizen complaints form inputs have explicit label associations', () => {
      const fullPath = path.resolve(process.cwd(), 'frontend', 'src', 'routes', 'citizen', 'CitizenComplaintsPage.tsx');
      const content = fs.readFileSync(fullPath, 'utf8');

      assert.ok(content.includes('htmlFor="complaint-service-date"'), 'Missing htmlFor for service date');
      assert.ok(content.includes('id="complaint-service-date"'), 'Missing id for service date');
      assert.ok(content.includes('htmlFor="complaint-type-select"'), 'Missing htmlFor for complaint type');
      assert.ok(content.includes('id="complaint-type-select"'), 'Missing id for complaint type');
      assert.ok(content.includes('htmlFor="complaint-remarks"'), 'Missing htmlFor for remarks');
      assert.ok(content.includes('id="complaint-remarks"'), 'Missing id for remarks');
    });
  });

  describe('5. WCAG 2.4.7 (Focus Visible): CSS Token Invariants', () => {
    it('Design system defines universal *:focus-visible outline', () => {
      const cssPath = path.resolve(process.cwd(), 'frontend', 'src', 'design-system', 'tokens.css');
      const content = fs.readFileSync(cssPath, 'utf8');

      assert.ok(content.includes('*:focus-visible'), 'Design tokens must specify *:focus-visible');
      assert.ok(content.includes('outline: 2px solid var(--color-primary);'), 'Focus ring must have at least 2px solid outline');
      assert.ok(content.includes('outline-offset: 2px;'), 'Focus ring must provide distinct outline-offset');
    });
  });

});
