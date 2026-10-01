import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDatabase } from '../db/connection.js';
import { authenticate, requireRoles, enforceHouseholdAccess } from '../middleware/auth.middleware.js';
import { UserRole, DataClassification } from '../types/domain.js';

export const masterRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const db = getDatabase();

  // GET /api/v1/master/wards
  fastify.get('/wards', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.SUPERVISOR, UserRole.WARD_OFFICER, UserRole.ADMIN)]
  }, async (request, reply) => {
    const user = request.user!;
    let sql = `SELECT * FROM wards`;
    const params: string[] = [];
    if (user.role === UserRole.SUPERVISOR || user.role === UserRole.WARD_OFFICER) {
      if (!user.wardId) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Supervisor or Ward Officer has no assigned ward.'
        });
      }
      sql += ` WHERE id = ?`;
      params.push(user.wardId);
    }
    sql += ` ORDER BY code ASC`;
    const stmt = db.prepare(sql);
    const wards = stmt.all(...params);
    return reply.send({ wards, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // GET /api/v1/master/routes
  fastify.get('/routes', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.user!;
    let sql = `SELECT * FROM routes`;
    const params: string[] = [];

    if (user.role === UserRole.CITIZEN) {
      // Citizen: restrict to their own household's route
      sql += ` WHERE id IN (SELECT route_id FROM households WHERE id = ?)`;
      params.push(user.householdId || '');
    } else if (user.role === UserRole.DRIVER || user.role === UserRole.WORKER) {
      // Worker/Driver: restrict to routes for their operational assignments
      let workerId = user.workerId;
      if (!workerId) {
        const uRow = db.prepare(`SELECT worker_id FROM users WHERE id = ?`).get(user.userId) as { worker_id?: string | null } | undefined;
        workerId = uRow?.worker_id || user.userId;
      }
      sql += ` WHERE id IN (
        SELECT route_id FROM daily_assignments WHERE driver_id = ? OR driver_id = ? OR id IN (
          SELECT assignment_id FROM assignment_workers WHERE worker_id = ? OR worker_id = ?
        )
        UNION
        SELECT route_id FROM master_assignments WHERE driver_id = ? OR driver_id = ?
      )`;
      params.push(workerId, user.userId, workerId, user.userId, workerId, user.userId);
    } else if (user.role === UserRole.SUPERVISOR || user.role === UserRole.WARD_OFFICER) {
      // Supervisor/Ward Officer: restrict to their assigned ward
      if (!user.wardId) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Supervisor or Ward Officer has no assigned ward.'
        });
      }
      sql += ` WHERE id IN (SELECT r.id FROM routes r JOIN areas ar ON r.area_id = ar.id WHERE ar.ward_id = ?)`;
      params.push(user.wardId);
    }
    // Authority / Admin: unrestricted

    sql += ` ORDER BY code ASC`;
    const stmt = db.prepare(sql);
    const routes = stmt.all(...params);
    return reply.send({ routes, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // GET /api/v1/master/vehicles
  fastify.get('/vehicles', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.SUPERVISOR, UserRole.WARD_OFFICER, UserRole.ADMIN)]
  }, async (_request, reply) => {
    const stmt = db.prepare(`SELECT * FROM vehicles ORDER BY registration_number ASC`);
    const vehicles = stmt.all();
    return reply.send({ vehicles, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // GET /api/v1/master/workers
  fastify.get('/workers', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.SUPERVISOR, UserRole.WARD_OFFICER, UserRole.ADMIN)]
  }, async (_request, reply) => {
    const stmt = db.prepare(`SELECT * FROM workers ORDER BY employee_code ASC`);
    const workers = stmt.all();
    return reply.send({ workers, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // GET /api/v1/master/households (Authority/Supervisor/Ward Officer)
  fastify.get('/households', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.SUPERVISOR, UserRole.WARD_OFFICER, UserRole.ADMIN)]
  }, async (request, reply) => {
    const user = request.user!;
    const query = request.query as { route_id?: string };
    let sql = `SELECT * FROM households WHERE is_active = 1`;
    const params: string[] = [];
    if (query.route_id) {
      sql += ` AND route_id = ?`;
      params.push(query.route_id);
    }
    if (user.role === UserRole.SUPERVISOR || user.role === UserRole.WARD_OFFICER) {
      if (!user.wardId) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Supervisor or Ward Officer has no assigned ward.'
        });
      }
      sql += ` AND route_id IN (SELECT r.id FROM routes r JOIN areas ar ON r.area_id = ar.id WHERE ar.ward_id = ?)`;
      params.push(user.wardId);
    }
    sql += ` ORDER BY service_uid ASC`;
    const stmt = db.prepare(sql);
    const households = stmt.all(...params);
    return reply.send({ households, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // GET /api/v1/master/households/:household_id (Protected with Anti-IDOR for citizens)
  fastify.get('/households/:household_id', {
    preHandler: [authenticate, enforceHouseholdAccess]
  }, async (request, reply) => {
    const { household_id } = request.params as { household_id: string };
    const stmt = db.prepare(`SELECT * FROM households WHERE id = ?`);
    const household = stmt.get(household_id);
    if (!household) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Household not found' });
    }
    return reply.send({ household, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });
};
