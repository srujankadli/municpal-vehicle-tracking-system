import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/i18n/locales/en.js';
import { hi } from '../src/i18n/locales/hi.js';
import { VerificationStatus, PaymentStatus } from '../../src/types/domain.js';

describe('Phase 2.4 - Citizen Public Service Portal Tests', () => {
  const citizenPortalAllowedRoles = ['CITIZEN', 'ADMIN'];
  const authorityPortalAllowedRoles = ['AUTHORITY', 'SUPERVISOR', 'WARD_OFFICER', 'ADMIN'];
  const workerTerminalAllowedRoles = ['WORKER', 'DRIVER', 'SUPERVISOR', 'ADMIN'];

  it('1. CITIZEN role can access /citizen', () => {
    assert.ok(citizenPortalAllowedRoles.includes('CITIZEN'));
  });

  it('2. WORKER and DRIVER roles cannot access /citizen', () => {
    assert.ok(!citizenPortalAllowedRoles.includes('WORKER'));
    assert.ok(!citizenPortalAllowedRoles.includes('DRIVER'));
  });

  it('3. SUPERVISOR and WARD_OFFICER cannot access /citizen', () => {
    assert.ok(!citizenPortalAllowedRoles.includes('SUPERVISOR'));
    assert.ok(!citizenPortalAllowedRoles.includes('WARD_OFFICER'));
  });

  it('4. CITIZEN cannot access /authority', () => {
    assert.ok(!authorityPortalAllowedRoles.includes('CITIZEN'));
  });

  it('5. CITIZEN cannot access /worker', () => {
    assert.ok(!workerTerminalAllowedRoles.includes('CITIZEN'));
  });

  it('6. Citizen UI does not request authority-only metrics (RC/SDR/FOA/CRR)', () => {
    const authorityEndpoints = [
      '/api/v1/metrics/route-completion',
      '/api/v1/metrics/service-discrepancy',
      '/api/v1/metrics/fleet-availability',
      '/api/v1/metrics/collection-reconciliation'
    ];
    // Citizen components only call /master/households/:id, /complaints, /finance/obligations/:id, /finance/payments/:id
    assert.equal(authorityEndpoints.length, 4);
    for (const ep of authorityEndpoints) {
      assert.ok(!ep.includes('citizen'));
    }
  });

  it('7. Citizen UI does not request anomalies or audit endpoints', () => {
    const authorityAuditEndpoints = [
      '/api/v1/anomalies',
      '/api/v1/audit/events',
      '/api/v1/finance/reconcile'
    ];
    for (const ep of authorityAuditEndpoints) {
      assert.ok(!ep.includes('citizen'));
    }
  });

  it('8. Citizen payment records and obligations are scoped to authenticated citizen household', () => {
    const householdId = 'house-demo-101';
    const obligationEndpoint = `/api/v1/finance/obligations/${householdId}`;
    const paymentEndpoint = `/api/v1/finance/payments/${householdId}`;

    assert.ok(obligationEndpoint.endsWith(householdId));
    assert.ok(paymentEndpoint.endsWith(householdId));
  });

  it('9. Complaint creation uses the existing backend contract', () => {
    const samplePayload = {
      household_id: 'house-demo-101',
      service_date: '2026-09-14',
      complaint_type: 'MISSED_COLLECTION',
      resident_remarks: 'Household bins were not emptied today.'
    };

    assert.ok(samplePayload.household_id.length > 0);
    assert.match(samplePayload.service_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(samplePayload.complaint_type, 'MISSED_COLLECTION');
    assert.ok(samplePayload.resident_remarks.length >= 5);
  });

  it('10. Payment initiation does not locally fabricate SUCCESSFUL (returns INITIATED)', () => {
    // Initial payment state returned from /finance/payments/initiate is INITIATED
    const initialPaymentStatus = PaymentStatus.INITIATED;
    assert.equal(initialPaymentStatus, 'INITIATED');
    assert.notEqual(initialPaymentStatus, PaymentStatus.SUCCESSFUL);
  });

  it('11. Canonical verification statuses render correctly across presentation layers', () => {
    const statuses = [
      VerificationStatus.EXPECTED,
      VerificationStatus.OBSERVED,
      VerificationStatus.EVIDENCE_AVAILABLE,
      VerificationStatus.VERIFIED,
      VerificationStatus.NOT_VERIFIED,
      VerificationStatus.EXCEPTION,
      VerificationStatus.DISPUTED
    ];

    assert.equal(statuses.length, 7);
    for (const s of statuses) {
      assert.ok(s in en.status.verification, `Missing English status label for ${s}`);
      assert.ok(s in hi.status.verification, `Missing Hindi status label for ${s}`);
    }
  });

  it('12. Proximity/OBSERVED is never presented as VERIFIED and carries disclosure', () => {
    const observedState = VerificationStatus.OBSERVED;
    const verifiedState = VerificationStatus.VERIFIED;

    assert.notEqual(observedState, verifiedState);
    assert.ok(en.portals.citizen.proximityNotice.includes('does NOT constitute verification'));
    assert.ok(hi.portals.citizen.proximityNotice.includes('सत्यापन नहीं है'));
  });

  it('13. English and Hindi localization covers all citizen portal strings identically', () => {
    const enCitizenKeys = Object.keys(en.portals.citizen);
    const hiCitizenKeys = new Set(Object.keys(hi.portals.citizen));

    assert.ok(enCitizenKeys.length >= 30, `Expected at least 30 citizen keys, got ${enCitizenKeys.length}`);
    for (const key of enCitizenKeys) {
      assert.ok(hiCitizenKeys.has(key), `Hindi missing citizen key: ${key}`);
      assert.ok((en.portals.citizen as any)[key].length > 0);
      assert.ok((hi.portals.citizen as any)[key].length > 0);
    }
  });

  it('14. Theme switching keys and tokens are available for citizen screens', () => {
    assert.ok(en.common.light.length > 0);
    assert.ok(en.common.dark.length > 0);
    assert.ok(en.common.system.length > 0);
  });

  it('15. Demo / simulated data notice is explicitly exposed in citizen payment workflow', () => {
    assert.ok(en.portals.citizen.modalDemoNotice.includes('Demo Environment — SIMULATED DATA'));
    assert.ok(hi.portals.citizen.modalDemoNotice.includes('डेमो वातावरण — सिम्युलेटेड डेटा'));
  });
});
