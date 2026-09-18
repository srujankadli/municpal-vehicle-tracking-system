import crypto from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { UserRole, DataClassification, EvidenceType, VerificationStatus } from '../types/domain.js';
import { ProvenanceService } from '../services/provenance.service.js';
import { VerificationService } from '../services/verification.service.js';
import { AuditService } from '../services/audit.service.js';
import { AnomalyService } from '../services/anomaly.service.js';

const createAssignmentSchema = z.object({
  service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  route_id: z.string().min(1),
  vehicle_id: z.string().min(1),
  driver_id: z.string().min(1),
  supervisor_id: z.string().min(1),
  scheduled_start: z.string().datetime(),
  worker_ids: z.array(z.string()).default([]),
  notes: z.string().optional()
});

const submitEventSchema = z.object({
  client_event_id: z.string().uuid().optional(),
  household_id: z.string().min(1),
  evidence_type: z.nativeEnum(EvidenceType),
  captured_at: z.string().datetime(),
  device_id: z.string().optional(),
  raw_payload: z.record(z.string(), z.unknown()).optional()
});

const manualOverrideSchema = z.object({
  household_id: z.string().min(1),
  target_status: z.nativeEnum(VerificationStatus),
  override_reason: z.string().min(10)
});

export const operationsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const db = getDatabase();
  const provenance = new ProvenanceService(db);
  const verification = new VerificationService(db);
  const audit = new AuditService(db);
  const anomaly = new AnomalyService(db);

  // GET /api/v1/operations/assignments
  fastify.get('/assignments', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const query = request.query as { service_date?: string };
    let sql = `SELECT * FROM daily_assignments WHERE 1=1`;
    const params: string[] = [];
    if (query.service_date) {
      sql += ` AND service_date = ?`;
      params.push(query.service_date);
    }
    sql += ` ORDER BY scheduled_start ASC`;
    const stmt = db.prepare(sql);
    const assignments = stmt.all(...params);
    return reply.send({ assignments, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // POST /api/v1/operations/assignments (Supervisor / Admin only)
  // GET /api/v1/operations/assignments/my-assignment
  fastify.get('/assignments/my-assignment', {
    preHandler: [authenticate, requireRoles(UserRole.DRIVER, UserRole.WORKER)]
  }, async (request, reply) => {
    // Workers & Drivers can only see their own assigned operational tasks
    const query = request.query as { service_date?: string };
    let workerId = request.user!.workerId;
    if (!workerId) {
      const uRow = db.prepare(`SELECT worker_id FROM users WHERE id = ?`).get(request.user!.userId) as { worker_id?: string | null } | undefined;
      workerId = uRow?.worker_id || request.user!.userId;
    }
    const userId = request.user!.userId;

    let sql = `
      SELECT a.id, a.service_date, a.route_id, a.vehicle_id, a.scheduled_start, a.status, r.name as route_name, v.registration_number
      FROM daily_assignments a
      JOIN routes r ON a.route_id = r.id
      JOIN vehicles v ON a.vehicle_id = v.id
      WHERE (a.driver_id = ? OR a.driver_id = ? OR a.id IN (
        SELECT assignment_id FROM assignment_workers WHERE worker_id = ? OR worker_id = ?
      ))
    `;
    const params: string[] = [workerId, userId, workerId, userId];
    if (query.service_date) {
      sql += ` AND a.service_date = ?`;
      params.push(query.service_date);
    }
    sql += ` ORDER BY a.service_date DESC, a.scheduled_start ASC LIMIT 1`;
    const stmt = db.prepare(sql);
    const assignment = stmt.get(...params);
    return reply.send({ assignment: assignment || null, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // POST /api/v1/operations/assignments
  fastify.post('/assignments', {
    preHandler: [authenticate, requireRoles(UserRole.SUPERVISOR, UserRole.ADMIN)]
  }, async (request, reply) => {
    const parseResult = createAssignmentSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        message: 'Invalid assignment parameters.',
        details: parseResult.error.format()
      });
    }

    const data = parseResult.data;

    // Check for vehicle conflict on same date
    const conflictStmt = db.prepare(`
      SELECT id FROM daily_assignments WHERE service_date = ? AND vehicle_id = ?
    `);
    const existing = conflictStmt.get(data.service_date, data.vehicle_id) as { id: string } | undefined;
    if (existing) {
      // Trigger ANOM-07 assignment conflict
      anomaly.recordAnomaly({
        service_run_id: null,
        anomaly_id: 'ANOM-07',
        severity: 'HIGH' as any,
        description: `Vehicle double-booking attempted: Vehicle ${data.vehicle_id} already assigned on ${data.service_date}.`,
        trigger_evidence: { service_date: data.service_date, vehicle_id: data.vehicle_id, existing_assignment_id: existing.id }
      });

      return reply.status(409).send({
        error: 'CONFLICT',
        message: `Vehicle ${data.vehicle_id} is already booked on ${data.service_date}. Assignment conflict blocked.`
      });
    }

    const assignmentId = crypto.randomUUID();
    const sourceId = provenance.getPrimaryDemoSourceId();
    const now = new Date().toISOString();

    const insertAssign = db.prepare(`
      INSERT INTO daily_assignments VALUES (?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, ?, ?)
    `);
    insertAssign.run(
      assignmentId, data.service_date, data.route_id, data.vehicle_id,
      data.driver_id, data.supervisor_id, data.scheduled_start,
      data.notes || null, sourceId, now, request.user!.userId
    );

    // Insert workers
    const insertAw = db.prepare(`INSERT INTO assignment_workers VALUES (?, ?, ?, 'PRESENT', ?)`);
    for (const wId of data.worker_ids) {
      insertAw.run(crypto.randomUUID(), assignmentId, wId, sourceId);
    }

    // Auto-create daily_service_run record
    const runId = crypto.randomUUID();
    const insertRun = db.prepare(`
      INSERT INTO daily_service_runs VALUES (?, ?, null, null, 'NOT_STARTED', 0.00, ?, ?, ?)
    `);
    insertRun.run(runId, assignmentId, sourceId, now, now);

    // Audit log
    audit.logEvent({
      actorId: request.user!.userId,
      actorRole: request.user!.role,
      actionType: 'CREATE_ASSIGNMENT',
      entityName: 'daily_assignments',
      entityId: assignmentId,
      afterState: { ...data, assignmentId, runId },
      ipAddress: request.ip
    });

    return reply.status(201).send({
      success: true,
      assignment_id: assignmentId,
      run_id: runId,
      data_classification: DataClassification.SIMULATED_DEMO_DATA
    });
  });

  // GET /api/v1/operations/runs/:run_id
  fastify.get('/runs/:run_id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { run_id } = request.params as { run_id: string };
    const stmt = db.prepare(`
      SELECT r.*, a.service_date, a.route_id, a.vehicle_id, a.driver_id, a.supervisor_id
      FROM daily_service_runs r
      JOIN daily_assignments a ON r.assignment_id = a.id
      WHERE r.id = ?
    `);
    const run = stmt.get(run_id);
    if (!run) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Service run not found.' });
    }
    return reply.send({ run, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // POST /api/v1/operations/runs/:run_id/events (Submit doorstep scan or proximity evidence)
  fastify.post('/runs/:run_id/events', {
    preHandler: [authenticate, requireRoles(UserRole.DRIVER, UserRole.WORKER, UserRole.SUPERVISOR, UserRole.ADMIN)]
  }, async (request, reply) => {
    const { run_id } = request.params as { run_id: string };
    const parseResult = submitEventSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        message: 'Invalid evidence event payload.',
        details: parseResult.error.format()
      });
    }

    const data = parseResult.data;

    // Record evidence with deterministic duplicate detection
    const evidenceResult = verification.recordEvidence({
      id: data.client_event_id,
      serviceRunId: run_id,
      householdId: data.household_id,
      evidenceType: data.evidence_type,
      capturedAt: data.captured_at,
      deviceId: data.device_id,
      actorId: request.user!.userId,
      rawPayload: data.raw_payload
    });

    if (evidenceResult.isDuplicate) {
      // Idempotent duplicate: Return 200 with current synthesis without creating new evidence or anomalies
      const synthesis = verification.evaluateHouseholdStatus(run_id, data.household_id);
      return reply.status(200).send({
        success: true,
        duplicate: true,
        evidence_id: evidenceResult.id,
        synthesis,
        anomalies_detected: false,
        data_classification: DataClassification.SIMULATED_DEMO_DATA
      });
    }

    // Evaluate ANOM-02 (Rapid-scan fraud)
    const rapidAnomalies = anomaly.evaluateRapidScanAnomaly(run_id);

    // Re-evaluate household verification status
    const synthesis = verification.evaluateHouseholdStatus(run_id, data.household_id);
    verification.updateHouseholdRecord(run_id, data.household_id, synthesis.status);

    return reply.status(201).send({
      success: true,
      duplicate: false,
      evidence_id: evidenceResult.id,
      synthesis,
      anomalies_detected: rapidAnomalies.length > 0,
      data_classification: DataClassification.SIMULATED_DEMO_DATA
    });
  });

  // GET /api/v1/operations/runs/:run_id/households/:household_id/status
  fastify.get('/runs/:run_id/households/:household_id/status', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { run_id, household_id } = request.params as { run_id: string; household_id: string };
    const synthesis = verification.evaluateHouseholdStatus(run_id, household_id);
    return reply.send({ synthesis, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // POST /api/v1/operations/runs/:run_id/manual-override (Supervisor/Admin only, writes audit event)
  fastify.post('/runs/:run_id/manual-override', {
    preHandler: [authenticate, requireRoles(UserRole.SUPERVISOR, UserRole.ADMIN)]
  }, async (request, reply) => {
    const { run_id } = request.params as { run_id: string };
    const parseResult = manualOverrideSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        message: 'Invalid manual override payload.',
        details: parseResult.error.format()
      });
    }

    const { household_id, target_status, override_reason } = parseResult.data;

    // Fetch before state
    const beforeStmt = db.prepare(`
      SELECT * FROM collection_records WHERE service_run_id = ? AND household_id = ?
    `);
    const before = beforeStmt.get(run_id, household_id) as Record<string, unknown> | undefined;

    // Update status
    verification.updateHouseholdRecord(run_id, household_id, target_status, override_reason);

    // Log immutable audit event
    audit.logEvent({
      actorId: request.user!.userId,
      actorRole: request.user!.role,
      actionType: 'MANUAL_VERIFICATION_OVERRIDE',
      entityName: 'collection_records',
      entityId: `${run_id}:${household_id}`,
      beforeState: before || null,
      afterState: { target_status, override_reason },
      ipAddress: request.ip
    });

    return reply.send({
      success: true,
      message: `Status successfully overridden to ${target_status}`,
      data_classification: DataClassification.SIMULATED_DEMO_DATA
    });
  });
};
