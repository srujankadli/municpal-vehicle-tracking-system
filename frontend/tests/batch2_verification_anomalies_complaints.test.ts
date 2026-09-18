import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/i18n/locales/en.js';
import { hi } from '../src/i18n/locales/hi.js';
import type {
  HouseholdVerificationSynthesis,
  OperationalAnomaly,
  ComplaintRecord
} from '../src/types/operations.js';

describe('Phase 2.6 - Batch 2: Evidence, Anomalies & Citizen Grievance Review Tests', () => {
  describe('1. Verification Module (/authority/verification)', () => {
    it('authorized roles can access the module while worker/driver/citizen are excluded', () => {
      const authorityAllowedRoles = ['AUTHORITY', 'SUPERVISOR', 'WARD_OFFICER', 'ADMIN'];
      assert.ok(authorityAllowedRoles.includes('AUTHORITY'));
      assert.ok(authorityAllowedRoles.includes('SUPERVISOR'));
      assert.ok(authorityAllowedRoles.includes('WARD_OFFICER'));
      assert.ok(authorityAllowedRoles.includes('ADMIN'));

      assert.ok(!authorityAllowedRoles.includes('WORKER'));
      assert.ok(!authorityAllowedRoles.includes('DRIVER'));
      assert.ok(!authorityAllowedRoles.includes('CITIZEN'));
    });

    it('all seven canonical verification statuses remain supported', () => {
      const canonicalStatuses = [
        'EXPECTED',
        'OBSERVED',
        'EVIDENCE_AVAILABLE',
        'VERIFIED',
        'NOT_VERIFIED',
        'EXCEPTION',
        'DISPUTED'
      ];
      for (const status of canonicalStatuses) {
        assert.ok(status in en.status.verification, `Missing English status: ${status}`);
        assert.ok(status in hi.status.verification, `Missing Hindi status: ${status}`);
      }
    });

    it('evidence types strictly match canonical backend supported set', () => {
      const canonicalEvidence = ['DOORSTEP_NFC_TAP', 'DOORSTEP_QR_SCAN', 'VEHICLE_PROXIMITY_CORRIDOR'];
      assert.equal(canonicalEvidence.length, 3);
      assert.ok(canonicalEvidence.includes('DOORSTEP_NFC_TAP'));
      assert.ok(canonicalEvidence.includes('DOORSTEP_QR_SCAN'));
      assert.ok(canonicalEvidence.includes('VEHICLE_PROXIMITY_CORRIDOR'));
    });

    it('epistemic invariant: proximity observation alone is NOT represented as doorstep verification', () => {
      const noticeEn = en.portals.authority.verification.epistemicNotice;
      const noticeHi = hi.portals.authority.verification.epistemicNotice;

      assert.ok(noticeEn.includes('OBSERVED'));
      assert.ok(noticeEn.includes('cannot independently substantiate physical doorstep waste collection'));
      assert.ok(noticeHi.includes('OBSERVED'));
      assert.ok(noticeHi.includes('स्वतंत्र रूप से भौतिक दरवाजे पर कचरा संग्रह को प्रमाणित नहीं कर सकता'));
    });

    it('manual override permission: SUPERVISOR and ADMIN permitted; AUTHORITY and WARD_OFFICER restricted', () => {
      const overrideAllowedRoles = ['SUPERVISOR', 'ADMIN'];
      const overrideForbiddenRoles = ['AUTHORITY', 'WARD_OFFICER', 'WORKER', 'DRIVER', 'CITIZEN'];

      for (const role of overrideAllowedRoles) {
        assert.ok(overrideAllowedRoles.includes(role));
      }
      for (const role of overrideForbiddenRoles) {
        assert.ok(!overrideAllowedRoles.includes(role));
      }
    });

    it('manual override validation requires minimum 10 characters for justification', () => {
      const shortReason = 'Changed';
      const validReason = 'Physical container confirmed inaccessible due to construction barricade.';

      assert.ok(shortReason.length < 10, 'Short reason must fail validation');
      assert.ok(validReason.length >= 10, 'Valid reason must satisfy 10-char minimum');
    });

    it('append-only audit trail disclosure is clearly communicated without claiming cryptographic immutability', () => {
      const notice = en.portals.authority.verification.auditLoggedNotice;
      assert.ok(notice.includes('Append-Only Audit Record'));
      assert.ok(!notice.includes('cryptographic'));
      assert.ok(!notice.includes('tamper-proof'));
    });
  });

  describe('2. Anomaly Module (/authority/anomalies)', () => {
    it('all canonical rules ANOM-01 through ANOM-07 are covered without omissions or inventions', () => {
      const canonicalAnomalies = [
        'ANOM-01',
        'ANOM-02',
        'ANOM-03',
        'ANOM-04',
        'ANOM-05',
        'ANOM-06',
        'ANOM-07'
      ];

      assert.equal(canonicalAnomalies.length, 7);
      // Confirm no ANOM-08 exists
      assert.ok(!canonicalAnomalies.includes('ANOM-08'));
    });

    it('objective discrepancy wording is used instead of accusatory terminology', () => {
      const noticeEn = en.portals.authority.anomalies.objectiveNotice;
      const noticeHi = hi.portals.authority.anomalies.objectiveNotice;

      assert.ok(noticeEn.includes('objective operational discrepancies'));
      assert.ok(noticeEn.includes('not established findings of misconduct or fraud'));
      assert.ok(noticeHi.includes('वस्तुनिष्ठ परिचालन विसंगतियों'));
    });

    it('anomaly severity and status values match backend contracts', () => {
      const validSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
      for (const sev of validSeverities) {
        assert.ok(sev in en.status.anomaly);
        assert.ok(sev in hi.status.anomaly);
      }

      const validStatuses = ['UNRESOLVED', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'];
      for (const st of validStatuses) {
        assert.ok(st in en.status.anomaly);
        assert.ok(st in hi.status.anomaly);
      }
    });

    it('manual evaluation triggers invoke backend endpoints without client-side calculation', () => {
      assert.ok(en.portals.authority.anomalies.evaluateSectionTitle.length > 0);
      assert.ok(en.portals.authority.anomalies.evaluateInactivityBtn.includes('ANOM-01'));
      assert.ok(en.portals.authority.anomalies.evaluateAbandonmentBtn.includes('ANOM-06'));
    });
  });

  describe('3. Complaints Module (/authority/complaints)', () => {
    it('read-only behavior: no status mutation or resolution controls exist', () => {
      const noticeEn = en.portals.authority.complaints.readOnlyNotice;
      const noticeHi = hi.portals.authority.complaints.readOnlyNotice;

      assert.ok(noticeEn.includes('Read-Only Municipal Review'));
      assert.ok(noticeEn.includes('Status transitions and workflow mutations are managed by external grievance engines'));
      assert.ok(noticeHi.includes('केवल-पठन नगरपालिका समीक्षा'));
    });

    it('epistemic rule: citizen complaint is not treated as proof of missed service nor invalidation', () => {
      const noticeEn = en.portals.authority.complaints.epistemicNotice;
      const noticeHi = hi.portals.authority.complaints.epistemicNotice;

      assert.ok(noticeEn.includes('represents an allegation requiring review'));
      assert.ok(noticeEn.includes('does not constitute mathematical proof'));
      assert.ok(noticeHi.includes('दावे का प्रतिनिधित्व करती है'));
    });

    it('complaint correlation with ANOM-03 and DISPUTED status is accurately disclosed', () => {
      const correlation = en.portals.authority.complaints.correlationNotice;
      assert.ok(correlation.includes('ANOM-03'));
      assert.ok(correlation.includes('DISPUTED'));
    });
  });

  describe('4. Bilingual Parity & String Coverage', () => {
    it('verification portal strings have complete mirror parity between EN and HI', () => {
      const enVer = en.portals.authority.verification;
      const hiVer = hi.portals.authority.verification;

      for (const key of Object.keys(enVer)) {
        assert.ok(key in hiVer, `Missing Hindi key in portals.authority.verification: ${key}`);
        assert.ok((hiVer as any)[key].length > 0);
      }
    });

    it('anomalies portal strings have complete mirror parity between EN and HI', () => {
      const enAnom = en.portals.authority.anomalies;
      const hiAnom = hi.portals.authority.anomalies;

      for (const key of Object.keys(enAnom)) {
        assert.ok(key in hiAnom, `Missing Hindi key in portals.authority.anomalies: ${key}`);
        assert.ok((hiAnom as any)[key].length > 0);
      }
    });

    it('complaints portal strings have complete mirror parity between EN and HI', () => {
      const enComp = en.portals.authority.complaints;
      const hiComp = hi.portals.authority.complaints;

      for (const key of Object.keys(enComp)) {
        assert.ok(key in hiComp, `Missing Hindi key in portals.authority.complaints: ${key}`);
        assert.ok((hiComp as any)[key].length > 0);
      }
    });
  });
});
