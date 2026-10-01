import crypto from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
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

const resolveComplaintSchema = z.object({
  status: z.enum(['INVESTIGATING', 'RESOLVED', 'REJECTED']),
  resolution_notes: z.string().min(5)
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
    const user = request.user!;
    if (user.role !== UserRole.CITIZEN && user.role !== UserRole.ADMIN) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Only citizens (for their own registered household) and administrators are authorized to lodge complaints.'
      });
    }

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
    if (user.role === UserRole.CITIZEN) {
      if (!user.householdId || user.householdId !== household_id) {
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

    // Check if a service run on this date had marked collection as VERIFIED or OBSERVED -> transition to DISPUTED & trigger ANOM-03
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
      if (collRecord.verification_status === VerificationStatus.VERIFIED || collRecord.verification_status === VerificationStatus.OBSERVED) {
        const previousStatus = collRecord.verification_status;
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

        // Distinct audit event for complaint dispute transition
        audit.logEvent({
          actorId: user.userId,
          actorRole: user.role,
          actionType: 'COMPLAINT_DISPUTE_TRIGGERED',
          entityName: 'collection_records',
          entityId: collRecord.id,
          beforeState: { verification_status: previousStatus },
          afterState: {
            verification_status: VerificationStatus.DISPUTED,
            complaint_id: id,
            household_id,
            service_date
          },
          ipAddress: request.ip
        });

        // Trigger ANOM-03
        anomaly.recordAnomaly({
          service_run_id: collRecord.service_run_id,
          anomaly_id: 'ANOM-03',
          severity: 'MEDIUM' as any,
          description: `Discrepancy: Collection marked ${previousStatus} by crew, but resident filed missed-collection complaint requiring review.`,
          trigger_evidence: {
            household_id,
            complaint_id: id,
            filed_at: now,
            resident_remarks,
            previous_status: previousStatus
          }
        });

        disputeTriggered = true;
      }
    }

    // Audit event for complaint filing
    audit.logEvent({
      actorId: user.userId,
      actorRole: user.role,
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
    const user = request.user!;
    if (user.role === UserRole.WORKER || user.role === UserRole.DRIVER) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Field workers and drivers are not permitted to view grievance registers.'
      });
    }

    let sql = `
      SELECT c.*, h.service_uid, h.resident_name, h.address_line, r.name as route_name, ar.ward_id
      FROM complaints c
      JOIN households h ON c.household_id = h.id
      JOIN routes r ON h.route_id = r.id
      JOIN areas ar ON r.area_id = ar.id
      WHERE 1=1
    `;
    const params: string[] = [];

    // Citizens can only view their own complaints
    if (user.role === UserRole.CITIZEN) {
      if (!user.householdId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'No household assigned.' });
      }
      sql += ` AND c.household_id = ?`;
      params.push(user.householdId);
    } else if (user.role === UserRole.SUPERVISOR || user.role === UserRole.WARD_OFFICER) {
      if (!user.wardId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Supervisor or Ward Officer has no assigned ward.' });
      }
      sql += ` AND ar.ward_id = ?`;
      params.push(user.wardId);
    }

    sql += ` ORDER BY c.filed_at DESC`;
    const stmt = db.prepare(sql);
    const complaints = stmt.all(...params);

    return reply.send({ complaints, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // PATCH /api/v1/complaints/:id/resolve (Authorized Scoped Complaint Review Workflow)
  fastify.patch('/:id/resolve', {
    preHandler: [authenticate, requireRoles(UserRole.SUPERVISOR, UserRole.WARD_OFFICER, UserRole.AUTHORITY, UserRole.ADMIN)]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const parseResult = resolveComplaintSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        message: 'Invalid complaint resolution parameters.',
        details: parseResult.error.format()
      });
    }

    const { status, resolution_notes } = parseResult.data;

    // Fetch existing complaint with ward information
    const compStmt = db.prepare(`
      SELECT c.*, ar.ward_id
      FROM complaints c
      JOIN households h ON c.household_id = h.id
      JOIN routes r ON h.route_id = r.id
      JOIN areas ar ON r.area_id = ar.id
      WHERE c.id = ?
    `);
    const complaint = compStmt.get(id) as {
      id: string;
      household_id: string;
      service_date: string;
      status: string;
      ward_id: string;
    } | undefined;

    if (!complaint) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Complaint record not found.' });
    }

    // Ward scoping for Supervisor/Ward Officer
    if (user.role === UserRole.SUPERVISOR || user.role === UserRole.WARD_OFFICER) {
      if (!user.wardId) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Supervisor or Ward Officer has no assigned ward.'
        });
      }
      if (complaint.ward_id !== user.wardId) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Access Denied: Grievance belongs to another municipal ward.'
        });
      }
    }

    const now = new Date().toISOString();
    let workerId = user.workerId || null;
    if (!workerId) {
      const uRow = db.prepare(`SELECT worker_id FROM users WHERE id = ?`).get(user.userId) as { worker_id?: string | null } | undefined;
      workerId = uRow?.worker_id || null;
    }

    const updateStmt = db.prepare(`
      UPDATE complaints
      SET status = ?, resolution_notes = ?, resolved_by = ?, resolved_at = ?
      WHERE id = ?
    `);
    updateStmt.run(status, resolution_notes, workerId, now, id);

    // Audit event for complaint resolution
    audit.logEvent({
      actorId: user.userId,
      actorRole: user.role,
      actionType: 'RESOLVE_COMPLAINT',
      entityName: 'complaints',
      entityId: id,
      beforeState: { status: complaint.status },
      afterState: { status, resolution_notes, resolved_by: user.userId, resolved_at: now },
      ipAddress: request.ip
    });

    return reply.send({
      success: true,
      complaint_id: id,
      status,
      resolution_notes,
      resolved_at: now,
      data_classification: DataClassification.SIMULATED_DEMO_DATA
    });
  });
};
