import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { config } from '../config/index.js';
import {
  PaymentStatus,
  PaymentBeneficiaryType,
  ReconciliationStatus
} from '../types/domain.js';
import { ProvenanceService } from './provenance.service.js';
import { AnomalyService } from './anomaly.service.js';

export const webhookPayloadSchema = z.object({
  payment_id: z.string().uuid(),
  provider_name: z.string().min(1),
  provider_transaction_ref: z.string().min(1),
  amount_paise: z.number().int().positive(),
  status: z.enum(['SUCCESS', 'FAILURE', 'CANCELLED']),
  timestamp: z.string()
});
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

export interface InitiatePaymentParams {
  householdId: string;
  obligationId: string;
  amountPaise: number;
  paymentMethod: 'UPI' | 'NET_BANKING' | 'CARD' | 'AUTHORIZED_COUNTER';
  idempotencyKey: string;
  providerName?: string;
  sourceId?: string;
}

export class PaymentService {
  private db: DatabaseSync;
  private provenance: ProvenanceService;
  private anomaly: AnomalyService;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
    this.provenance = new ProvenanceService(this.db);
    this.anomaly = new AnomalyService(this.db);
  }

  /**
   * Generates a cryptographic HMAC-SHA256 signature for a webhook payload string.
   */
  public generateWebhookSignature(payloadString: string): string {
    return crypto
      .createHmac('sha256', config.WEBHOOK_HMAC_SECRET)
      .update(payloadString)
      .digest('hex');
  }

  /**
   * Verifies an incoming HMAC-SHA256 signature against the raw payload string.
   */
  public verifyWebhookSignature(payloadString: string, signature: string): boolean {
    if (!signature) return false;
    const expected = this.generateWebhookSignature(payloadString);
    try {
      return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  /**
   * Phase 1: Payment Initiation
   * Creates an INITIATED payment record. Does NOT mark payment as successful.
   */
  public initiatePayment(params: InitiatePaymentParams): Record<string, unknown> {
    // 1. Check idempotency key first
    const existingStmt = this.db.prepare(`
      SELECT * FROM resident_payments WHERE idempotency_key = ?
    `);
    const existing = existingStmt.get(params.idempotencyKey) as Record<string, unknown> | undefined;
    if (existing) {
      return existing;
    }

    // 2. Validate obligation
    const obligationStmt = this.db.prepare(`
      SELECT * FROM payment_obligations WHERE id = ? AND household_id = ? AND is_active = 1
    `);
    const obligation = obligationStmt.get(params.obligationId, params.householdId) as {
      id: string;
      amount_paise: number;
      beneficiary_model: PaymentBeneficiaryType;
      beneficiary_driver_id?: string | null;
    } | undefined;

    if (!obligation) {
      throw new Error('Valid active payment obligation not found for this household.');
    }

    if (params.amountPaise !== obligation.amount_paise) {
      throw new Error(`Payment amount (${params.amountPaise} paise) does not match obligation billed amount (${obligation.amount_paise} paise).`);
    }

    // Resolve assigned route driver snapshot (obligation snapshot first, then master assignment fallback)
    let beneficiaryDriverId: string | null = obligation.beneficiary_driver_id || null;
    if (!beneficiaryDriverId) {
      const resolveStmt = this.db.prepare(`
        SELECT ma.driver_id
        FROM households h
        JOIN routes r ON h.route_id = r.id
        JOIN master_assignments ma ON ma.route_id = r.id AND ma.is_current = 1
        WHERE h.id = ?
        LIMIT 1
      `);
      const row = resolveStmt.get(params.householdId) as { driver_id?: string } | undefined;
      beneficiaryDriverId = row?.driver_id || null;
    }

    const id = crypto.randomUUID();
    const initiatedAt = new Date().toISOString();
    const sourceId = params.sourceId || this.provenance.getPrimaryDemoSourceId();
    const providerName = params.providerName || 'MUNICIPAL_PAYMENT_AGGREGATOR';

    const insertStmt = this.db.prepare(`
      INSERT INTO resident_payments (
        id, household_id, obligation_id, amount_paise, currency,
        payment_method, provider_name, provider_transaction_ref,
        idempotency_key, status, initiated_at, confirmed_at,
        beneficiary_type, beneficiary_driver_id, source_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      id,
      params.householdId,
      params.obligationId,
      params.amountPaise,
      'INR',
      params.paymentMethod,
      providerName,
      null, // provider ref not available at initiation
      params.idempotencyKey,
      PaymentStatus.INITIATED,
      initiatedAt,
      null,
      obligation.beneficiary_model || PaymentBeneficiaryType.DESIGNATED_WORKER_ACCOUNT,
      beneficiaryDriverId,
      sourceId
    );

    const getStmt = this.db.prepare(`
      SELECT 
        p.*,
        w.full_name as beneficiary_driver_name,
        w.employee_code as beneficiary_driver_code
      FROM resident_payments p
      LEFT JOIN workers w ON p.beneficiary_driver_id = w.id
      WHERE p.id = ?
    `);
    return getStmt.get(id) as Record<string, unknown>;
  }

  /**
   * Resolves the assigned route driver, vehicle, and route for a household based on current master assignment.
   */
  public resolveRouteDriverForHousehold(householdId: string): {
    driver_id: string | null;
    driver_name: string | null;
    driver_code: string | null;
    vehicle_reg: string | null;
    route_name: string | null;
  } {
    const stmt = this.db.prepare(`
      SELECT 
        w.id as driver_id,
        w.full_name as driver_name,
        w.employee_code as driver_code,
        v.registration_number as vehicle_reg,
        r.name as route_name
      FROM households h
      JOIN routes r ON h.route_id = r.id
      LEFT JOIN master_assignments ma ON ma.route_id = r.id AND ma.is_current = 1
      LEFT JOIN workers w ON ma.driver_id = w.id
      LEFT JOIN vehicles v ON ma.vehicle_id = v.id
      WHERE h.id = ?
      LIMIT 1
    `);
    const res = stmt.get(householdId) as any;
    return {
      driver_id: res?.driver_id || null,
      driver_name: res?.driver_name || null,
      driver_code: res?.driver_code || null,
      vehicle_reg: res?.vehicle_reg || null,
      route_name: res?.route_name || null
    };
  }

  /**
   * Phase 2: Transition to PENDING_PROVIDER
   */
  public markPendingProvider(paymentId: string): void {
    const stmt = this.db.prepare(`
      UPDATE resident_payments 
      SET status = ? 
      WHERE id = ? AND status = ?
    `);
    stmt.run(PaymentStatus.PENDING_PROVIDER, paymentId, PaymentStatus.INITIATED);
  }

  /**
   * Phase 3: Cryptographic Provider Confirmation Webhook Boundary
   */
  public processProviderWebhook(rawPayloadString: string, signatureHeader: string): {
    success: boolean;
    payment_id: string;
    status: PaymentStatus;
    message: string;
  } {
    // 1. Strict signature verification
    const isValidSignature = this.verifyWebhookSignature(rawPayloadString, signatureHeader);
    if (!isValidSignature) {
      throw new Error('UNAUTHORIZED_WEBHOOK: Cryptographic HMAC signature verification failed.');
    }

    // 2. Parse and validate JSON schema
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawPayloadString);
    } catch {
      throw new Error('INVALID_PAYLOAD: Failed to parse JSON payload.');
    }

    const payload = webhookPayloadSchema.parse(parsedJson);

    // 3. Find payment record
    const paymentStmt = this.db.prepare(`SELECT * FROM resident_payments WHERE id = ?`);
    const payment = paymentStmt.get(payload.payment_id) as {
      id: string;
      amount_paise: number;
      status: PaymentStatus;
      provider_transaction_ref?: string | null;
    } | undefined;

    if (!payment) {
      throw new Error(`Payment record not found: ${payload.payment_id}`);
    }

    // 4. Idempotent Replay Handling: If already SUCCESSFUL and webhook payload is SUCCESS with same ref
    if (
      payment.status === PaymentStatus.SUCCESSFUL &&
      payload.status === 'SUCCESS' &&
      payment.provider_transaction_ref === payload.provider_transaction_ref
    ) {
      return {
        success: true,
        payment_id: payment.id,
        status: PaymentStatus.SUCCESSFUL,
        message: 'Idempotent webhook: Payment is already confirmed successful.'
      };
    }

    // 5. Invariant: Cannot downgrade an already confirmed payment
    if (payment.status === PaymentStatus.SUCCESSFUL && payload.status !== 'SUCCESS') {
      throw new Error('ILLEGAL_STATE_TRANSITION: Cannot downgrade already CONFIRMED payment to failed/cancelled.');
    }

    // 6. Check for ANOM-04 (Reference collision with another payment)
    const collision = this.anomaly.evaluateGatewayRefCollision(payload.provider_transaction_ref, payment.id);
    if (collision) {
      throw new Error(`SECURITY_ANOMALY_TRIGGERED: Transaction reference collision detected (ANOM-04). Payment quarantined.`);
    }

    // 7. Verify amounts match
    if (payload.amount_paise !== payment.amount_paise) {
      throw new Error(`AMOUNT_MISMATCH: Gateway reported ${payload.amount_paise} paise, bill was ${payment.amount_paise} paise.`);
    }

    // 8. Execute State Transition
    let targetStatus: PaymentStatus;
    let confirmedAt: string | null = null;

    if (payload.status === 'SUCCESS') {
      targetStatus = PaymentStatus.SUCCESSFUL;
      confirmedAt = new Date().toISOString();
    } else if (payload.status === 'FAILURE') {
      targetStatus = PaymentStatus.FAILED;
    } else {
      targetStatus = PaymentStatus.CANCELLED;
    }

    const updateStmt = this.db.prepare(`
      UPDATE resident_payments
      SET status = ?, provider_transaction_ref = ?, provider_name = ?, confirmed_at = ?
      WHERE id = ?
    `);

    updateStmt.run(targetStatus, payload.provider_transaction_ref, payload.provider_name, confirmedAt, payment.id);

    return {
      success: true,
      payment_id: payment.id,
      status: targetStatus,
      message: `Payment status successfully updated to ${targetStatus}`
    };
  }

  /**
   * Phase 4 & 5: Bank Settlement Statement Reconciliation
   */
  public reconcileWithBankScroll(params: {
    paymentId: string;
    bankStatementRef: string;
    statementAmountPaise: number;
    reconciledBy: string;
    notes?: string;
  }): { reconciliationId: string; status: ReconciliationStatus; anomalyDetected: boolean } {
    const paymentStmt = this.db.prepare(`SELECT * FROM resident_payments WHERE id = ?`);
    const payment = paymentStmt.get(params.paymentId) as {
      id: string;
      amount_paise: number;
      status: PaymentStatus;
    } | undefined;

    if (!payment) {
      throw new Error(`Payment record not found: ${params.paymentId}`);
    }

    const isMatch = params.statementAmountPaise === payment.amount_paise;
    const reconciliationStatus = isMatch ? ReconciliationStatus.MATCHED : ReconciliationStatus.UNMATCHED_AMOUNT;
    const paymentTargetStatus = isMatch ? PaymentStatus.RECONCILIATION_MATCHED : PaymentStatus.RECONCILIATION_MISMATCH;

    const recId = crypto.randomUUID();
    const sourceId = this.provenance.getPrimaryDemoSourceId();
    const reconciledAt = new Date().toISOString();

    const insertRecStmt = this.db.prepare(`
      INSERT INTO payment_reconciliations (
        id, payment_id, bank_statement_ref, statement_amount_paise,
        status, reconciled_at, reconciled_by, notes, source_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertRecStmt.run(
      recId,
      params.paymentId,
      params.bankStatementRef,
      params.statementAmountPaise,
      reconciliationStatus,
      reconciledAt,
      params.reconciledBy,
      params.notes || null,
      sourceId
    );

    // Update payment status
    const updatePayStmt = this.db.prepare(`
      UPDATE resident_payments SET status = ? WHERE id = ?
    `);
    updatePayStmt.run(paymentTargetStatus, params.paymentId);

    // Trigger ANOM-05 if amounts mismatch
    let anomalyDetected = false;
    if (!isMatch) {
      this.anomaly.evaluateSettlementDiscrepancy(recId);
      anomalyDetected = true;
    }

    return {
      reconciliationId: recId,
      status: reconciliationStatus,
      anomalyDetected
    };
  }
}
