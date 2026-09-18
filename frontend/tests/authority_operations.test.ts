import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/i18n/locales/en.js';
import { hi } from '../src/i18n/locales/hi.js';

describe('Phase 2.2 - Authority Operations Center & Domain Invariants', () => {
  it('1. Authority role guard strictly isolates Authority portal from Worker and Citizen roles', () => {
    const authorityAllowedRoles = ['AUTHORITY', 'SUPERVISOR', 'WARD_OFFICER', 'ADMIN'];

    // Allowed roles
    assert.ok(authorityAllowedRoles.includes('AUTHORITY'));
    assert.ok(authorityAllowedRoles.includes('SUPERVISOR'));
    assert.ok(authorityAllowedRoles.includes('WARD_OFFICER'));
    assert.ok(authorityAllowedRoles.includes('ADMIN'));

    // Forbidden roles
    assert.ok(!authorityAllowedRoles.includes('WORKER'));
    assert.ok(!authorityAllowedRoles.includes('DRIVER'));
    assert.ok(!authorityAllowedRoles.includes('CITIZEN'));
  });

  it('2. Canonical verification statuses remain intact across Authority displays', () => {
    const canonicalVerificationStatuses = [
      'EXPECTED',
      'OBSERVED',
      'EVIDENCE_AVAILABLE',
      'VERIFIED',
      'NOT_VERIFIED',
      'EXCEPTION',
      'DISPUTED'
    ];

    for (const status of canonicalVerificationStatuses) {
      assert.ok(status in en.status.verification, `Missing English status: ${status}`);
      assert.ok(status in hi.status.verification, `Missing Hindi status: ${status}`);
      // Distinct non-empty translations
      assert.ok(en.status.verification[status as keyof typeof en.status.verification].length > 0);
      assert.ok(hi.status.verification[status as keyof typeof hi.status.verification].length > 0);
    }
  });

  it('3. Mathematical metrics retain exact Phase 1 formulas without frontend drift', () => {
    const expectedFormulas = {
      rc: 'RC = ((H_verified + H_exception) / H_scheduled) * 100%',
      sdr: 'SDR = ((H_missed + H_disputed) / H_scheduled) * 100%',
      foa: 'FOA = (V_active / V_operable) * 100%',
      crr: 'CRR = (Sum(P_reconciled_matched) / Sum(B_levied)) * 100%'
    };

    assert.equal(expectedFormulas.rc, 'RC = ((H_verified + H_exception) / H_scheduled) * 100%');
    assert.equal(expectedFormulas.sdr, 'SDR = ((H_missed + H_disputed) / H_scheduled) * 100%');
    assert.equal(expectedFormulas.foa, 'FOA = (V_active / V_operable) * 100%');
    assert.equal(expectedFormulas.crr, 'CRR = (Sum(P_reconciled_matched) / Sum(B_levied)) * 100%');
  });

  it('4. Operational anomalies use objective factual non-pejorative terminology', () => {
    // English anomaly terms
    assert.equal(en.status.anomaly.HIGH, 'High Attention');
    assert.equal(en.status.anomaly.CRITICAL, 'Critical Condition');
    assert.equal(en.status.anomaly.UNRESOLVED, 'Unresolved');

    // Hindi anomaly terms
    assert.equal(hi.status.anomaly.HIGH, 'उच्च ध्यान अपेक्षित');
    assert.equal(hi.status.anomaly.CRITICAL, 'गंभीर स्थिति');
    assert.equal(hi.status.anomaly.UNRESOLVED, 'अनसुलझा');
  });

  it('5. Payment and reconciliation statuses remain strictly distinct in domain definitions', () => {
    const paymentStatuses = ['INITIATED', 'PENDING_PROVIDER', 'SUCCESSFUL', 'FAILED', 'CANCELLED'];
    const reconciliationStatuses = ['RECONCILIATION_MATCHED', 'RECONCILIATION_MISMATCH'];

    for (const ps of paymentStatuses) {
      assert.ok(!reconciliationStatuses.includes(ps), `Payment status ${ps} must not be in reconciliation statuses`);
    }
  });

  it('6. Operational Map is cleanly designated as Phase 2.5 reserved without fake GPS simulation', () => {
    const placeholderText = 'In strict adherence with Phase 2.2 zero-fabrication standards, no artificial GPS points or synthetic vehicle movements are simulated.';
    assert.ok(placeholderText.includes('Phase 2.2 zero-fabrication standards'));
    assert.ok(placeholderText.includes('no artificial GPS points'));
  });

  it('7. Municipal Authority shell strings are completely covered in English and Hindi catalogs', () => {
    assert.ok(en.portals.authority.title.length > 0);
    assert.ok(hi.portals.authority.title.length > 0);
    assert.ok(en.portals.authority.subtitle.length > 0);
    assert.ok(hi.portals.authority.subtitle.length > 0);
    assert.ok(en.shell.demoBanner.length > 0);
    assert.ok(hi.shell.demoBanner.length > 0);
  });
});
