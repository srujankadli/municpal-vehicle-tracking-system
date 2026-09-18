import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runSeed } from '../src/db/seed.js';
import { VerificationService } from '../src/services/verification.service.js';
import { VerificationStatus, EvidenceType } from '../src/types/domain.js';

describe('Service Verification & Evidence Integrity Model', () => {
  let db: DatabaseSync;
  let verification: VerificationService;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    runSeed(db);
    verification = new VerificationService(db);
  });

  it('CRITICAL RULE: Telemetry / proximity observation ALONE is NOT verified', () => {
    // Check house 302 on run-demo-03 which only had VEHICLE_PROXIMITY_CORRIDOR evidence
    const synthesis = verification.evaluateHouseholdStatus('run-demo-03', 'house-demo-302');

    assert.equal(synthesis.status, VerificationStatus.OBSERVED);
    assert.equal(synthesis.hasPhysicalScan, false);
    assert.equal(synthesis.hasProximityObservation, true);
    assert.equal(
      synthesis.disclosureStatement,
      'Collection cannot be independently proven with the currently available data.'
    );
  });

  it('evaluates status as VERIFIED when valid physical doorstep scan exists without grievance', () => {
    // Check house 101 on run-demo-01 which had DOORSTEP_NFC_TAP
    const synthesis = verification.evaluateHouseholdStatus('run-demo-01', 'house-demo-101');

    assert.equal(synthesis.status, VerificationStatus.VERIFIED);
    assert.equal(synthesis.hasPhysicalScan, true);
    assert.equal(synthesis.hasResidentComplaint, false);
    assert.match(synthesis.disclosureStatement || '', /doorstep physical tag interaction/i);
  });

  it('evaluates status as DISPUTED when physical scan exists but resident lodged missed collection complaint', () => {
    // Check house 301 on run-demo-03 which had DOORSTEP_NFC_TAP and a filed complaint
    const synthesis = verification.evaluateHouseholdStatus('run-demo-03', 'house-demo-301');

    assert.equal(synthesis.status, VerificationStatus.DISPUTED);
    assert.equal(synthesis.hasPhysicalScan, true);
    assert.equal(synthesis.hasResidentComplaint, true);
    assert.match(synthesis.disclosureStatement || '', /conflicting evidence/i);
  });

  it('evaluates status as NOT_VERIFIED when no evidence or observed activity exists', () => {
    // Check house 205 on run-demo-02 (after vehicle breakdown)
    const synthesis = verification.evaluateHouseholdStatus('run-demo-02', 'house-demo-205');

    assert.equal(synthesis.status, VerificationStatus.NOT_VERIFIED);
    assert.equal(synthesis.hasPhysicalScan, false);
    assert.equal(synthesis.hasProximityObservation, false);
  });
});
