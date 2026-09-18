import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDatabase } from '../db/connection.js';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { UserRole, DataClassification } from '../types/domain.js';
import { AnomalyService } from '../services/anomaly.service.js';

export const anomaliesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const db = getDatabase();
  const anomalyService = new AnomalyService(db);

  // GET /api/v1/anomalies (Authority / Supervisor only)
  fastify.get('/', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.SUPERVISOR, UserRole.WARD_OFFICER, UserRole.ADMIN)]
  }, async (request, reply) => {
    const query = request.query as { status?: string };
    let sql = `SELECT * FROM operational_anomalies WHERE 1=1`;
    const params: string[] = [];
    if (query.status) {
      sql += ` AND status = ?`;
      params.push(query.status);
    }
    sql += ` ORDER BY detected_at DESC`;
    const stmt = db.prepare(sql);
    const anomalies = stmt.all(...params);
    return reply.send({ anomalies, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });

  // POST /api/v1/anomalies/evaluate-inactivity/:assignment_id (Trigger ANOM-01 check)
  fastify.post('/evaluate-inactivity/:assignment_id', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.SUPERVISOR, UserRole.ADMIN)]
  }, async (request, reply) => {
    const { assignment_id } = request.params as { assignment_id: string };
    const body = request.body as { current_time?: string } | undefined;
    const result = anomalyService.evaluateAssignedVehicleInactivity(assignment_id, body?.current_time);
    return reply.send({
      anomaly_triggered: Boolean(result),
      anomaly: result || null,
      data_classification: DataClassification.SIMULATED_DEMO_DATA
    });
  });

  // POST /api/v1/anomalies/evaluate-abandonment/:run_id (Trigger ANOM-06 check)
  fastify.post('/evaluate-abandonment/:run_id', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.ADMIN)]
  }, async (request, reply) => {
    const { run_id } = request.params as { run_id: string };
    const result = anomalyService.evaluateRouteAbandonment(run_id);
    return reply.send({
      anomaly_triggered: Boolean(result),
      anomaly: result || null,
      data_classification: DataClassification.SIMULATED_DEMO_DATA
    });
  });
};
