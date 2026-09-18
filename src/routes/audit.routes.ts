import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDatabase } from '../db/connection.js';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { UserRole, DataClassification } from '../types/domain.js';
import { AuditService } from '../services/audit.service.js';

export const auditRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const db = getDatabase();
  const auditService = new AuditService(db);

  // GET /api/v1/audit/events (Strictly Authority and Admin only)
  fastify.get('/events', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.ADMIN)]
  }, async (request, reply) => {
    const query = request.query as { entity_name?: string; entity_id?: string; actor_id?: string; limit?: string };
    const events = auditService.getEvents({
      entityName: query.entity_name,
      entityId: query.entity_id,
      actorId: query.actor_id,
      limit: query.limit ? parseInt(query.limit, 10) : 50
    });
    return reply.send({ events, data_classification: DataClassification.SIMULATED_DEMO_DATA });
  });
};
