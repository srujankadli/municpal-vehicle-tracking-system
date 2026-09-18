import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/domain.js';
import { ExportService, type ExportDataset, type ExportFormat } from '../services/export.service.js';

const datasetSchema = z.enum([
  'audit-events',
  'operational-verification',
  'anomalies',
  'payments-reconciliation',
  'configuration-summary'
]);

const exportQuerySchema = z.object({
  format: z.enum(['ndjson', 'csv']).default('ndjson'),
  entity_name: z.string().optional(),
  actor_id: z.string().optional(),
  action_type: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  service_run_id: z.string().optional(),
  verification_status: z.string().optional(),
  household_id: z.string().optional(),
  anomaly_id: z.string().optional(),
  severity: z.string().optional(),
  status: z.string().optional(),
  reconciliation_status: z.string().optional(),
  billing_period: z.string().optional()
});

export const exportRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const db = getDatabase();
  const exportService = new ExportService(db);

  // GET /api/v1/audit/export/:dataset
  // Privileged endpoint restricted strictly to AUTHORITY and ADMIN roles.
  fastify.get('/:dataset', {
    preHandler: [authenticate, requireRoles(UserRole.AUTHORITY, UserRole.ADMIN)]
  }, async (request, reply) => {
    const paramsParsed = datasetSchema.safeParse((request.params as any).dataset);
    if (!paramsParsed.success) {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        message: `Invalid export dataset. Supported datasets: ${datasetSchema.options.join(', ')}`,
        statusCode: 400
      });
    }

    const queryParsed = exportQuerySchema.safeParse(request.query);
    if (!queryParsed.success) {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        message: 'Invalid query parameters for export.',
        details: queryParsed.error.format(),
        statusCode: 400
      });
    }

    const dataset: ExportDataset = paramsParsed.data;
    const { format, ...filters } = queryParsed.data;

    const actorId = request.user?.userId || 'unknown-actor';
    const actorRole = request.user?.role || UserRole.AUTHORITY;
    const ipAddress = request.ip || '127.0.0.1';

    try {
      const result = exportService.exportDataset(
        dataset,
        format as ExportFormat,
        filters,
        actorId,
        actorRole,
        ipAddress
      );

      reply.header('Content-Type', result.contentType);
      reply.header('Content-Disposition', `attachment; filename="${result.fileName}"`);
      reply.header('X-Export-Type', result.dataset);
      reply.header('X-Export-Format', result.format);
      reply.header('X-Export-Record-Count', String(result.recordCount));
      reply.header('X-Export-Ordering-Rule', result.orderingRule);
      reply.header('X-Export-Provenance', result.provenanceClassification);

      return reply.send(result.content);
    } catch (err: any) {
      request.log?.error(err, `Failed to execute export for dataset ${dataset}`);
      return reply.status(500).send({
        error: 'INTERNAL_SERVER_ERROR',
        message: err.message || 'Export generation failed.',
        statusCode: 500
      });
    }
  });
};
