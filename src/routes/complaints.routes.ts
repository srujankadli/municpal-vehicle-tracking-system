import crypto from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { UserRole, DataClassification, VerificationStatus } from '../types/domain.js';
import { ProvenanceService } from '../services/provenance.service.js';
import { AnomalyService } from '../services/anomaly.service.js';
import { AuditService } from '../services/audit.service.js';

const createComplaintSchema = z.object({
  household_id: z.string().min(1),
  service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  complaint_type: z.string().default('MISSED_COLLECTION'),
  resident_remarks: z.string().min(5)
});

export const complaintsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const db = getDatabase();
  const provenance = new ProvenanceService(db);
  const anomaly = new AnomalyService(db);
  const audit = new AuditService(db);

  // POST /api/v1/complaints
  fastify.post('/', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const parseResult = createComplaintSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        message: 'Invalid complaint submission parameters.',
        details: parseResult.error.format()
      });
    }

    const { household_id, service_date, complaint_type, resident_remarks } = parseResult.data;

    // Anti-IDOR Enforcement: Citizens can ONLY lodge complaints for their own registered premises!
    if (request.user!.role === UserRole.CITIZEN) {
      if (!request.user!.householdId || request.user!.householdId !== household_id) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Anti-IDOR Violation: You are not authorized to submit grievances for another household.'
        });
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const sourceId = provenance.getPrimaryDemoSourceId();

    const insertStmt = db.prepare(`
      INSERT INTO complaints (
        id, household_id, service_date, complaint_type,
        resident_remarks, status, filed_at, source_id
      ) VALUES (?, ?, ?, ?, ?, 'SUBMITTED', ?, ?)
    `);

    insertStmt.run(id, household_id, service_date, complaint_type, resident_remarks, now, sourceId);

    // Check if a service run on this date had marked collection as VERIFIED -> transition to DISPUTED & trigger ANOM-03
    const checkCollStmt = db.prepare(`
      SELECT cr.id, cr.service_run_id, cr.verification_status
      FROM collection_records cr
      JOIN daily_service_runs r ON cr.service_run_id = r.id
      JOIN daily_assignments a ON r.assignment_id = a.id
      WHERE cr.household_id = ? AND a.service_date = ?
    `);
    const collRecord = checkCollStmt.get(household_id, service_date) as {
      id: string;
      service_run_id: string;
      verification_status: string;
    } | undefined;

    let disputeTriggered = false;

    if (collRecord) {
      if (collRecord.verification_status === VerificationStatus.VERIFIED) {
        // Transition to DISPUTED
        const updateStmt = db.prepare(`
          UPDATE collection_records
          SET verification_status = ?, exception_reason = ?, updated_at = ?
          WHERE id = ?
        `);
        updateStmt.run(
          VerificationStatus.DISPUTED,
          'Citizen filed missed-collection complaint; contested service claim.',
          now,
          collRecord.id
        );

        // Trigger ANOM-03
        anomaly.recordAnomaly({
          service_run_id: collRecord.service_run_id,
          anomaly_id: 'ANOM-03',
          severity: 'MEDIUM' as any,
          description: `Discrepancy: Collection marked VERIFIED by crew, but resident filed missed-collection complaint.`,
          trigger_evidence: {
            household_id,
            complaint_id: id,
            filed_at: now,
            resident_remarks
          }
        });

        disputeTriggered = true;
      }
    }

    // Audit event
    audit.logEvent({
      actorId: request.user!.userId,
      actorRole: request.user!.role,
      actionType: 'FILE_COMPLAINT',
      entityName: 'complaints',
      entityId: id,
      afterState: { household_id, service_date, complaint_type, disputeTriggered },
      ipAddress: request.ip
    });

    return reply.status(201).send({
      success: true,
      complaint_id: id,
      dispute_triggered: disputeTriggered,
      data_classification: DataClassification.SIMULATED_DEMO_DATA
    });
  });

  // GET /api/v1/complaints
  fastify.get('/', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    let sql = `SELECT * FROM complaints WHERE 1=1`;
    const params: string[] = [];

    // Citizens can only view their own complaints
    if (request.user!.role === UserRole.CITIZEN) {
      if (!request.user!.householdId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'No household assigned.' });
      }
      sql += ` AND household_id = ?`;
      params.push(request.user!.householdId);
    }

    sql += ` ORDER BY filed_at DESC`;
    const stmt = db.prepare(sql);
    const complaints = stmt.all(...params);

    return reply.send({ complaints, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });
};
