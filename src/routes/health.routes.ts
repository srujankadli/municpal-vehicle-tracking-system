/**
 * Health & Readiness Probes
 * Phase 3 — Production Readiness & Persistence Hardening (Batch 3)
 *
 * Implements standard liveness (/healthz) and readiness (/readyz) probes.
 * Strictly separates process liveness from database readiness without
 * disclosing credentials, internal topology, or sensitive runtime details.
 */

import type { FastifyPluginAsync } from 'fastify';
import { getDatabaseAdapter } from '../db/connection.js';
import type { IDatabaseAdapter } from '../db/adapters/types.js';

export interface HealthRouteOptions {
  dbAdapter?: IDatabaseAdapter;
  checkDatabaseReady?: () => Promise<boolean>;
}

export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (app, opts) => {
  /**
   * Liveness Probe: GET /healthz
   * Determines whether the Node.js application process is alive and responsive.
   * Zero database dependencies. Public and unauthenticated.
   */
  app.get('/healthz', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });

  /**
   * Readiness Probe: GET /readyz
   * Determines whether the application is ready to accept and process traffic,
   * verifying persistence layer availability using minimal connectivity query.
   * Public and unauthenticated. Never leaks credentials or stack traces.
   */
  app.get('/readyz', async (_request, reply) => {
    const timestamp = new Date().toISOString();

    try {
      if (opts.checkDatabaseReady) {
        const isReady = await opts.checkDatabaseReady();
        if (!isReady) {
          return reply.status(503).send({
            status: 'unavailable',
            database: 'unavailable',
            timestamp
          });
        }
      } else {
        const adapter = opts.dbAdapter || getDatabaseAdapter();
        // Minimal lightweight connectivity query
        await adapter.query('SELECT 1 as alive;');
      }

      return reply.status(200).send({
        status: 'ready',
        database: 'available',
        timestamp
      });
    } catch {
      // Return generic 503 without leaking connection errors or internals
      return reply.status(503).send({
        status: 'unavailable',
        database: 'unavailable',
        timestamp
      });
    }
  });
};
