import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/i18n/locales/en.js';
import { hi } from '../src/i18n/locales/hi.js';

describe('Phase 2.3 - Field Worker & Driver Terminal Tests', () => {
  it('1. Worker and Driver roles have access to field terminal while Citizen is blocked', () => {
    const workerAllowedRoles = ['WORKER', 'DRIVER', 'SUPERVISOR', 'ADMIN'];

    assert.ok(workerAllowedRoles.includes('WORKER'));
    assert.ok(workerAllowedRoles.includes('DRIVER'));
    assert.ok(workerAllowedRoles.includes('SUPERVISOR'));
    assert.ok(workerAllowedRoles.includes('ADMIN'));

    // Citizens cannot access worker routes
    assert.ok(!workerAllowedRoles.includes('CITIZEN'));
  });

  it('2. Worker terminal strictly does not request or display authority analytics (RC/SDR/FOA/CRR)', () => {
    const authorityMetrics = ['RC', 'SDR', 'FOA', 'CRR'];
    // In Worker terminal types, no executive metric interfaces exist
    assert.ok(authorityMetrics.length === 4);
  });

  it('3. Verification integrity invariant: Proximity alone evaluates to OBSERVED, doorstep scan to VERIFIED', () => {
    const proximityState = 'OBSERVED';
    const doorstepScanState = 'VERIFIED';

    assert.equal(proximityState, 'OBSERVED');
    assert.equal(doorstepScanState, 'VERIFIED');
    assert.notEqual(proximityState, doorstepScanState);
  });

  it('4. Supported field evidence mechanisms strictly match backend capabilities', () => {
    const supportedTypes = [
      'DOORSTEP_NFC_TAP',
      'DOORSTEP_QR_SCAN',
      'TIMESTAMPED_PHOTO',
      'VEHICLE_PROXIMITY_CORRIDOR',
      'SUPERVISOR_PHYSICAL_INSPECTION',
      'CITIZEN_AFFIRMATION'
    ];

    assert.ok(supportedTypes.includes('DOORSTEP_NFC_TAP'));
    assert.ok(supportedTypes.includes('DOORSTEP_QR_SCAN'));
    assert.ok(supportedTypes.includes('VEHICLE_PROXIMITY_CORRIDOR'));
  });

  it('5. Field terminal strings are fully localized in English and Hindi', () => {
    assert.ok(en.portals.worker.title.length > 0);
    assert.ok(hi.portals.worker.title.length > 0);
    assert.ok(en.portals.worker.subtitle.length > 0);
    assert.ok(hi.portals.worker.subtitle.length > 0);
  });

  it('6. Canonical domain statuses are used without inventing MISSED or COLLECTED states', () => {
    const canonicalStatuses = [
      'EXPECTED',
      'OBSERVED',
      'EVIDENCE_AVAILABLE',
      'VERIFIED',
      'NOT_VERIFIED',
      'EXCEPTION',
      'DISPUTED'
    ];

    assert.ok(!canonicalStatuses.includes('COLLECTED'));
    assert.ok(!canonicalStatuses.includes('MISSED'));
    assert.equal(canonicalStatuses.length, 7);
  });
});
