import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDatabase } from '../db/connection.js';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/domain.js';
import { MetricsService } from '../services/metrics.service.js';

export const metricsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const db = getDatabase();
  const metrics = new MetricsService(db);

  // GET /api/v1/metrics/route-completion/:run_id (Authority / Supervisor only)
  fastify.get('/route-completion/:run_id', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.SUPERVISOR, UserRole.WARD_OFFICER, UserRole.ADMIN)]
  }, async (request, reply) => {
    const { run_id } = request.params as { run_id: string };
    const user = request.user!;

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
      if (runWard && runWard.ward_id !== user.wardId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access Denied: Service run belongs to another ward.' });
      }
    }

    const result = metrics.calculateRouteCompletionRate(run_id);
    return reply.send(result);
  });

  // GET /api/v1/metrics/service-discrepancy/:run_id (Authority / Supervisor only)
  fastify.get('/service-discrepancy/:run_id', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.SUPERVISOR, UserRole.WARD_OFFICER, UserRole.ADMIN)]
  }, async (request, reply) => {
    const { run_id } = request.params as { run_id: string };
    const user = request.user!;

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
      if (runWard && runWard.ward_id !== user.wardId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access Denied: Service run belongs to another ward.' });
      }
    }

    const result = metrics.calculateServiceDiscrepancyRate(run_id);
    return reply.send(result);
  });

  // GET /api/v1/metrics/fleet-availability (Authority only)
  fastify.get('/fleet-availability', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.ADMIN)]
  }, async (request, reply) => {
    const query = request.query as { service_date?: string };
    const targetDate = query.service_date || new Date().toISOString().split('T')[0]!;
    const result = metrics.calculateFleetOperationalAvailability(targetDate);
    return reply.send(result);
  });

  // GET /api/v1/metrics/collection-reconciliation (Authority only)
  fastify.get('/collection-reconciliation', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.ADMIN)]
  }, async (request, reply) => {
    const query = request.query as { billing_period?: string };
    const targetPeriod = query.billing_period || '2026-09';
    const result = metrics.calculateCollectionReconciliationRatio(targetPeriod);
    return reply.send(result);
  });
};
