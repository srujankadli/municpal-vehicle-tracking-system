import crypto from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { UserRole, DataClassification, EvidenceType, VerificationStatus } from '../types/domain.js';
import { ProvenanceService } from '../services/provenance.service.js';
import { VerificationService, type VerificationSynthesisResult } from '../services/verification.service.js';
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

  // GET /api/v1/operations/assignments (Role & Ward Scoped)
  fastify.get('/assignments', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.user!;
    if (user.role === UserRole.CITIZEN) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Citizens are not authorized to access operational assignment registers.'
      });
    }

    const query = request.query as { service_date?: string };
    let sql = `
      SELECT a.*, r.name as route_name, ar.ward_id, v.registration_number, dsr.id as run_id, dsr.run_status
      FROM daily_assignments a
      JOIN routes r ON a.route_id = r.id
      JOIN areas ar ON r.area_id = ar.id
      JOIN vehicles v ON a.vehicle_id = v.id
      LEFT JOIN daily_service_runs dsr ON dsr.assignment_id = a.id
      WHERE 1=1
    `;
    const params: string[] = [];
    if (query.service_date) {
      sql += ` AND a.service_date = ?`;
      params.push(query.service_date);
    }

    if (user.role === UserRole.SUPERVISOR || user.role === UserRole.WARD_OFFICER) {
      if (!user.wardId) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Supervisor or Ward Officer has no assigned ward.'
        });
      }
      sql += ` AND ar.ward_id = ?`;
      params.push(user.wardId);
    } else if (user.role === UserRole.WORKER || user.role === UserRole.DRIVER) {
      let workerId = user.workerId;
      if (!workerId) {
        const uRow = db.prepare(`SELECT worker_id FROM users WHERE id = ?`).get(user.userId) as { worker_id?: string | null } | undefined;
        workerId = uRow?.worker_id || user.userId;
      }
      sql += ` AND (a.driver_id = ? OR a.driver_id = ? OR a.id IN (
        SELECT assignment_id FROM assignment_workers WHERE worker_id = ? OR worker_id = ?
      ))`;
      params.push(workerId, user.userId, workerId, user.userId);
    }

    sql += ` ORDER BY a.scheduled_start ASC`;
    const stmt = db.prepare(sql);
    const assignments = stmt.all(...params);

    // Automatic ANOM-01 evaluation for pending scheduled assignments
    for (const a of assignments as any[]) {
      if (a.status === 'SCHEDULED' || !a.run_status || a.run_status === 'NOT_STARTED') {
        anomaly.evaluateAssignedVehicleInactivity(a.id);
      }
    }

    return reply.send({ assignments, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

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
      SELECT a.id, a.service_date, a.route_id, a.vehicle_id, a.scheduled_start, a.status,
             r.name as route_name, v.registration_number, dsr.id as run_id, dsr.run_status
      FROM daily_assignments a
      JOIN routes r ON a.route_id = r.id
      JOIN vehicles v ON a.vehicle_id = v.id
      LEFT JOIN daily_service_runs dsr ON dsr.assignment_id = a.id
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
    const assignment = stmt.get(...params) as any;
    if (assignment && (assignment.status === 'SCHEDULED' || !assignment.run_status || assignment.run_status === 'NOT_STARTED')) {
      anomaly.evaluateAssignedVehicleInactivity(assignment.id);
    }
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

  // GET /api/v1/operations/runs/:run_id (Scoped)
  fastify.get('/runs/:run_id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.user!;
    if (user.role === UserRole.CITIZEN) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Citizens are not authorized to inspect service runs directly.'
      });
    }

    const { run_id } = request.params as { run_id: string };
    const stmt = db.prepare(`
      SELECT r.*, a.id as assignment_id, a.service_date, a.route_id, a.vehicle_id, a.driver_id, a.supervisor_id,
             ar.ward_id, ro.name as route_name, v.registration_number
      FROM daily_service_runs r
      JOIN daily_assignments a ON r.assignment_id = a.id
      JOIN routes ro ON a.route_id = ro.id
      JOIN areas ar ON ro.area_id = ar.id
      JOIN vehicles v ON a.vehicle_id = v.id
      WHERE r.id = ?
    `);
    const run = stmt.get(run_id) as {
      id: string;
      assignment_id: string;
      run_status: string;
      service_date: string;
      route_id: string;
      vehicle_id: string;
      driver_id: string;
      supervisor_id: string;
      ward_id: string;
      route_name: string;
      registration_number: string;
    } | undefined;

    if (!run) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Service run not found.' });
    }

    if (user.role === UserRole.WORKER || user.role === UserRole.DRIVER) {
      let workerId = user.workerId;
      if (!workerId) {
        const uRow = db.prepare(`SELECT worker_id FROM users WHERE id = ?`).get(user.userId) as { worker_id?: string | null } | undefined;
        workerId = uRow?.worker_id || user.userId;
      }
      const isDriver = run.driver_id === workerId || run.driver_id === user.userId;
      const workerCheck = db.prepare(`SELECT 1 FROM assignment_workers WHERE assignment_id = ? AND (worker_id = ? OR worker_id = ?)`).get(run.assignment_id, workerId, user.userId);
      if (!isDriver && !workerCheck) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Access Denied: You are not assigned to this service run.'
        });
      }
    } else if (user.role === UserRole.SUPERVISOR || user.role === UserRole.WARD_OFFICER) {
      if (!user.wardId) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Supervisor or Ward Officer has no assigned ward.'
        });
      }
      if (run.ward_id !== user.wardId) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Access Denied: Service run route belongs to another municipal ward.'
        });
      }
    }

    if (run.run_status === 'NOT_STARTED') {
      anomaly.evaluateAssignedVehicleInactivity(run.assignment_id);
    }

    return reply.send({ run, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // GET /api/v1/operations/runs/:run_id/households (Safe Worker Household Selection API)
  fastify.get('/runs/:run_id/households', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.user!;
    if (user.role === UserRole.CITIZEN) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Citizens are not authorized to inspect run household rosters.'
      });
    }

    const { run_id } = request.params as { run_id: string };
    const runStmt = db.prepare(`
      SELECT r.id as run_id, a.id as assignment_id, a.route_id, a.driver_id, ar.ward_id
      FROM daily_service_runs r
      JOIN daily_assignments a ON r.assignment_id = a.id
      JOIN routes ro ON a.route_id = ro.id
      JOIN areas ar ON ro.area_id = ar.id
      WHERE r.id = ?
    `);
    const run = runStmt.get(run_id) as {
      run_id: string;
      assignment_id: string;
      route_id: string;
      driver_id: string;
      ward_id: string;
    } | undefined;

    if (!run) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Service run not found.' });
    }

    if (user.role === UserRole.WORKER || user.role === UserRole.DRIVER) {
      let workerId = user.workerId;
      if (!workerId) {
        const uRow = db.prepare(`SELECT worker_id FROM users WHERE id = ?`).get(user.userId) as { worker_id?: string | null } | undefined;
        workerId = uRow?.worker_id || user.userId;
      }
      const isDriver = run.driver_id === workerId || run.driver_id === user.userId;
      const workerCheck = db.prepare(`SELECT 1 FROM assignment_workers WHERE assignment_id = ? AND (worker_id = ? OR worker_id = ?)`).get(run.assignment_id, workerId, user.userId);
      if (!isDriver && !workerCheck) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Access Denied: You are not assigned to this service run.'
        });
      }
    } else if (user.role === UserRole.SUPERVISOR || user.role === UserRole.WARD_OFFICER) {
      if (!user.wardId) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Supervisor or Ward Officer has no assigned ward.'
        });
      }
      if (run.ward_id !== user.wardId) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Access Denied: Service run route belongs to another municipal ward.'
        });
      }
    }

    const hhStmt = db.prepare(`
      SELECT id, route_id, service_uid, resident_name, phone_masked, address_line, latitude, longitude
      FROM households
      WHERE route_id = ? AND is_active = 1
      ORDER BY service_uid ASC
    `);
    const households = hhStmt.all(run.route_id);
    return reply.send({
      run_id,
      route_id: run.route_id,
      households,
      data_classification: DataClassification.SIMULATED_DEMO_DATA
    });
  });

  // GET /api/v1/operations/citizen/service-status (Dynamic Citizen Service Run Resolution)
  fastify.get('/citizen/service-status', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.user!;
    if (user.role !== UserRole.CITIZEN) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Only citizens may access personal household service status.'
      });
    }
    const query = request.query as { service_date?: string };
    const serviceDate = query.service_date || new Date().toISOString().split('T')[0]!;

    const householdId = user.householdId;
    if (!householdId) {
      return reply.status(404).send({
        error: 'NOT_FOUND',
        message: 'No registered household profile associated with citizen account.'
      });
    }

    const hStmt = db.prepare(`
      SELECT h.id, h.route_id, h.service_uid, h.address_line, r.name as route_name, r.code as route_code
      FROM households h
      JOIN routes r ON h.route_id = r.id
      WHERE h.id = ?
    `);
    const household = hStmt.get(householdId) as {
      id: string;
      route_id: string;
      service_uid: string;
      address_line: string;
      route_name: string;
      route_code: string;
    } | undefined;

    if (!household) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Household record not found.' });
    }

    const assignStmt = db.prepare(`
      SELECT a.id as assignment_id, a.service_date, a.status as assignment_status,
             dsr.id as run_id, dsr.run_status, v.registration_number as vehicle_registration
      FROM daily_assignments a
      LEFT JOIN daily_service_runs dsr ON dsr.assignment_id = a.id
      LEFT JOIN vehicles v ON a.vehicle_id = v.id
      WHERE a.route_id = ? AND a.service_date = ?
      ORDER BY a.scheduled_start ASC LIMIT 1
    `);
    const assignment = assignStmt.get(household.route_id, serviceDate) as {
      assignment_id: string;
      service_date: string;
      assignment_status: string;
      run_id?: string | null;
      run_status?: string | null;
      vehicle_registration?: string | null;
    } | undefined;

    let synthesis: VerificationSynthesisResult;
    if (assignment?.run_id) {
      synthesis = verification.evaluateHouseholdStatus(assignment.run_id, householdId);
    } else {
      synthesis = {
        householdId,
        status: VerificationStatus.EXPECTED,
        evidenceCount: 0,
        hasPhysicalScan: false,
        hasProximityObservation: false,
        hasResidentComplaint: false,
        hasApprovedException: false,
        disclosureStatement: 'No collection run was scheduled or dispatched for this household on the selected date.'
      };
    }

    return reply.send({
      household_id: householdId,
      synthesis,
      household,
      route: { id: household.route_id, name: household.route_name },
      assignment: assignment || null,
      service_date: serviceDate,
      data_classification: DataClassification.SIMULATED_DEMO_DATA
    });
  });

  // PATCH /api/v1/operations/runs/:run_id/status (Defined Run Lifecycle Service)
  fastify.patch('/runs/:run_id/status', {
    preHandler: [authenticate, requireRoles(UserRole.DRIVER, UserRole.WORKER, UserRole.SUPERVISOR, UserRole.ADMIN)]
  }, async (request, reply) => {
    const { run_id } = request.params as { run_id: string };
    const updateSchema = z.object({
      target_status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
      status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
      cancellation_reason: z.string().optional()
    }).refine((data) => data.target_status !== undefined || data.status !== undefined, {
      message: 'Either target_status or status must be provided.'
    });
    const parseResult = updateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        message: 'Invalid run status update payload.',
        details: parseResult.error.format()
      });
    }

    const target_status = (parseResult.data.target_status || parseResult.data.status)!;
    const { cancellation_reason } = parseResult.data;
    const user = request.user!;

    const runStmt = db.prepare(`
      SELECT r.*, a.id as assignment_id, a.driver_id, ar.ward_id
      FROM daily_service_runs r
      JOIN daily_assignments a ON r.assignment_id = a.id
      JOIN routes ro ON a.route_id = ro.id
      JOIN areas ar ON ro.area_id = ar.id
      WHERE r.id = ?
    `);
    const run = runStmt.get(run_id) as {
      id: string;
      assignment_id: string;
      run_status: string;
      started_at?: string | null;
      completed_at?: string | null;
      driver_id: string;
      ward_id: string;
    } | undefined;

    if (!run) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Service run not found.' });
    }

    // Role scoping
    if (user.role === UserRole.WORKER || user.role === UserRole.DRIVER) {
      let workerId = user.workerId;
      if (!workerId) {
        const uRow = db.prepare(`SELECT worker_id FROM users WHERE id = ?`).get(user.userId) as { worker_id?: string | null } | undefined;
        workerId = uRow?.worker_id || user.userId;
      }
      const isDriver = run.driver_id === workerId || run.driver_id === user.userId;
      const workerCheck = db.prepare(`SELECT 1 FROM assignment_workers WHERE assignment_id = ? AND (worker_id = ? OR worker_id = ?)`).get(run.assignment_id, workerId, user.userId);
      if (!isDriver && !workerCheck) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access Denied: You are not assigned to this run.' });
      }
    } else if (user.role === UserRole.SUPERVISOR || user.role === UserRole.WARD_OFFICER) {
      if (!user.wardId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Supervisor or Ward Officer has no assigned ward.' });
      }
      if (run.ward_id !== user.wardId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access Denied: Run belongs to another ward.' });
      }
    }

    // Validate lifecycle transitions
    if (target_status === 'IN_PROGRESS' && run.run_status !== 'NOT_STARTED') {
      return reply.status(422).send({
        error: 'INVALID_TRANSITION',
        message: `Cannot transition run from ${run.run_status} to IN_PROGRESS. Must be NOT_STARTED.`
      });
    }
    if (target_status === 'COMPLETED' && run.run_status !== 'IN_PROGRESS') {
      return reply.status(422).send({
        error: 'INVALID_TRANSITION',
        message: `Cannot complete run from ${run.run_status} status. Shift must be actively IN_PROGRESS.`
      });
    }
    if (target_status === 'CANCELLED' && !cancellation_reason) {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        message: 'Cancellation reason is required when cancelling a service run.'
      });
    }

    const now = new Date().toISOString();
    let startedAt = run.started_at;
    let completedAt = run.completed_at;

    if (target_status === 'IN_PROGRESS') {
      // Evaluate ANOM-01 automatically before run moves from NOT_STARTED
      anomaly.evaluateAssignedVehicleInactivity(run.assignment_id);
      if (!startedAt) {
        startedAt = now;
      }
    }
    if (target_status === 'COMPLETED' || target_status === 'CANCELLED') {
      completedAt = now;
    }

    const updateStmt = db.prepare(`
      UPDATE daily_service_runs
      SET run_status = ?, actual_start_time = ?, actual_end_time = ?, updated_at = ?
      WHERE id = ?
    `);
    updateStmt.run(target_status, startedAt || null, completedAt || null, now, run_id);

    // Update assignment status as well
    const assignStatus = target_status === 'IN_PROGRESS' ? 'IN_PROGRESS' : target_status === 'COMPLETED' ? 'COMPLETED' : 'CANCELLED';
    db.prepare(`UPDATE daily_assignments SET status = ? WHERE id = ?`).run(assignStatus, run.assignment_id);

    // If completed: automatically evaluate ANOM-06 (Route abandonment)
    if (target_status === 'COMPLETED') {
      anomaly.evaluateRouteAbandonment(run_id);
    }

    // Log audit event
    audit.logEvent({
      actorId: user.userId,
      actorRole: user.role,
      actionType: 'UPDATE_SERVICE_RUN_STATUS',
      entityName: 'daily_service_runs',
      entityId: run_id,
      beforeState: { run_status: run.run_status, started_at: run.started_at, completed_at: run.completed_at },
      afterState: { run_status: target_status, started_at: startedAt, completed_at: completedAt, cancellation_reason },
      ipAddress: request.ip
    });

    return reply.send({
      success: true,
      run_id,
      run_status: target_status,
      started_at: startedAt,
      completed_at: completedAt,
      data_classification: DataClassification.SIMULATED_DEMO_DATA
    });
  });

  // POST /api/v1/operations/runs/:run_id/events (Submit doorstep scan or proximity evidence)
  fastify.post('/runs/:run_id/events', {
    preHandler: [authenticate, requireRoles(UserRole.DRIVER, UserRole.WORKER, UserRole.SUPERVISOR, UserRole.ADMIN)]
  }, async (request, reply) => {
    const { run_id } = request.params as { run_id: string };
    const user = request.user!;

    const parseResult = submitEventSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        message: 'Invalid evidence event payload.',
        details: parseResult.error.format()
      });
    }

    const data = parseResult.data;

    // 1. Verify run exists
    const runStmt = db.prepare(`
      SELECT r.*, a.id as assignment_id, a.route_id, a.driver_id, ar.ward_id
      FROM daily_service_runs r
      JOIN daily_assignments a ON r.assignment_id = a.id
      JOIN routes ro ON a.route_id = ro.id
      JOIN areas ar ON ro.area_id = ar.id
      WHERE r.id = ?
    `);
    const run = runStmt.get(run_id) as {
      id: string;
      assignment_id: string;
      route_id: string;
      driver_id: string;
      ward_id: string;
      run_status: string;
    } | undefined;

    if (!run) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Service run not found.' });
    }

    // 2. Evidence Acceptance Invariant: Field evidence not permitted when run is NOT_STARTED
    if (run.run_status === 'NOT_STARTED') {
      return reply.status(422).send({
        error: 'RUN_NOT_STARTED',
        message: 'Field evidence cannot be recorded before service run has started. Shift must be actively IN_PROGRESS.'
      });
    }

    // 3. Caller role & assignment verification
    if (user.role === UserRole.WORKER || user.role === UserRole.DRIVER) {
      let workerId = user.workerId;
      if (!workerId) {
        const uRow = db.prepare(`SELECT worker_id FROM users WHERE id = ?`).get(user.userId) as { worker_id?: string | null } | undefined;
        workerId = uRow?.worker_id || user.userId;
      }
      const isDriver = run.driver_id === workerId || run.driver_id === user.userId;
      const workerCheck = db.prepare(`SELECT 1 FROM assignment_workers WHERE assignment_id = ? AND (worker_id = ? OR worker_id = ?)`).get(run.assignment_id, workerId, user.userId);
      if (!isDriver && !workerCheck) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Access Denied: You are not assigned to this service run.'
        });
      }
    } else if (user.role === UserRole.SUPERVISOR || user.role === UserRole.WARD_OFFICER) {
      if (!user.wardId) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Supervisor or Ward Officer has no assigned ward.'
        });
      }
      if (run.ward_id !== user.wardId) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Access Denied: Service run belongs to another municipal ward.'
        });
      }
    }

    // 4. Verify household belongs to run's route
    const hhCheck = db.prepare(`SELECT id FROM households WHERE id = ? AND route_id = ?`).get(data.household_id, run.route_id);
    if (!hhCheck) {
      return reply.status(422).send({
        error: 'ROUTE_MISMATCH',
        message: `Household ${data.household_id} does not belong to the route assigned to this service run.`
      });
    }

    // 5. Verify captured_at is a valid timestamp and not in future
    const capturedTime = new Date(data.captured_at).getTime();
    if (isNaN(capturedTime) || capturedTime > Date.now() + 60000) {
      return reply.status(400).send({
        error: 'INVALID_TIMESTAMP',
        message: 'Evidence capture timestamp is invalid or set in the future.'
      });
    }

    // Record evidence with deterministic duplicate detection
    const evidenceResult = verification.recordEvidence({
      id: data.client_event_id,
      serviceRunId: run_id,
      householdId: data.household_id,
      evidenceType: data.evidence_type,
      capturedAt: data.captured_at,
      deviceId: data.device_id,
      actorId: user.userId,
      rawPayload: data.raw_payload
    });

    if (evidenceResult.isDuplicate) {
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

    // Log audit event for evidence recording
    audit.logEvent({
      actorId: user.userId,
      actorRole: user.role,
      actionType: 'RECORD_EVIDENCE',
      entityName: 'service_evidence',
      entityId: evidenceResult.id,
      afterState: {
        service_run_id: run_id,
        household_id: data.household_id,
        evidence_type: data.evidence_type,
        captured_at: data.captured_at,
        verification_status: synthesis.status
      },
      ipAddress: request.ip
    });

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
    const user = request.user!;

    // Resolve run details including route, assignment, and ward
    const runStmt = db.prepare(`
      SELECT r.id, r.assignment_id, r.run_status, a.route_id, a.driver_id, ar.ward_id
      FROM daily_service_runs r
      JOIN daily_assignments a ON r.assignment_id = a.id
      JOIN routes ro ON a.route_id = ro.id
      JOIN areas ar ON ro.area_id = ar.id
      WHERE r.id = ?
    `);
    const run = runStmt.get(run_id) as {
      id: string;
      assignment_id: string;
      run_status: string;
      route_id: string;
      driver_id: string;
      ward_id: string;
    } | undefined;

    if (!run) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Service run not found.' });
    }

    // Universal validation for EVERY role: Confirm requested household belongs to route assigned to run_id
    const hhCheck = db.prepare(`SELECT 1 FROM households WHERE id = ? AND route_id = ?`).get(household_id, run.route_id);
    if (!hhCheck) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Access Denied: Requested household does not belong to the route assigned to this service run.'
      });
    }

    if (user.role === UserRole.CITIZEN) {
      if (!user.householdId || user.householdId !== household_id) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Anti-IDOR: Citizens may only view their own household status.' });
      }
    } else if (user.role === UserRole.WORKER || user.role === UserRole.DRIVER) {
      let workerId = user.workerId;
      if (!workerId) {
        const uRow = db.prepare(`SELECT worker_id FROM users WHERE id = ?`).get(user.userId) as { worker_id?: string | null } | undefined;
        workerId = uRow?.worker_id || user.userId;
      }
      const isDriver = run.driver_id === workerId || run.driver_id === user.userId;
      const workerCheck = db.prepare(`SELECT 1 FROM assignment_workers WHERE assignment_id = ? AND (worker_id = ? OR worker_id = ?)`).get(run.assignment_id, workerId, user.userId);
      if (!isDriver && !workerCheck) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access Denied: You are not assigned to this service run.' });
      }
    } else if (user.role === UserRole.SUPERVISOR || user.role === UserRole.WARD_OFFICER) {
      if (!user.wardId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Supervisor or Ward Officer has no assigned ward.' });
      }
      if (run.ward_id !== user.wardId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access Denied: Service run belongs to another municipal ward.' });
      }
    } else if (user.role !== UserRole.AUTHORITY && user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Unauthorized role.' });
    }

    const synthesis = verification.evaluateHouseholdStatus(run_id, household_id);
    return reply.send({ synthesis, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // POST /api/v1/operations/runs/:run_id/manual-override (Supervisor/Admin only, writes audit event)
  fastify.post('/runs/:run_id/manual-override', {
    preHandler: [authenticate, requireRoles(UserRole.SUPERVISOR, UserRole.ADMIN)]
  }, async (request, reply) => {
    const { run_id } = request.params as { run_id: string };
    const user = request.user!;

    const parseResult = manualOverrideSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        message: 'Invalid manual override payload.',
        details: parseResult.error.format()
      });
    }

    const { household_id, target_status, override_reason } = parseResult.data;

    // Supervisor ward scoping
    if (user.role === UserRole.SUPERVISOR || user.role === UserRole.WARD_OFFICER) {
      if (!user.wardId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Supervisor or Ward Officer has no assigned ward.' });
      }
      const runWardStmt = db.prepare(`
        SELECT ar.ward_id
        FROM daily_service_runs r
        JOIN daily_assignments a ON r.assignment_id = a.id
        JOIN routes ro ON a.route_id = ro.id
        JOIN areas ar ON ro.area_id = ar.id
        WHERE r.id = ?
      `);
      const runWard = runWardStmt.get(run_id) as { ward_id: string } | undefined;
      if (runWard?.ward_id !== user.wardId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access Denied: Service run belongs to another ward.' });
      }
    }

    // Verification Override Guardrail: Do not allow manual override to create VERIFIED without qualifying evidence
    if (target_status === VerificationStatus.VERIFIED) {
      const qualifyingEvidenceStmt = db.prepare(`
        SELECT id FROM service_evidence
        WHERE service_run_id = ? AND household_id = ? AND evidence_type IN ('DOORSTEP_NFC_TAP', 'DOORSTEP_QR_SCAN')
      `);
      const qualifyingEvidence = qualifyingEvidenceStmt.get(run_id, household_id);
      if (!qualifyingEvidence) {
        return reply.status(422).send({
          error: 'OVERRIDE_GUARDRAIL_VIOLATION',
          message: 'Manual override cannot designate VERIFIED without qualifying doorstep evidence (NFC or QR physical scan).'
        });
      }
    }

    // Fetch before state
    const beforeStmt = db.prepare(`
      SELECT * FROM collection_records WHERE service_run_id = ? AND household_id = ?
    `);
    const before = beforeStmt.get(run_id, household_id) as Record<string, unknown> | undefined;

    // Update status
    verification.updateHouseholdRecord(run_id, household_id, target_status, override_reason);

    // Log immutable audit event
    audit.logEvent({
      actorId: user.userId,
      actorRole: user.role,
      actionType: 'MANUAL_VERIFICATION_OVERRIDE',
      entityName: 'collection_records',
      entityId: `${run_id}:${household_id}`,
      beforeState: before || null,
      afterState: { target_status, override_reason, reviewed_by: user.userId },
      ipAddress: request.ip
    });

    return reply.send({
      success: true,
      message: `Status successfully overridden to ${target_status}`,
      data_classification: DataClassification.SIMULATED_DEMO_DATA
    });
  });
};
