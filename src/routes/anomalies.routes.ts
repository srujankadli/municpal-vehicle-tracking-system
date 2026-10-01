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
    const user = request.user!;

    // Automatically evaluate assigned vehicle inactivity for pending scheduled assignments
    anomalyService.evaluateAllOverdueVehicleInactivity();

    const query = request.query as { status?: string };
    let sql = `SELECT * FROM operational_anomalies WHERE 1=1`;
    const params: string[] = [];
    if (query.status) {
      sql += ` AND status = ?`;
      params.push(query.status);
    }

    if (user.role === UserRole.SUPERVISOR || user.role === UserRole.WARD_OFFICER) {
      if (!user.wardId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Supervisor or Ward Officer has no assigned ward.' });
      }
      // Strictly prevent cross-ward anomaly leakage:
      // Global anomalies with no reliable ward ownership (financial anomalies ANOM-04/05, cross-route conflicts ANOM-07)
      // are visible ONLY to AUTHORITY and ADMIN.
      // An anomaly is visible to Supervisor/Ward Officer ONLY if:
      // 1) It has a service_run_id tied to a route within their assigned ward, OR
      // 2) service_run_id is NULL, but its trigger_evidence records an assignment_id whose route belongs to their assigned ward (e.g. pre-start ANOM-01).
      sql += ` AND (
        service_run_id IN (
          SELECT dsr.id FROM daily_service_runs dsr
          JOIN daily_assignments da ON dsr.assignment_id = da.id
          JOIN routes ro ON da.route_id = ro.id
          JOIN areas ar ON ro.area_id = ar.id
          WHERE ar.ward_id = ?
        )
        OR (
          service_run_id IS NULL AND json_extract(trigger_evidence, '$.assignment_id') IN (
            SELECT da.id FROM daily_assignments da
            JOIN routes ro ON da.route_id = ro.id
            JOIN areas ar ON ro.area_id = ar.id
            WHERE ar.ward_id = ?
          )
        )
      )`;
      params.push(user.wardId, user.wardId);
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
    const user = request.user!;

    if (user.role === UserRole.SUPERVISOR || user.role === UserRole.WARD_OFFICER) {
      if (!user.wardId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Supervisor or Ward Officer has no assigned ward.' });
      }
      const aWard = db.prepare(`
        SELECT ar.ward_id FROM daily_assignments a
        JOIN routes ro ON a.route_id = ro.id
        JOIN areas ar ON ro.area_id = ar.id
        WHERE a.id = ?
      `).get(assignment_id) as { ward_id: string } | undefined;
      if (aWard && aWard.ward_id !== user.wardId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access Denied: Assignment belongs to another ward.' });
      }
    }

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
