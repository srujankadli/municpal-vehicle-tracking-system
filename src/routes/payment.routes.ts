import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { authenticate, requireRoles, enforceFinanceAccess } from '../middleware/auth.middleware.js';
import { UserRole, DataClassification } from '../types/domain.js';
import { PaymentService } from '../services/payment.service.js';
import { AuditService } from '../services/audit.service.js';

const initiatePaymentSchema = z.object({
  household_id: z.string().min(1),
  obligation_id: z.string().min(1),
  amount_paise: z.number().int().positive(),
  payment_method: z.enum(['UPI', 'NET_BANKING', 'CARD', 'AUTHORIZED_COUNTER']),
  idempotency_key: z.string().min(8)
});

const reconcileSchema = z.object({
  payment_id: z.string().min(1),
  bank_statement_ref: z.string().min(1),
  statement_amount_paise: z.number().int().positive(),
  notes: z.string().optional()
});

export const paymentRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const db = getDatabase();
  const paymentService = new PaymentService(db);
  const audit = new AuditService(db);

  // GET /api/v1/finance/obligations/:household_id (Restricted to Citizen or Authority/Admin)
  fastify.get('/obligations/:household_id', {
    preHandler: [authenticate, enforceFinanceAccess]
  }, async (request, reply) => {
    const { household_id } = request.params as { household_id: string };
    const stmt = db.prepare(`
      SELECT 
        po.id,
        po.household_id,
        po.obligation_type,
        po.amount_paise,
        po.billing_period,
        po.beneficiary_model,
        po.beneficiary_model as beneficiary_type,
        po.beneficiary_driver_id,
        po.is_active,
        po.source_id,
        po.created_at,
        w.full_name as beneficiary_driver_name,
        w.employee_code as beneficiary_driver_code,
        v.registration_number as assigned_vehicle_reg,
        r.name as assigned_route_name
      FROM payment_obligations po
      LEFT JOIN workers w ON po.beneficiary_driver_id = w.id
      LEFT JOIN households h ON po.household_id = h.id
      LEFT JOIN routes r ON h.route_id = r.id
      LEFT JOIN master_assignments ma ON ma.route_id = r.id AND ma.is_current = 1
      LEFT JOIN vehicles v ON ma.vehicle_id = v.id
      WHERE po.household_id = ? AND po.is_active = 1
    `);
    const obligations = stmt.all(household_id);
    return reply.send({ obligations, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // POST /api/v1/finance/payments/initiate (Phase 1 of payment lifecycle)
  fastify.post('/payments/initiate', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const parseResult = initiatePaymentSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        message: 'Invalid payment initiation parameters.',
        details: parseResult.error.format()
      });
    }

    const data = parseResult.data;

    // Only citizens (for own household) or admins can initiate payment sessions
    if (request.user!.role !== UserRole.CITIZEN && request.user!.role !== UserRole.ADMIN) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: `Role '${request.user!.role}' is not authorized to initiate citizen payment sessions.`
      });
    }

    // Anti-IDOR for citizens
    if (request.user!.role === UserRole.CITIZEN) {
      if (!request.user!.householdId || request.user!.householdId !== data.household_id) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Anti-IDOR Violation: You cannot initiate payments on behalf of another household.'
        });
      }
    }

    try {
      const payment = paymentService.initiatePayment({
        householdId: data.household_id,
        obligationId: data.obligation_id,
        amountPaise: data.amount_paise,
        paymentMethod: data.payment_method,
        idempotencyKey: data.idempotency_key
      });

      return reply.status(201).send({
        success: true,
        payment,
        data_classification: DataClassification.SIMULATED_DEMO_DATA
      });
    } catch (err: any) {
      return reply.status(422).send({
        error: 'PAYMENT_INITIATION_FAILED',
        message: err.message || 'Failed to initiate payment.'
      });
    }
  });

  // POST /api/v1/finance/payments/webhook (Cryptographic Provider Webhook Boundary)
  fastify.post('/payments/webhook', async (request, reply) => {
    const signature = request.headers['x-provider-signature'] as string | undefined;
    if (!signature) {
      return reply.status(401).send({
        error: 'UNAUTHORIZED_WEBHOOK',
        message: 'Missing x-provider-signature header.'
      });
    }

    const rawPayload = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);

    try {
      const result = paymentService.processProviderWebhook(rawPayload, signature);
      audit.logEvent({
        actorId: 'PROVIDER_GATEWAY',
        actorRole: UserRole.ADMIN,
        actionType: 'PAYMENT_WEBHOOK_STATUS',
        entityName: 'resident_payments',
        entityId: result.payment_id,
        afterState: { status: result.status, message: result.message },
        ipAddress: request.ip
      });
      return reply.status(200).send(result);
    } catch (err: any) {
      return reply.status(400).send({
        error: 'WEBHOOK_VERIFICATION_FAILED',
        message: err.message || 'Webhook processing failed.'
      });
    }
  });

  // POST /api/v1/finance/reconcile (Phase 5: Bank Settlement Scroll Reconciliation)
  fastify.post('/reconcile', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.ADMIN)]
  }, async (request, reply) => {
    const parseResult = reconcileSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        message: 'Invalid reconciliation parameters.',
        details: parseResult.error.format()
      });
    }

    const data = parseResult.data;

    try {
      const result = paymentService.reconcileWithBankScroll({
        paymentId: data.payment_id,
        bankStatementRef: data.bank_statement_ref,
        statementAmountPaise: data.statement_amount_paise,
        reconciledBy: request.user!.userId,
        notes: data.notes
      });

      // Log audit event
      audit.logEvent({
        actorId: request.user!.userId,
        actorRole: request.user!.role,
        actionType: 'RECONCILE_PAYMENT',
        entityName: 'payment_reconciliations',
        entityId: result.reconciliationId,
        afterState: { ...data, status: result.status, anomalyDetected: result.anomalyDetected },
        ipAddress: request.ip
      });

      return reply.status(200).send({
        success: true,
        reconciliation: result,
        data_classification: DataClassification.SIMULATED_DEMO_DATA
      });
    } catch (err: any) {
      return reply.status(422).send({
        error: 'RECONCILIATION_FAILED',
        message: err.message || 'Reconciliation execution failed.'
      });
    }
  });

  // GET /api/v1/finance/payments/:household_id (Restricted to Citizen or Authority/Admin)
  fastify.get('/payments/:household_id', {
    preHandler: [authenticate, enforceFinanceAccess]
  }, async (request, reply) => {
    const { household_id } = request.params as { household_id: string };
    const stmt = db.prepare(`
      SELECT 
        p.*,
        w.full_name as beneficiary_driver_name,
        w.employee_code as beneficiary_driver_code,
        v.registration_number as assigned_vehicle_reg,
        r.name as assigned_route_name,
        rec.status as reconciliation_status,
        rec.bank_statement_ref
      FROM resident_payments p
      LEFT JOIN workers w ON p.beneficiary_driver_id = w.id
      LEFT JOIN households h ON p.household_id = h.id
      LEFT JOIN routes r ON h.route_id = r.id
      LEFT JOIN master_assignments ma ON ma.route_id = r.id AND ma.is_current = 1
      LEFT JOIN vehicles v ON ma.vehicle_id = v.id
      LEFT JOIN payment_reconciliations rec ON p.id = rec.payment_id
      WHERE p.household_id = ?
      ORDER BY p.initiated_at DESC
    `);
    const payments = stmt.all(household_id);
    return reply.send({ payments, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });
};
