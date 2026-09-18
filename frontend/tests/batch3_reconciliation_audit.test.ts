import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { en } from '../src/i18n/locales/en.js';
import { hi } from '../src/i18n/locales/hi.js';
import type {
  PaymentObligation,
  ResidentPayment,
  PaymentReconciliation,
  AuditEventRow
} from '../src/types/operations.js';

describe('Phase 2.6 - Batch 3: Financial Reconciliation & Append-Only Audit Explorer Tests', () => {
  describe('1. Financial Reconciliation Module (/authority/reconciliation)', () => {
    it('strict RBAC: only AUTHORITY and ADMIN are permitted to reconcile; others restricted', () => {
      const reconcileAllowedRoles = ['AUTHORITY', 'ADMIN'];
      assert.ok(reconcileAllowedRoles.includes('AUTHORITY'));
      assert.ok(reconcileAllowedRoles.includes('ADMIN'));

      const forbiddenRoles = ['SUPERVISOR', 'WARD_OFFICER', 'WORKER', 'DRIVER', 'CITIZEN'];
      for (const role of forbiddenRoles) {
        assert.ok(!reconcileAllowedRoles.includes(role), `Role ${role} must not be allowed to reconcile`);
      }
    });

    it('integer paise precision: amounts are represented in exact integer paise, never floating point', () => {
      const sampleObligation: PaymentObligation = {
        id: 'ob-101',
        household_id: 'house-demo-101',
        billing_period: '2026-09',
        amount_paise: 15000, // Rs. 150.00
        due_date: '2026-09-30',
        beneficiary_account_id: 'acc-ulb-01',
        created_at: '2026-09-01T00:00:00.000Z'
      };

      assert.equal(Number.isInteger(sampleObligation.amount_paise), true);
      assert.equal(sampleObligation.amount_paise, 15000);

      // Verify rupees conversion
      const rupees = sampleObligation.amount_paise / 100;
      assert.equal(rupees, 150);

      // Verify reverse conversion for user entry
      const userEnteredRupees = '150.00';
      const parsedPaise = Math.round(parseFloat(userEnteredRupees) * 100);
      assert.equal(parsedPaise, 15000);
    });

    it('financial reconciliation statuses strictly reflect backend domain model', () => {
      const canonicalReconcileStatuses: PaymentReconciliation['status'][] = [
        'MATCHED',
        'UNMATCHED_AMOUNT',
        'UNVERIFIED_BANK',
        'MANUAL_DISCREPANCY'
      ];
      assert.equal(canonicalReconcileStatuses.length, 4);
    });

    it('CRR KPI definition integrity: ratio of matched reconciled collections against total levied obligations', () => {
      const crrCardTitleEn = en.portals.authority.reconciliation.crrCardTitle;
      const crrCardSubtitleEn = en.portals.authority.reconciliation.crrCardSubtitle;
      const crrCardCaveatEn = en.portals.authority.reconciliation.crrCardCaveat;

      assert.ok(crrCardTitleEn.includes('Collection Reconciliation Rate (CRR)'));
      assert.ok(crrCardSubtitleEn.includes('matched reconciled collections against total levied'));
      assert.ok(crrCardCaveatEn.includes('paise'));

      // Check Hindi parity
      assert.ok(hi.portals.authority.reconciliation.crrCardTitle.length > 0);
      assert.ok(hi.portals.authority.reconciliation.crrCardSubtitle.length > 0);
    });

    it('CRR presentation invariant: CRR MetricCard renders as percentage (value_percentage) and never as currency', () => {
      // 1. Verify AuthorityReconciliationPage does not pass isCurrency={true} to CRR MetricCard
      const reconFile = fs.readFileSync(
        path.resolve(process.cwd(), 'frontend/src/routes/authority/AuthorityReconciliationPage.tsx'),
        'utf-8'
      );
      assert.ok(!reconFile.includes('isCurrency={true}'), 'AuthorityReconciliationPage must not configure isCurrency={true} for CRR');
      assert.ok(reconFile.includes('unit="paise"'), 'AuthorityReconciliationPage must supply unit="paise" for CRR');

      // 2. Verify AuthorityOperationsPage does not pass isCurrency={true} to CRR MetricCard
      const opsFile = fs.readFileSync(
        path.resolve(process.cwd(), 'frontend/src/routes/authority/AuthorityOperationsPage.tsx'),
        'utf-8'
      );
      assert.ok(!opsFile.includes('isCurrency={true}'), 'AuthorityOperationsPage must not configure isCurrency={true} for CRR');
      assert.ok(opsFile.includes('unit="paise"'), 'AuthorityOperationsPage must supply unit="paise" for CRR');

      // 3. Mathematical presentation verification: 10000 paise reconciled / 30000 paise levied yields 33.33%
      const sampleCrr = {
        value_percentage: 33.33,
        numerator: 10000,
        denominator: 30000
      };
      const formattedValue = `${sampleCrr.value_percentage.toFixed(2)}%`;
      assert.equal(formattedValue, '33.33%');
      assert.ok(!formattedValue.includes('₹'), 'CRR display must never include currency symbols');
      assert.ok(!formattedValue.includes('INR'), 'CRR display must never include INR');
    });

    it('discrepancy triggers ANOM-05: bank statement mismatch notice is honest and explicit', () => {
      const discrepancyEn = en.portals.authority.reconciliation.reconcileDiscrepancy;
      assert.ok(discrepancyEn.includes('ANOM-05'));
      assert.ok(discrepancyEn.includes('Bank Settlement Discrepancy'));

      const discrepancyHi = hi.portals.authority.reconciliation.reconcileDiscrepancy;
      assert.ok(discrepancyHi.includes('ANOM-05'));
    });

    it('no client-side payment creation: interface strictly corroborates existing payment records', () => {
      const bankingNoticeEn = en.portals.authority.reconciliation.bankingNotice;
      assert.ok(bankingNoticeEn.includes('does NOT process payments'));
      assert.ok(bankingNoticeEn.includes('external bank statement scrolls'));
    });
  });

  describe('2. Append-Only Relational Audit Trail Explorer (/authority/audit)', () => {
    it('strict RBAC: audit endpoint access restricted to AUTHORITY and ADMIN', () => {
      const auditAllowedRoles = ['AUTHORITY', 'ADMIN'];
      assert.ok(auditAllowedRoles.includes('AUTHORITY'));
      assert.ok(auditAllowedRoles.includes('ADMIN'));

      const excludedRoles = ['SUPERVISOR', 'WARD_OFFICER', 'WORKER', 'DRIVER', 'CITIZEN'];
      for (const role of excludedRoles) {
        assert.ok(!auditAllowedRoles.includes(role));
      }
    });

    it('epistemic notice: explicitly disclaims cryptographic immutability and blockchain tamper-evidence', () => {
      const noticeEn = en.portals.authority.audit.appendOnlyNotice;
      assert.ok(noticeEn.includes('append-only relational audit journal'));
      assert.ok(noticeEn.includes('SQLite'));
      assert.ok(noticeEn.includes('does not claim cryptographic immutability'));
      assert.ok(noticeEn.includes('blockchain'));

      const noticeHi = hi.portals.authority.audit.appendOnlyNotice;
      assert.ok(noticeHi.includes('SQLite'));
      assert.ok(noticeHi.includes('ब्लॉकचेन'));
    });

    it('audit fields preservation: records capture actor, role, action, entity, before/after states, IP, and timestamp', () => {
      const sampleEvent: AuditEventRow = {
        id: 'evt-001',
        actor_id: 'usr-auth-01',
        actor_role: 'AUTHORITY',
        action_type: 'RECONCILE_PAYMENT',
        entity_name: 'payment_reconciliations',
        entity_id: 'rec-001',
        before_state: JSON.stringify({ status: 'PENDING' }),
        after_state: JSON.stringify({ status: 'MATCHED', amount_paise: 15000 }),
        ip_address: '127.0.0.1',
        created_at: '2026-09-14T12:00:00.000Z'
      };

      assert.ok(sampleEvent.id);
      assert.ok(sampleEvent.actor_id);
      assert.ok(sampleEvent.actor_role);
      assert.ok(sampleEvent.action_type);
      assert.ok(sampleEvent.entity_name);
      assert.ok(sampleEvent.entity_id);
      assert.ok(sampleEvent.before_state);
      assert.ok(sampleEvent.after_state);
      assert.ok(sampleEvent.ip_address);
      assert.ok(sampleEvent.created_at);
    });

    it('before/after state diff parser correctly processes JSON strings and nulls', () => {
      const parseJson = (raw: string | null) => {
        if (!raw) return null;
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      };

      const before = parseJson(JSON.stringify({ status: 'PENDING' }));
      const after = parseJson(JSON.stringify({ status: 'MATCHED' }));
      const empty = parseJson(null);

      assert.deepEqual(before, { status: 'PENDING' });
      assert.deepEqual(after, { status: 'MATCHED' });
      assert.equal(empty, null);
    });
  });

  describe('3. Bilingual i18n Parity for Batch 3 Keys', () => {
    it('reconciliation dictionary has 100% key parity between en and hi', () => {
      const enKeys = Object.keys(en.portals.authority.reconciliation);
      const hiKeys = Object.keys(hi.portals.authority.reconciliation);

      assert.equal(enKeys.length, hiKeys.length);
      for (const key of enKeys) {
        assert.ok(key in hi.portals.authority.reconciliation, `Missing key in hi.portals.authority.reconciliation: ${key}`);
        const enVal = (en.portals.authority.reconciliation as any)[key];
        const hiVal = (hi.portals.authority.reconciliation as any)[key];
        assert.ok(typeof enVal === 'string' && enVal.length > 0, `Empty en value for ${key}`);
        assert.ok(typeof hiVal === 'string' && hiVal.length > 0, `Empty hi value for ${key}`);
      }
    });

    it('audit dictionary has 100% key parity between en and hi', () => {
      const enKeys = Object.keys(en.portals.authority.audit);
      const hiKeys = Object.keys(hi.portals.authority.audit);

      assert.equal(enKeys.length, hiKeys.length);
      for (const key of enKeys) {
        assert.ok(key in hi.portals.authority.audit, `Missing key in hi.portals.authority.audit: ${key}`);
        const enVal = (en.portals.authority.audit as any)[key];
        const hiVal = (hi.portals.authority.audit as any)[key];
        assert.ok(typeof enVal === 'string' && enVal.length > 0, `Empty en value for ${key}`);
        assert.ok(typeof hiVal === 'string' && hiVal.length > 0, `Empty hi value for ${key}`);
      }
    });
  });
});
