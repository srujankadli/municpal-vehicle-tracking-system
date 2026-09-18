import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runSeed } from '../src/db/seed.js';
import { PaymentService } from '../src/services/payment.service.js';
import { PaymentStatus, ReconciliationStatus } from '../src/types/domain.js';

describe('Payment Domain, Security Boundary & State Machine', () => {
  let db: DatabaseSync;
  let paymentService: PaymentService;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    runSeed(db);
    paymentService = new PaymentService(db);
  });

  it('initiation creates INITIATED record and NEVER directly marks payment SUCCESSFUL', () => {
    const payment = paymentService.initiatePayment({
      householdId: 'house-demo-101',
      obligationId: 'ob-demo-101',
      amountPaise: 10000,
      paymentMethod: 'UPI',
      idempotencyKey: 'TEST-IDEM-001'
    });

    assert.equal(payment.status, PaymentStatus.INITIATED);
    assert.equal(payment.amount_paise, 10000);
    assert.equal(payment.confirmed_at, null);
  });

  it('accepts webhook with valid HMAC-SHA256 signature and transitions to SUCCESSFUL', () => {
    // Initiate payment
    const payment = paymentService.initiatePayment({
      householdId: 'house-demo-101',
      obligationId: 'ob-demo-101',
      amountPaise: 10000,
      paymentMethod: 'UPI',
      idempotencyKey: 'TEST-IDEM-002'
    });

    const payloadObj = {
      payment_id: String(payment.id),
      provider_name: 'SBI_EPAY',
      provider_transaction_ref: 'SBI-TEST-TXN-001',
      amount_paise: 10000,
      status: 'SUCCESS',
      timestamp: new Date().toISOString()
    };
    const rawPayload = JSON.stringify(payloadObj);
    const validSignature = paymentService.generateWebhookSignature(rawPayload);

    const result = paymentService.processProviderWebhook(rawPayload, validSignature);

    assert.equal(result.success, true);
    assert.equal(result.status, PaymentStatus.SUCCESSFUL);

    // Verify record in database
    const stmt = db.prepare(`SELECT * FROM resident_payments WHERE id = ?`);
    const record = stmt.get(payment.id) as { status: string; confirmed_at: string | null };
    assert.equal(record.status, PaymentStatus.SUCCESSFUL);
    assert.ok(record.confirmed_at !== null);
  });

  it('rejects webhook with invalid or tampered signature', () => {
    const payment = paymentService.initiatePayment({
      householdId: 'house-demo-101',
      obligationId: 'ob-demo-101',
      amountPaise: 10000,
      paymentMethod: 'UPI',
      idempotencyKey: 'TEST-IDEM-003'
    });

    const payloadObj = {
      payment_id: String(payment.id),
      provider_name: 'SBI_EPAY',
      provider_transaction_ref: 'SBI-TEST-TXN-002',
      amount_paise: 10000,
      status: 'SUCCESS',
      timestamp: new Date().toISOString()
    };
    const rawPayload = JSON.stringify(payloadObj);

    // Invalid signature
    assert.throws(() => {
      paymentService.processProviderWebhook(rawPayload, 'fake-invalid-signature-hex-1234567890');
    }, /UNAUTHORIZED_WEBHOOK/);
  });

  it('handles duplicate / replay webhook idempotently without error', () => {
    const payment = paymentService.initiatePayment({
      householdId: 'house-demo-101',
      obligationId: 'ob-demo-101',
      amountPaise: 10000,
      paymentMethod: 'UPI',
      idempotencyKey: 'TEST-IDEM-004'
    });

    const payloadObj = {
      payment_id: String(payment.id),
      provider_name: 'SBI_EPAY',
      provider_transaction_ref: 'SBI-TEST-TXN-003',
      amount_paise: 10000,
      status: 'SUCCESS',
      timestamp: new Date().toISOString()
    };
    const rawPayload = JSON.stringify(payloadObj);
    const signature = paymentService.generateWebhookSignature(rawPayload);

    // First call
    const firstResult = paymentService.processProviderWebhook(rawPayload, signature);
    assert.equal(firstResult.status, PaymentStatus.SUCCESSFUL);

    // Second (replay) call
    const replayResult = paymentService.processProviderWebhook(rawPayload, signature);
    assert.equal(replayResult.status, PaymentStatus.SUCCESSFUL);
    assert.match(replayResult.message, /idempotent/i);
  });

  it('prevents downgrading an already SUCCESSFUL payment to FAILED', () => {
    const payment = paymentService.initiatePayment({
      householdId: 'house-demo-101',
      obligationId: 'ob-demo-101',
      amountPaise: 10000,
      paymentMethod: 'UPI',
      idempotencyKey: 'TEST-IDEM-005'
    });

    // Mark successful
    const successPayload = JSON.stringify({
      payment_id: String(payment.id),
      provider_name: 'SBI_EPAY',
      provider_transaction_ref: 'SBI-TEST-TXN-005',
      amount_paise: 10000,
      status: 'SUCCESS',
      timestamp: new Date().toISOString()
    });
    paymentService.processProviderWebhook(successPayload, paymentService.generateWebhookSignature(successPayload));

    // Attempt downgrade
    const failPayload = JSON.stringify({
      payment_id: String(payment.id),
      provider_name: 'SBI_EPAY',
      provider_transaction_ref: 'SBI-TEST-TXN-005',
      amount_paise: 10000,
      status: 'FAILURE',
      timestamp: new Date().toISOString()
    });

    assert.throws(() => {
      paymentService.processProviderWebhook(failPayload, paymentService.generateWebhookSignature(failPayload));
    }, /ILLEGAL_STATE_TRANSITION/);
  });

  it('triggers ANOM-05 and marks status RECONCILIATION_MISMATCH when bank amount differs', () => {
    // Check seeded payment 102 which has 10000 paise bill but 8000 paise bank deposit
    const stmt = db.prepare(`SELECT * FROM resident_payments WHERE id = 'pay-demo-102'`);
    const p = stmt.get() as { status: string };
    assert.equal(p.status, PaymentStatus.RECONCILIATION_MISMATCH);

    // Check anomaly logged
    const anomStmt = db.prepare(`SELECT * FROM operational_anomalies WHERE anomaly_id = 'ANOM-05'`);
    const anom = anomStmt.get() as { anomaly_id: string; severity: string };
    assert.ok(anom);
    assert.equal(anom.anomaly_id, 'ANOM-05');
    assert.equal(anom.severity, 'CRITICAL');
  });
});
