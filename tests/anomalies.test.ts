import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runSeed } from '../src/db/seed.js';
import { AnomalyService } from '../src/services/anomaly.service.js';
import { VerificationService } from '../src/services/verification.service.js';
import { EvidenceType, AnomalySeverity } from '../src/types/domain.js';

describe('Deterministic Operational Anomaly Detection Engine', () => {
  let db: DatabaseSync;
  let anomalyService: AnomalyService;
  let verificationService: VerificationService;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    runSeed(db);
    anomalyService = new AnomalyService(db);
    verificationService = new VerificationService(db);
  });

  it('ANOM-01: Triggers when vehicle departure is delayed > 90 mins, does not trigger on time', () => {
    // Insert an unstarted assignment with scheduled_start 06:00:00Z
    const now = new Date().toISOString();
    const srcRow = db.prepare(`SELECT id FROM data_sources LIMIT 1`).get() as { id: string };
    db.prepare(`
      INSERT INTO daily_assignments VALUES (
        'da-delayed-test', '2026-09-14', 'route-demo-D', 'veh-demo-01',
        'wrk-demo-01', 'wrk-demo-05', '2026-09-14T06:00:00.000Z', 'SCHEDULED', null, ?, ?, 'usr-admin-01'
      )
    `).run(srcRow.id, now);

    // Check at 06:30:00Z (30 mins late -> no trigger)
    const noTrigger = anomalyService.evaluateAssignedVehicleInactivity('da-delayed-test', '2026-09-14T06:30:00.000Z');
    assert.equal(noTrigger, null);

    // Check at 08:30:00Z (150 mins late -> trigger ANOM-01)
    const triggered = anomalyService.evaluateAssignedVehicleInactivity('da-delayed-test', '2026-09-14T08:30:00.000Z');
    assert.ok(triggered);
    assert.equal(triggered.anomaly_id, 'ANOM-01');
    assert.equal(triggered.severity, AnomalySeverity.HIGH);
    assert.match(triggered.description, /Vehicle departure delayed/i);
  });

  it('ANOM-02: Triggers on suspected rapid-scan anomaly (< 5s between distinct households)', () => {
    // Record two consecutive scans 2 seconds apart on run-demo-02
    verificationService.recordEvidence({
      serviceRunId: 'run-demo-02',
      householdId: 'house-demo-208',
      evidenceType: EvidenceType.DOORSTEP_NFC_TAP,
      capturedAt: '2026-09-14T07:00:00.000Z'
    });
    verificationService.recordEvidence({
      serviceRunId: 'run-demo-02',
      householdId: 'house-demo-209',
      evidenceType: EvidenceType.DOORSTEP_NFC_TAP,
      capturedAt: '2026-09-14T07:00:02.000Z' // 2 seconds later!
    });

    const anomalies = anomalyService.evaluateRapidScanAnomaly('run-demo-02');
    assert.ok(anomalies.length > 0);
    const rapidAnom = anomalies.find(a => a.anomaly_id === 'ANOM-02');
    assert.ok(rapidAnom);
    assert.equal(rapidAnom.severity, AnomalySeverity.HIGH);
    assert.match(rapidAnom.description, /Rapid consecutive physical scans/i);
  });

  it('ANOM-03: Triggers on uncorroborated service collection dispute', () => {
    // Temporarily set house-demo-301 to VERIFIED on run-demo-03 where citizen complaint exists
    db.prepare(`UPDATE collection_records SET verification_status = 'VERIFIED' WHERE service_run_id = 'run-demo-03' AND household_id = 'house-demo-301'`).run();

    const disputes = anomalyService.evaluateUncorroboratedDispute('run-demo-03');
    assert.ok(disputes.length > 0);
    const disputeAnom = disputes.find(a => a.anomaly_id === 'ANOM-03');
    assert.ok(disputeAnom);
    assert.equal(disputeAnom.severity, AnomalySeverity.MEDIUM);
    assert.match(disputeAnom.description, /Discrepancy: Collection marked VERIFIED by crew, but resident filed/i);
  });

  it('ANOM-04: Triggers when duplicate transaction reference is detected on different payment', () => {
    // pay-demo-101 has provider_transaction_ref = 'SBI-UPI-20260914-1001'
    const collision = anomalyService.evaluateGatewayRefCollision('SBI-UPI-20260914-1001', 'pay-different-new');
    assert.ok(collision);
    assert.equal(collision.anomaly_id, 'ANOM-04');
    assert.equal(collision.severity, AnomalySeverity.CRITICAL);
    assert.match(collision.description, /Transaction ref.*already belongs/i);
  });

  it('ANOM-05: Triggers on bank settlement discrepancy', () => {
    // rec-demo-102 has statement amount 8000 paise vs payment amount 10000 paise
    const discrepancy = anomalyService.evaluateSettlementDiscrepancy('rec-demo-102');
    assert.ok(discrepancy);
    assert.equal(discrepancy.anomaly_id, 'ANOM-05');
    assert.equal(discrepancy.severity, AnomalySeverity.CRITICAL);
    assert.match(discrepancy.description, /Bank deposit amount differs from gateway settlement/i);
  });

  it('ANOM-06: Triggers when run is marked COMPLETED but RC < 60%', () => {
    // Mark run-demo-02 (RC = 30%) as COMPLETED
    db.prepare(`UPDATE daily_service_runs SET run_status = 'COMPLETED' WHERE id = 'run-demo-02'`).run();

    const abandonment = anomalyService.evaluateRouteAbandonment('run-demo-02');
    assert.ok(abandonment);
    assert.equal(abandonment.anomaly_id, 'ANOM-06');
    assert.equal(abandonment.severity, AnomalySeverity.HIGH);
    assert.match(abandonment.description, /completion rate is only 30%, below 60% threshold/i);
  });

  it('ANOM-07: Triggers when vehicle double-booking conflict occurs', () => {
    // Add second assignment for veh-demo-01 on 2026-09-14
    const srcRow = db.prepare(`SELECT id FROM data_sources LIMIT 1`).get() as { id: string };
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO daily_assignments VALUES (
        'da-conflict', '2026-09-14', 'route-demo-C', 'veh-demo-01',
        'wrk-demo-02', 'wrk-demo-05', '2026-09-14T07:00:00Z', 'SCHEDULED', null, ?, ?, 'usr-admin-01'
      )
    `).run(srcRow.id, now);

    const conflicts = anomalyService.evaluateAssignmentConflicts('2026-09-14');
    assert.ok(conflicts.length > 0);
    const conflictAnom = conflicts.find(a => a.anomaly_id === 'ANOM-07');
    assert.ok(conflictAnom);
    assert.equal(conflictAnom.severity, AnomalySeverity.HIGH);
    assert.match(conflictAnom.description, /Vehicle double-booking detected/i);
  });
});
