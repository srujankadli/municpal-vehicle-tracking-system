import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildApp } from '../src/app.js';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { runSeed } from '../src/db/seed.js';
import { EvidenceType, VerificationStatus } from '../src/types/domain.js';
import type { FastifyInstance } from 'fastify';

describe('Phase 4 - Batch 2: Field Worker Idempotent Sync & Duplicate Prevention', () => {
  let app: FastifyInstance;
  let workerToken: string;

  before(async () => {
    closeDatabase();
    const db = getDatabase();
    runSeed(db);
    app = buildApp({ enableRateLimit: false });
    await app.ready();

    // Authenticate worker_suresh
    const workerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'worker_suresh', password: 'worker_suresh_Pass123!' }
    });
    assert.equal(workerRes.statusCode, 200);
    workerToken = JSON.parse(workerRes.payload).token;
  });

  after(async () => {
    await app.close();
    closeDatabase();
  });

  test('1. First submission with client_event_id creates evidence record (HTTP 201)', async () => {
    const clientEventId = crypto.randomUUID();
    const now = new Date().toISOString();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/runs/run-demo-01/events',
      headers: { authorization: `Bearer ${workerToken}` },
      payload: {
        client_event_id: clientEventId,
        household_id: 'house-demo-102',
        evidence_type: EvidenceType.DOORSTEP_NFC_TAP,
        captured_at: now,
        device_id: 'DEVICE-UNIT-TEST-01',
        raw_payload: { test_run: 'batch2_first_submission' }
      }
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.duplicate, false);
    assert.equal(body.evidence_id, clientEventId);
    assert.equal(body.synthesis.status, VerificationStatus.VERIFIED);

    // Verify exactly 1 row exists in service_evidence
    const db = getDatabase();
    const row = db.prepare('SELECT id, household_id, evidence_type FROM service_evidence WHERE id = ?').get(clientEventId) as any;
    assert.ok(row);
    assert.equal(row.id, clientEventId);
    assert.equal(row.household_id, 'house-demo-102');
  });

  test('2. Sequential duplicate submission with identical client_event_id returns HTTP 200 without creating duplicate row', async () => {
    const clientEventId = crypto.randomUUID();
    const now = new Date().toISOString();

    const payload = {
      client_event_id: clientEventId,
      household_id: 'house-demo-103',
      evidence_type: EvidenceType.DOORSTEP_QR_SCAN,
      captured_at: now,
      device_id: 'DEVICE-UNIT-TEST-02',
      raw_payload: { test_run: 'batch2_sequential_test' }
    };

    // First attempt
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/runs/run-demo-01/events',
      headers: { authorization: `Bearer ${workerToken}` },
      payload
    });
    assert.equal(res1.statusCode, 201);
    const body1 = JSON.parse(res1.payload);
    assert.equal(body1.duplicate, false);
    assert.equal(body1.evidence_id, clientEventId);

    // Replay with identical client_event_id (simulating offline queue retry)
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/runs/run-demo-01/events',
      headers: { authorization: `Bearer ${workerToken}` },
      payload
    });
    assert.equal(res2.statusCode, 200);
    const body2 = JSON.parse(res2.payload);
    assert.equal(body2.success, true);
    assert.equal(body2.duplicate, true);
    assert.equal(body2.evidence_id, clientEventId);
    assert.equal(body2.synthesis.status, VerificationStatus.VERIFIED);

    // Third replay
    const res3 = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/runs/run-demo-01/events',
      headers: { authorization: `Bearer ${workerToken}` },
      payload
    });
    assert.equal(res3.statusCode, 200);
    const body3 = JSON.parse(res3.payload);
    assert.equal(body3.duplicate, true);

    // Ensure database contains exactly one record with this client_event_id
    const db = getDatabase();
    const countRow = db.prepare('SELECT COUNT(*) as count FROM service_evidence WHERE id = ?').get(clientEventId) as any;
    assert.equal(countRow.count, 1);
  });

  test('3. Concurrent duplicate submissions with identical client_event_id serialize safely without error', async () => {
    const clientEventId = crypto.randomUUID();
    const now = new Date().toISOString();

    const payload = {
      client_event_id: clientEventId,
      household_id: 'house-demo-104',
      evidence_type: EvidenceType.DOORSTEP_NFC_TAP,
      captured_at: now,
      device_id: 'DEVICE-UNIT-TEST-03',
      raw_payload: { test_run: 'batch2_concurrent_race' }
    };

    // Fire 8 parallel requests with the identical client_event_id
    const parallelRequests = Array.from({ length: 8 }).map(() =>
      app.inject({
        method: 'POST',
        url: '/api/v1/operations/runs/run-demo-01/events',
        headers: { authorization: `Bearer ${workerToken}` },
        payload
      })
    );

    const responses = await Promise.all(parallelRequests);

    // Every response must be either 201 (winner) or 200 (duplicate)
    let count201 = 0;
    let count200 = 0;

    for (const r of responses) {
      assert.ok(r.statusCode === 201 || r.statusCode === 200, `Unexpected status code: ${r.statusCode}`);
      const b = JSON.parse(r.payload);
      assert.equal(b.success, true);
      assert.equal(b.evidence_id, clientEventId);
      if (r.statusCode === 201) count201++;
      if (r.statusCode === 200) count200++;
    }

    assert.equal(count201, 1, 'Exactly one concurrent request must win the initial insert');
    assert.equal(count200, 7, 'All seven competing requests must be recognized as duplicates');

    // Verify exactly 1 row in database
    const db = getDatabase();
    const countRow = db.prepare('SELECT COUNT(*) as count FROM service_evidence WHERE id = ?').get(clientEventId) as any;
    assert.equal(countRow.count, 1);
  });

  test('4. Backward compatibility: submission without client_event_id generates a fresh UUID', async () => {
    const now = new Date().toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/runs/run-demo-01/events',
      headers: { authorization: `Bearer ${workerToken}` },
      payload: {
        household_id: 'house-demo-105',
        evidence_type: EvidenceType.DOORSTEP_NFC_TAP,
        captured_at: now
      }
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.duplicate, false);
    assert.ok(body.evidence_id);
    assert.match(body.evidence_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test('5. Server-Success / Client-Timeout / Retry Scenario: Verifies database invariants on retry', async () => {
    const db = getDatabase();
    const clientEventId = crypto.randomUUID();
    const captureTime = new Date().toISOString();
    const targetHousehold = 'house-demo-106';

    const payload = {
      client_event_id: clientEventId,
      household_id: targetHousehold,
      evidence_type: EvidenceType.DOORSTEP_NFC_TAP,
      captured_at: captureTime,
      device_id: 'FIELD-TERMINAL-RETRY-01',
      raw_payload: { simulated_scenario: 'client_timeout_retry' }
    };

    // Step A & B: Client submits event with client_event_id = X; Server persists successfully
    const initialRes = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/runs/run-demo-01/events',
      headers: { authorization: `Bearer ${workerToken}` },
      payload
    });

    assert.equal(initialRes.statusCode, 201);
    const initialBody = JSON.parse(initialRes.payload);
    assert.equal(initialBody.success, true);
    assert.equal(initialBody.duplicate, false);
    assert.equal(initialBody.evidence_id, clientEventId);
    assert.equal(initialBody.synthesis.status, VerificationStatus.VERIFIED);

    // Step C: Simulate client timeout / lost response:
    // Client treats request as dropped, response is discarded, queued item remains un-acknowledged in client storage
    const anomalyCountBeforeRetry = (db.prepare(`
      SELECT COUNT(*) as count FROM operational_anomalies
      WHERE service_run_id = 'run-demo-01' AND anomaly_id = 'ANOM-02'
    `).get() as any).count;

    // Step D: Client retries with the EXACT SAME event and EXACT SAME client_event_id = X
    const retryRes = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/runs/run-demo-01/events',
      headers: { authorization: `Bearer ${workerToken}` },
      payload
    });

    // Step E: Verify HTTP outcome
    assert.equal(retryRes.statusCode, 200);
    const retryBody = JSON.parse(retryRes.payload);
    assert.equal(retryBody.success, true);
    assert.equal(retryBody.duplicate, true);
    assert.equal(retryBody.evidence_id, clientEventId);
    assert.equal(retryBody.synthesis.status, VerificationStatus.VERIFIED);
    assert.equal(retryBody.anomalies_detected, false);

    // Step E: Explicitly verify the DATABASE outcomes:
    // 1. No second service_evidence row exists
    const evidenceRows = db.prepare(`
      SELECT id, household_id, service_run_id, captured_at FROM service_evidence WHERE id = ?
    `).all(clientEventId) as any[];
    assert.equal(evidenceRows.length, 1, 'DATABASE INVARIANT: Exactly 1 row in service_evidence for client_event_id');
    assert.equal(evidenceRows[0].id, clientEventId);
    assert.equal(evidenceRows[0].household_id, targetHousehold);

    // 2. No second collection_records row exists for this household and run
    const collRows = db.prepare(`
      SELECT id, service_run_id, household_id, verification_status FROM collection_records
      WHERE service_run_id = 'run-demo-01' AND household_id = ?
    `).all(targetHousehold) as any[];
    assert.equal(collRows.length, 1, 'DATABASE INVARIANT: Exactly 1 row in collection_records for household on this run');
    assert.equal(collRows[0].verification_status, VerificationStatus.VERIFIED);

    // 3. No false ANOM-02 rapid-scan anomaly was recorded on retry
    const anomalyCountAfterRetry = (db.prepare(`
      SELECT COUNT(*) as count FROM operational_anomalies
      WHERE service_run_id = 'run-demo-01' AND anomaly_id = 'ANOM-02'
    `).get() as any).count;
    assert.equal(anomalyCountAfterRetry, anomalyCountBeforeRetry, 'DATABASE INVARIANT: Zero false ANOM-02 anomalies inserted by retry');

    // 4. Authoritative verification synthesis remains VERIFIED
    const countTotalEvidenceForHousehold = db.prepare(`
      SELECT COUNT(*) as total FROM service_evidence
      WHERE service_run_id = 'run-demo-01' AND household_id = ?
    `).get(targetHousehold) as any;
    // Originally 1 seeded record existed (ev-demo-106) + 1 newly inserted by clientEventId = 2 total
    // A third row was NOT created by the retry
    assert.equal(countTotalEvidenceForHousehold.total, 2, 'DATABASE INVARIANT: Total evidence count must not increase on retry');
  });
});
