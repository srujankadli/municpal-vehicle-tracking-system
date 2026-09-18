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
    const result = metrics.calculateRouteCompletionRate(run_id);
    return reply.send(result);
  });

  // GET /api/v1/metrics/service-discrepancy/:run_id (Authority / Supervisor only)
  fastify.get('/service-discrepancy/:run_id', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.SUPERVISOR, UserRole.WARD_OFFICER, UserRole.ADMIN)]
  }, async (request, reply) => {
    const { run_id } = request.params as { run_id: string };
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
