import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { runSeed } from '../src/db/seed.js';
import { getDatabase } from '../src/db/connection.js';
import { AuthService } from '../src/services/auth.service.js';
import { PaymentService } from '../src/services/payment.service.js';
import { UserRole, VerificationStatus, PaymentStatus } from '../src/types/domain.js';

describe('Evidence & Payment Reconciliation Safety Invariant Suite', () => {
  let app: ReturnType<typeof buildApp>;
  let authService: AuthService;
  let paymentService: PaymentService;
  const db = getDatabase();

  let adminToken: string;
  let supervisorToken: string;
  let driverToken: string;
  let citizenToken: string;

  before(async () => {
    runSeed();
    authService = new AuthService();
    paymentService = new PaymentService(db);
    app = buildApp();
    await app.ready();

    adminToken = authService.createToken({
      userId: 'usr-admin-01',
      username: 'sysadmin',
      role: UserRole.ADMIN
    });

    supervisorToken = authService.createToken({
      userId: 'usr-sup-01',
      username: 'supervisor_w14',
      role: UserRole.SUPERVISOR,
      wardId: 'ward-demo-14'
    });

    driverToken = authService.createToken({
      userId: 'usr-driver-01',
      username: 'driver_ramesh',
      role: UserRole.DRIVER,
      workerId: 'wrk-demo-01'
    });

    citizenToken = authService.createToken({
      userId: 'usr-citizen-01',
      username: 'citizen_priya',
      role: UserRole.CITIZEN,
      householdId: 'house-demo-101'
    });
  });

  after(async () => {
    await app.close();
  });

  it('1. Reconcile with bank scroll rejects non-SUCCESSFUL payments (INITIATED, PENDING_PROVIDER, etc.)', async () => {
    // pay-demo-103 is PENDING_PROVIDER
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/finance/reconcile',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        payment_id: 'pay-demo-103',
        bank_statement_ref: 'STMT-TEST-FAIL-01',
        statement_amount_paise: 10000
      }
    });

    assert.equal(res.statusCode, 422);
    assert.equal(res.json().error, 'RECONCILIATION_FAILED');
    assert.match(res.json().message, /Only confirmed payments with status 'SUCCESSFUL' can be reconciled/);
  });

  it('2. 1:1 Reconciliation Integrity: Cannot reconcile an already reconciled payment', async () => {
    // pay-demo-101 is already reconciled with rec-demo-101
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/finance/reconcile',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        payment_id: 'pay-demo-101',
        bank_statement_ref: 'STMT-TEST-DUP-01',
        statement_amount_paise: 10000
      }
    });

    assert.equal(res.statusCode, 422);
    assert.equal(res.json().error, 'RECONCILIATION_FAILED');
  });

  it('3. 1:1 Reconciliation Integrity: Cannot reuse the same bank statement reference across payments', async () => {
    const sourceRow = db.prepare('SELECT id FROM data_sources LIMIT 1').get() as { id: string };
    const sourceId = sourceRow.id;

    // Setup a new confirmed payment
    db.prepare(`
      INSERT INTO resident_payments (
        id, household_id, obligation_id, amount_paise, currency, payment_method,
        provider_name, provider_transaction_ref, idempotency_key,
        status, initiated_at, confirmed_at, beneficiary_type, source_id
      ) VALUES (
        'pay-test-safety-01', 'house-demo-101', 'ob-demo-101', 10000, 'INR', 'UPI',
        'SBI_EPAY', 'SBI-TXN-SAFETY-01', 'IDEM-SAFETY-01',
        'SUCCESSFUL', datetime('now'), datetime('now'), 'DESIGNATED_WORKER_ACCOUNT', ?
      )
    `).run(sourceId);

    // Try to reuse BANK-STMT-20260914-001 which is already linked to rec-demo-101
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/finance/reconcile',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        payment_id: 'pay-test-safety-01',
        bank_statement_ref: 'BANK-STMT-20260914-001',
        statement_amount_paise: 10000
      }
    });

    assert.equal(res.statusCode, 422);
    assert.equal(res.json().error, 'RECONCILIATION_FAILED');
    assert.match(res.json().message, /DUPLICATE_BANK_STATEMENT_REF/);
  });

  it('4. Override Guardrail: Manual override cannot designate VERIFIED without qualifying physical scan evidence', async () => {
    // house-demo-205 on run-demo-02 has no physical scan evidence
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/runs/run-demo-02/manual-override',
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: {
        household_id: 'house-demo-205',
        target_status: VerificationStatus.VERIFIED,
        override_reason: 'Supervisor claims collection took place without evidence'
      }
    });

    assert.equal(res.statusCode, 422);
    assert.equal(res.json().error, 'OVERRIDE_GUARDRAIL_VIOLATION');
    assert.match(res.json().message, /cannot designate VERIFIED without qualifying doorstep evidence/);
  });

  it('5. Run Lifecycle: Cannot transition directly from NOT_STARTED to COMPLETED', async () => {
    const sourceRow = db.prepare('SELECT id FROM data_sources LIMIT 1').get() as { id: string };
    const sourceId = sourceRow.id;

    // Create a mock NOT_STARTED run
    db.prepare(`
      INSERT INTO daily_assignments (
        id, service_date, route_id, vehicle_id, driver_id, supervisor_id,
        scheduled_start, status, source_id, created_at, created_by
      ) VALUES (
        'da-test-lifecycle-01', '2026-09-15', 'route-demo-A', 'veh-demo-01', 'wrk-demo-01', 'wrk-demo-05',
        '2026-09-15T06:00:00Z', 'SCHEDULED', ?, datetime('now'), 'usr-admin-01'
      )
    `).run(sourceId);

    db.prepare(`
      INSERT INTO daily_service_runs (
        id, assignment_id, run_status, completion_percentage, source_id, created_at, updated_at
      ) VALUES (
        'run-test-lifecycle-01', 'da-test-lifecycle-01', 'NOT_STARTED', 0.0, ?, datetime('now'), datetime('now')
      )
    `).run(sourceId);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/operations/runs/run-test-lifecycle-01/status',
      headers: { authorization: `Bearer ${driverToken}` },
      payload: {
        target_status: 'COMPLETED'
      }
    });

    assert.equal(res.statusCode, 422);
    assert.equal(res.json().error, 'INVALID_TRANSITION');
  });

  it('6. Evidence Submission: Cannot submit field evidence while run is NOT_STARTED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/runs/run-test-lifecycle-01/events',
      headers: { authorization: `Bearer ${driverToken}` },
      payload: {
        household_id: 'house-demo-101',
        evidence_type: 'DOORSTEP_NFC_TAP',
        captured_at: new Date().toISOString(),
        device_id: 'FIELD-MOBILE-HANDHELD-01'
      }
    });

    assert.equal(res.statusCode, 422);
    assert.equal(res.json().error, 'RUN_NOT_STARTED');
  });

  it('7. Complaint Filing: Filing a grievance transitions record to DISPUTED and logs audit event', async () => {
    // File grievance for house-demo-101
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/complaints',
      headers: { authorization: `Bearer ${citizenToken}` },
      payload: {
        household_id: 'house-demo-101',
        service_date: '2026-09-14',
        complaint_type: 'MISSED_COLLECTION',
        resident_remarks: 'Collection crew did not arrive at premise today.'
      }
    });

    assert.equal(res.statusCode, 201);
    assert.equal(res.json().dispute_triggered, true);

    // Verify collection record status became DISPUTED
    const coll = db.prepare(`
      SELECT verification_status FROM collection_records 
      WHERE household_id = 'house-demo-101'
    `).get() as { verification_status: string };
    assert.equal(coll.verification_status, VerificationStatus.DISPUTED);

    // Verify COMPLAINT_DISPUTE_TRIGGERED audit event was logged
    const auditEvent = db.prepare(`
      SELECT * FROM audit_events 
      WHERE action_type = 'COMPLAINT_DISPUTE_TRIGGERED'
      ORDER BY created_at DESC LIMIT 1
    `).get();
    assert.ok(auditEvent);
  });

  it('8. Complaint Resolution: Resolving complaint logs RESOLVE_COMPLAINT audit event', async () => {
    // Find complaint ID
    const complaint = db.prepare(`
      SELECT id FROM complaints WHERE household_id = 'house-demo-101' LIMIT 1
    `).get() as { id: string };

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/complaints/${complaint.id}/resolve`,
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: {
        status: 'RESOLVED',
        resolution_notes: 'Supervisor conducted onsite inspection; issue resolved with resident.'
      }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.json().success, true);

    // Verify RESOLVE_COMPLAINT audit event was logged
    const auditEvent = db.prepare(`
      SELECT * FROM audit_events 
      WHERE action_type = 'RESOLVE_COMPLAINT' AND entity_id = ?
    `).get(complaint.id);
    assert.ok(auditEvent);
  });

  it('9. Provider Webhook: Successful webhook logs PAYMENT_WEBHOOK_STATUS audit event', async () => {
    const sourceRow = db.prepare('SELECT id FROM data_sources LIMIT 1').get() as { id: string };
    const sourceId = sourceRow.id;
    const paymentId = crypto.randomUUID();

    // Setup initiated payment
    db.prepare(`
      INSERT INTO resident_payments (
        id, household_id, obligation_id, amount_paise, currency, payment_method,
        provider_name, provider_transaction_ref, idempotency_key,
        status, initiated_at, beneficiary_type, source_id
      ) VALUES (
        ?, 'house-demo-101', 'ob-demo-101', 10000, 'INR', 'UPI',
        'SBI_EPAY', null, 'IDEM-WEBHOOK-SAFE-01',
        'INITIATED', datetime('now'), 'DESIGNATED_WORKER_ACCOUNT', ?
      )
    `).run(paymentId, sourceId);

    const webhookPayload = JSON.stringify({
      payment_id: paymentId,
      provider_name: 'SBI_EPAY',
      provider_transaction_ref: 'SBI-TXN-SAFE-01',
      amount_paise: 10000,
      status: 'SUCCESS',
      timestamp: new Date().toISOString()
    });
    const sig = paymentService.generateWebhookSignature(webhookPayload);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/finance/payments/webhook',
      headers: {
        'content-type': 'application/json',
        'x-provider-signature': sig
      },
      payload: webhookPayload
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, 'SUCCESSFUL');

    // Verify PAYMENT_WEBHOOK_STATUS audit event was logged
    const auditEvent = db.prepare(`
      SELECT * FROM audit_events 
      WHERE action_type = 'PAYMENT_WEBHOOK_STATUS' AND entity_id = ?
    `).get(paymentId);
    assert.ok(auditEvent);
  });
});
