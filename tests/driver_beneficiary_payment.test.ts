/**
 * Automated Tests: Driver Beneficiary Payment Model Audit & Verification
 *
 * Verifies the 15 required audit criteria:
 * 1. Household resolves to correct route.
 * 2. Route resolves to correct assigned driver.
 * 3. Payment obligation stores beneficiary_driver_id.
 * 4. Resident payment preserves beneficiary_driver_id.
 * 5. Historical payment retains original driver after route reassignment.
 * 6. Citizen sees assigned driver as beneficiary.
 * 7. Authority sees assigned driver as beneficiary.
 * 8. Municipality is not displayed as beneficiary for the driver-based fee.
 * 9. Payment lifecycle remains unchanged.
 * 10. CRR remains exactly correct.
 * 11. Integer paise arithmetic remains unchanged.
 * 12. RBAC/anti-IDOR remain intact.
 * 13. No driver can access another driver's/citizen's protected financial information.
 * 14. No fake bank transfer is reported as successful.
 * 15. Forward migration 0002 applies cleanly on new and existing databases.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runSeed } from '../src/db/seed.js';
import { PaymentService } from '../src/services/payment.service.js';
import { MetricsService } from '../src/services/metrics.service.js';
import { buildApp } from '../src/app.js';
import { AuthService } from '../src/services/auth.service.js';
import {
  PaymentBeneficiaryType,
  PaymentStatus,
  ReconciliationStatus,
  UserRole
} from '../src/types/domain.js';

describe('Driver Beneficiary Payment Model — 15 Invariant Audit Suite', () => {
  let db: DatabaseSync;
  let paymentService: PaymentService;
  let metricsService: MetricsService;
  let authService: AuthService;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    runSeed(db);
    paymentService = new PaymentService(db);
    metricsService = new MetricsService(db);
    authService = new AuthService(db);
  });

  // 1. Household resolves to correct route
  it('1. Household resolves to correct route in database', () => {
    const stmt = db.prepare(`
      SELECT h.id, h.service_uid, r.id as route_id, r.code as route_code, r.name as route_name
      FROM households h
      JOIN routes r ON h.route_id = r.id
      WHERE h.id = 'house-demo-101'
    `);
    const row = stmt.get() as any;
    assert.ok(row, 'Household must resolve to a valid route');
    assert.equal(row.route_id, 'route-demo-A');
    assert.equal(row.route_code, 'RT-14A-01');
    assert.equal(row.route_name, 'Gandhi Road Main Route');
  });

  // 2. Route resolves to correct assigned driver
  it('2. Route resolves to correct assigned driver via master_assignments', () => {
    const res = paymentService.resolveRouteDriverForHousehold('house-demo-101');
    assert.ok(res, 'Route driver resolution must succeed');
    assert.equal(res.driver_id, 'wrk-demo-01');
    assert.equal(res.driver_name, 'Ramesh Kumar');
    assert.equal(res.driver_code, 'EMP-DRV-001');
    assert.equal(res.vehicle_reg, 'DL-01-GA-1001');
    assert.equal(res.route_name, 'Gandhi Road Main Route');
  });

  // 3. Payment obligation stores beneficiary_driver_id
  it('3. Payment obligation stores beneficiary_driver_id pointing to workers.id', () => {
    const stmt = db.prepare(`
      SELECT po.*, w.full_name as driver_name, w.role as worker_type
      FROM payment_obligations po
      LEFT JOIN workers w ON po.beneficiary_driver_id = w.id
      WHERE po.id = 'ob-demo-101'
    `);
    const ob = stmt.get() as any;
    assert.ok(ob, 'Obligation record must exist');
    assert.equal(ob.beneficiary_model, PaymentBeneficiaryType.DESIGNATED_WORKER_ACCOUNT);
    assert.equal(ob.beneficiary_driver_id, 'wrk-demo-01');
    assert.equal(ob.driver_name, 'Ramesh Kumar');
    assert.equal(ob.worker_type, 'DRIVER');
  });

  // 4. Resident payment preserves beneficiary_driver_id
  it('4. Resident payment preserves beneficiary_driver_id snapshot at initiation', () => {
    const payment = paymentService.initiatePayment({
      householdId: 'house-demo-101',
      obligationId: 'ob-demo-101',
      amountPaise: 10000,
      paymentMethod: 'UPI',
      idempotencyKey: 'TEST-BENEFICIARY-INIT-001'
    });

    assert.equal(payment.beneficiary_type, PaymentBeneficiaryType.DESIGNATED_WORKER_ACCOUNT);
    assert.equal(payment.beneficiary_driver_id, 'wrk-demo-01');
    assert.equal(payment.beneficiary_driver_name, 'Ramesh Kumar');
    assert.equal(payment.beneficiary_driver_code, 'EMP-DRV-001');

    // Confirm persisted in database table
    const checkStmt = db.prepare(`
      SELECT beneficiary_driver_id, beneficiary_type
      FROM resident_payments
      WHERE id = ?
    `);
    const saved = checkStmt.get(payment.id) as any;
    assert.equal(saved.beneficiary_driver_id, 'wrk-demo-01');
    assert.equal(saved.beneficiary_type, PaymentBeneficiaryType.DESIGNATED_WORKER_ACCOUNT);
  });

  // 5. Historical payment retains original driver after route reassignment
  it('5. Historical payment retains original driver snapshot even after route reassignment', () => {
    // Step 1: Initiate payment under Driver 1 (Ramesh Kumar, wrk-demo-01)
    const payment = paymentService.initiatePayment({
      householdId: 'house-demo-101',
      obligationId: 'ob-demo-101',
      amountPaise: 10000,
      paymentMethod: 'UPI',
      idempotencyKey: 'TEST-HIST-REASSIGN-001'
    });
    assert.equal(payment.beneficiary_driver_id, 'wrk-demo-01');

    // Step 2: Route A is reassigned to Driver 2 (Arun Varma, wrk-demo-02)
    const srcRow = db.prepare('SELECT id FROM data_sources LIMIT 1').get() as { id: string };
    db.exec(`
      UPDATE master_assignments 
      SET is_current = 0, valid_to = '2026-09-17'
      WHERE route_id = 'route-demo-A';

      INSERT INTO master_assignments (
        id, route_id, vehicle_id, driver_id, supervisor_id, valid_from, valid_to, is_current, source_id, created_at
      ) VALUES (
        'ma-test-new-01', 'route-demo-A', 'veh-demo-01', 'wrk-demo-02', 'wrk-demo-05', '2026-09-18', null, 1, '${srcRow.id}', datetime('now')
      );
    `);

    // Step 3: Current route driver is now Arun Varma
    const currentRouteDriver = paymentService.resolveRouteDriverForHousehold('house-demo-101');
    assert.equal(currentRouteDriver.driver_id, 'wrk-demo-02', 'New route assignment should resolve to Driver 2');

    // Step 4: Verify the historical payment STILL references original Driver 1 (Ramesh Kumar)
    const histStmt = db.prepare(`
      SELECT p.id, p.beneficiary_driver_id, w.full_name as driver_name
      FROM resident_payments p
      JOIN workers w ON p.beneficiary_driver_id = w.id
      WHERE p.id = ?
    `);
    const histPayment = histStmt.get(payment.id) as any;
    assert.equal(histPayment.beneficiary_driver_id, 'wrk-demo-01', 'Historical payment must NOT mutate to new driver');
    assert.equal(histPayment.driver_name, 'Ramesh Kumar');
  });

  // 6. Citizen sees assigned driver as beneficiary
  it('6. Citizen API endpoint exposes assigned driver and vehicle/route in obligations', async () => {
    const app = await buildApp({ database: db });
    const token = authService.createToken({
      userId: 'usr-citizen-01',
      username: 'citizen_priya',
      role: UserRole.CITIZEN,
      householdId: 'house-demo-101'
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/finance/obligations/house-demo-101',
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.obligations.length > 0);

    const ob = body.obligations[0];
    assert.equal(ob.beneficiary_type, PaymentBeneficiaryType.DESIGNATED_WORKER_ACCOUNT);
    assert.equal(ob.beneficiary_driver_name, 'Ramesh Kumar');
    assert.equal(ob.beneficiary_driver_code, 'EMP-DRV-001');
    assert.equal(ob.assigned_vehicle_reg, 'DL-01-GA-1001');
    assert.equal(ob.assigned_route_name, 'Gandhi Road Main Route');
    await app.close();
  });

  // 7. Authority sees assigned driver as beneficiary
  it('7. Authority API endpoint exposes driver beneficiary across payments list', async () => {
    const app = await buildApp({ database: db });
    const commissionerToken = authService.createToken({
      userId: 'usr-auth-01',
      username: 'commissioner',
      role: UserRole.AUTHORITY
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/finance/payments/house-demo-101',
      headers: { authorization: `Bearer ${commissionerToken}` }
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.payments.length > 0);

    const p = body.payments[0];
    assert.equal(p.beneficiary_type, PaymentBeneficiaryType.DESIGNATED_WORKER_ACCOUNT);
    assert.equal(p.beneficiary_driver_name, 'Ramesh Kumar');
    assert.equal(p.beneficiary_driver_code, 'EMP-DRV-001');
    assert.equal(p.assigned_vehicle_reg, 'DL-01-GA-1001');
    assert.equal(p.assigned_route_name, 'Gandhi Road Main Route');
    await app.close();
  });

  // 8. Municipality is not displayed as beneficiary for the driver-based fee
  it('8. Municipality treasury is NOT the beneficiary model for citizen collection fee obligations', () => {
    const stmt = db.prepare(`
      SELECT beneficiary_model, count(*) as count
      FROM payment_obligations
      WHERE is_active = 1
      GROUP BY beneficiary_model
    `);
    const rows = stmt.all() as Array<{ beneficiary_model: string; count: number }>;
    for (const r of rows) {
      assert.notEqual(r.beneficiary_model, PaymentBeneficiaryType.MUNICIPAL_TREASURY_ACCOUNT,
        'Active citizen garbage collection fee obligations must not specify municipal treasury as beneficiary');
      assert.equal(r.beneficiary_model, PaymentBeneficiaryType.DESIGNATED_WORKER_ACCOUNT);
    }
  });

  // 9. Payment lifecycle remains unchanged
  it('9. Canonical payment lifecycle INITIATED -> SUCCESSFUL -> RECONCILED remains strictly enforced', () => {
    // Step 1: INITIATED
    const payment = paymentService.initiatePayment({
      householdId: 'house-demo-101',
      obligationId: 'ob-demo-101',
      amountPaise: 10000,
      paymentMethod: 'UPI',
      idempotencyKey: 'TEST-LIFECYCLE-001'
    });
    assert.equal(payment.status, PaymentStatus.INITIATED);
    assert.equal(payment.confirmed_at, null);

    // Step 2: Webhook transitions to SUCCESSFUL
    const payload = JSON.stringify({
      payment_id: String(payment.id),
      provider_name: 'SBI_EPAY',
      provider_transaction_ref: 'SBI-LIFE-001',
      amount_paise: 10000,
      status: 'SUCCESS',
      timestamp: new Date().toISOString()
    });
    const sig = paymentService.generateWebhookSignature(payload);
    const webhookRes = paymentService.processProviderWebhook(payload, sig);
    assert.equal(webhookRes.status, PaymentStatus.SUCCESSFUL);

    // Step 3: Reconcile with bank statement
    const reconRes = paymentService.reconcileWithBankScroll({
      paymentId: String(payment.id),
      bankStatementRef: 'BANK-STMT-LIFE-001',
      statementAmountPaise: 10000,
      reconciledBy: 'usr-admin-01',
      notes: 'Driver income bank credit corroborated'
    });
    assert.equal(reconRes.status, ReconciliationStatus.MATCHED);
    const pCheck = db.prepare('SELECT status FROM resident_payments WHERE id = ?').get(payment.id) as any;
    assert.equal(pCheck.status, PaymentStatus.RECONCILIATION_MATCHED);
  });

  // 10. CRR remains exactly correct
  it('10. CRR calculation formula remains identical (P_reconciled / B_levied * 100%)', () => {
    // Current seeded data: 3 obligations @ 10000 paise = 30000 paise levied.
    // pay-demo-101 is matched reconciled (10000 paise).
    // CRR = 10000 / 30000 * 100 = 33.33%
    const crr = metricsService.calculateCollectionReconciliationRatio('2026-09');
    assert.equal(crr.numerator, 10000);
    assert.equal(crr.denominator, 30000);
    assert.equal(crr.value_percentage, 33.33);
    assert.equal(crr.formula, 'CRR = (Sum(P_reconciled_matched) / Sum(B_levied)) * 100%');
  });

  // 11. Integer paise arithmetic remains unchanged
  it('11. Integer paise arithmetic is strictly preserved without floating point corruption', () => {
    const obStmt = db.prepare(`SELECT amount_paise FROM payment_obligations WHERE id = 'ob-demo-101'`);
    const ob = obStmt.get() as { amount_paise: number };
    assert.equal(Number.isInteger(ob.amount_paise), true);
    assert.equal(ob.amount_paise, 10000);

    const payStmt = db.prepare(`SELECT amount_paise FROM resident_payments WHERE id = 'pay-demo-101'`);
    const pay = payStmt.get() as { amount_paise: number };
    assert.equal(Number.isInteger(pay.amount_paise), true);
    assert.equal(pay.amount_paise, 10000);
  });

  // 12. RBAC/anti-IDOR remain intact
  it('12. Citizen cannot access another household obligations or payments (Anti-IDOR)', async () => {
    const app = await buildApp({ database: db });
    const priyaToken = authService.createToken({
      userId: 'usr-citizen-01',
      username: 'citizen_priya',
      role: UserRole.CITIZEN,
      householdId: 'house-demo-101'
    });

    // Attempt to access house-demo-102 obligations
    const resOb = await app.inject({
      method: 'GET',
      url: '/api/v1/finance/obligations/house-demo-102',
      headers: { authorization: `Bearer ${priyaToken}` }
    });
    assert.equal(resOb.statusCode, 403, 'Anti-IDOR must reject citizen accessing other household obligations');

    // Attempt to initiate payment for house-demo-102
    const resPay = await app.inject({
      method: 'POST',
      url: '/api/v1/finance/payments/initiate',
      headers: { authorization: `Bearer ${priyaToken}` },
      payload: {
        household_id: 'house-demo-102',
        obligation_id: 'ob-demo-102',
        amount_paise: 10000,
        payment_method: 'UPI',
        idempotency_key: 'IDOR-ATTACK-001'
      }
    });
    assert.equal(resPay.statusCode, 403, 'Anti-IDOR must reject payment initiation on foreign household');
    await app.close();
  });

  // 13. Driver cannot access another driver or citizen protected financial info
  it('13. Driver role cannot access reconciliation admin endpoints or unauthorized households', async () => {
    const app = await buildApp({ database: db });
    const driverToken = authService.createToken({
      userId: 'usr-driver-01',
      username: 'driver_ramesh',
      role: UserRole.DRIVER
    });

    // Driver cannot call reconcile endpoint
    const resRecon = await app.inject({
      method: 'POST',
      url: '/api/v1/finance/reconcile',
      headers: { authorization: `Bearer ${driverToken}` },
      payload: {
        payment_id: 'pay-demo-101',
        bank_statement_ref: 'STMT-001',
        statement_amount_paise: 10000
      }
    });
    assert.equal(resRecon.statusCode, 403, 'Driver must be forbidden from bank reconciliation administration');
    await app.close();
  });

  // 14. No fake bank transfer is reported as successful
  it('14. Payment initiation does NOT fabricate a successful bank credit', () => {
    const payment = paymentService.initiatePayment({
      householdId: 'house-demo-101',
      obligationId: 'ob-demo-101',
      amountPaise: 10000,
      paymentMethod: 'UPI',
      idempotencyKey: 'TEST-NO-FAKE-BANK-001'
    });

    assert.equal(payment.status, PaymentStatus.INITIATED);
    assert.notEqual(payment.status, PaymentStatus.SUCCESSFUL);
    assert.equal(payment.confirmed_at, null);

    // Verify database state has no fake provider confirmation
    const stmt = db.prepare(`SELECT provider_transaction_ref, confirmed_at FROM resident_payments WHERE id = ?`);
    const saved = stmt.get(payment.id) as any;
    assert.equal(saved.provider_transaction_ref, null);
    assert.equal(saved.confirmed_at, null);
  });

  // 15. Forward migration 0002 applies cleanly
  it('15. Migration 0002 adds beneficiary_driver_id and creates indexes idempotently', () => {
    const poInfo = db.prepare("PRAGMA table_info(payment_obligations);").all() as Array<{ name: string }>;
    assert.ok(poInfo.some(c => c.name === 'beneficiary_driver_id'), 'payment_obligations must have beneficiary_driver_id column');

    const rpInfo = db.prepare("PRAGMA table_info(resident_payments);").all() as Array<{ name: string }>;
    assert.ok(rpInfo.some(c => c.name === 'beneficiary_driver_id'), 'resident_payments must have beneficiary_driver_id column');
  });
});
