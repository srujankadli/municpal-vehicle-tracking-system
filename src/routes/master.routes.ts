import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDatabase } from '../db/connection.js';
import { authenticate, requireRoles, enforceHouseholdAccess } from '../middleware/auth.middleware.js';
import { UserRole, DataClassification } from '../types/domain.js';

export const masterRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const db = getDatabase();

  // GET /api/v1/master/wards
  fastify.get('/wards', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.SUPERVISOR, UserRole.WARD_OFFICER, UserRole.ADMIN)]
  }, async (_request, reply) => {
    const stmt = db.prepare(`SELECT * FROM wards ORDER BY code ASC`);
    const wards = stmt.all();
    return reply.send({ wards, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // GET /api/v1/master/routes
  fastify.get('/routes', {
    preHandler: [authenticate]
  }, async (_request, reply) => {
    // Workers & Drivers can see routes for operational guidance
    const stmt = db.prepare(`SELECT * FROM routes ORDER BY code ASC`);
    const routes = stmt.all();
    return reply.send({ routes, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // GET /api/v1/master/vehicles
  fastify.get('/vehicles', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.SUPERVISOR, UserRole.ADMIN)]
  }, async (_request, reply) => {
    const stmt = db.prepare(`SELECT * FROM vehicles ORDER BY registration_number ASC`);
    const vehicles = stmt.all();
    return reply.send({ vehicles, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // GET /api/v1/master/workers
  fastify.get('/workers', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.SUPERVISOR, UserRole.ADMIN)]
  }, async (_request, reply) => {
    const stmt = db.prepare(`SELECT * FROM workers ORDER BY employee_code ASC`);
    const workers = stmt.all();
    return reply.send({ workers, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // GET /api/v1/master/households (Authority/Supervisor)
  fastify.get('/households', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.SUPERVISOR, UserRole.WARD_OFFICER, UserRole.ADMIN)]
  }, async (request, reply) => {
    const query = request.query as { route_id?: string };
    let sql = `SELECT * FROM households WHERE is_active = 1`;
    const params: string[] = [];
    if (query.route_id) {
      sql += ` AND route_id = ?`;
      params.push(query.route_id);
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
