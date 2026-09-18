import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { runSeed } from '../src/db/seed.js';
import { AuthService } from '../src/services/auth.service.js';
import { PaymentService } from '../src/services/payment.service.js';
import { UserRole, DataClassification, EvidenceType, VerificationStatus } from '../src/types/domain.js';

describe('Fastify API Endpoint Integration & Error Handling', () => {
  let app: ReturnType<typeof buildApp>;
  let authService: AuthService;
  let paymentService: PaymentService;
  let adminToken: string;
  let supervisorToken: string;
  let driverToken: string;
  let citizenToken: string;

  before(async () => {
    runSeed();
    authService = new AuthService();
    paymentService = new PaymentService();
    app = buildApp();
    await app.ready();

    adminToken = authService.createToken({
      userId: 'usr-admin-01',
      username: 'admin',
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

  it('GET / returns system health and prominent SIMULATED_DEMO_DATA disclaimer', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.status, 'OPERATIONAL');
    assert.equal(body.data_classification, DataClassification.SIMULATED_DEMO_DATA);
    assert.match(body.disclaimer, /SYNTHETIC DATA FOR DEMONSTRATION AND TESTING ONLY/);
  });

  it('POST /api/v1/auth/login authenticates user and returns session token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: 'admin',
        password: 'admin_Pass123!'
      }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.success, true);
    assert.ok(body.token);
    assert.equal(body.user.role, UserRole.ADMIN);
  });

  it('POST /api/v1/auth/login rejects invalid credentials with HTTP 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: 'admin',
        password: 'WrongPassword123!'
      }
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error, 'INVALID_CREDENTIALS');
  });

  it('DRIVER calls /api/v1/operations/assignments/my-assignment to see only own duties', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/assignments/my-assignment',
      headers: { authorization: `Bearer ${driverToken}` }
    });
    assert.equal(res.statusCode, 200);
    // Driver Ramesh is assigned to da-demo-01 on Route A
    assert.ok(res.json().assignment);
    assert.equal(res.json().assignment.registration_number, 'DL-01-GA-1001');
  });

  it('DRIVER posts physical doorstep scan event and updates household to VERIFIED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/runs/run-demo-01/events',
      headers: { authorization: `Bearer ${driverToken}` },
      payload: {
        household_id: 'house-demo-105',
        evidence_type: EvidenceType.DOORSTEP_NFC_TAP,
        captured_at: new Date().toISOString(),
        device_id: 'HANDHELD-POS-01'
      }
    });
    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.equal(body.success, true);
    assert.equal(body.synthesis.status, VerificationStatus.VERIFIED);
  });

  it('SUPERVISOR applies manual verification override with mandatory justification', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/runs/run-demo-02/manual-override',
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: {
        household_id: 'house-demo-205',
        target_status: VerificationStatus.EXCEPTION,
        override_reason: 'Road construction made lane unserviceable for compactor truck.'
      }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().success, true);
  });

  it('CITIZEN initiates payment, then payment confirmed via cryptographic webhook', async () => {
    // 1. Citizen initiates payment
    const initRes = await app.inject({
      method: 'POST',
      url: '/api/v1/finance/payments/initiate',
      headers: { authorization: `Bearer ${citizenToken}` },
      payload: {
        household_id: 'house-demo-101',
        obligation_id: 'ob-demo-101',
        amount_paise: 10000,
        payment_method: 'UPI',
        idempotency_key: 'API-TEST-IDEM-999'
      }
    });
    assert.equal(initRes.statusCode, 201);
    const payment = initRes.json().payment;
    assert.equal(payment.status, 'INITIATED');

    // 2. Gateway sends server-to-server HMAC signed webhook
    const webhookPayload = JSON.stringify({
      payment_id: payment.id,
      provider_name: 'SBI_EPAY',
      provider_transaction_ref: 'SBI-API-TXN-999',
      amount_paise: 10000,
      status: 'SUCCESS',
      timestamp: new Date().toISOString()
    });
    const signature = paymentService.generateWebhookSignature(webhookPayload);

    const webhookRes = await app.inject({
      method: 'POST',
      url: '/api/v1/finance/payments/webhook',
      headers: {
        'content-type': 'application/json',
        'x-provider-signature': signature
      },
      payload: webhookPayload
    });

    assert.equal(webhookRes.statusCode, 200);
    assert.equal(webhookRes.json().status, 'SUCCESSFUL');
  });

  it('ADMIN reconciles payment against bank statement scroll', async () => {
    // Reconcile pay-demo-101
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/finance/reconcile',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        payment_id: 'pay-demo-101',
        bank_statement_ref: 'STMT-TEST-2026-001',
        statement_amount_paise: 10000,
        notes: 'Verified against treasury scroll'
      }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().reconciliation.status, 'MATCHED');
  });

  it('returns consistent error schema on 400 bad request validation failure', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/finance/payments/initiate',
      headers: { authorization: `Bearer ${citizenToken}` },
      payload: {
        household_id: 'house-demo-101'
        // Missing obligation_id, amount_paise, etc.
      }
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, 'BAD_REQUEST');
    assert.ok(res.json().message);
  });
});
