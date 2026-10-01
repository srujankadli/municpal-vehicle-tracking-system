import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import crypto from 'node:crypto';
import { authRoutes } from './routes/auth.routes.js';
import { masterRoutes } from './routes/master.routes.js';
import { operationsRoutes } from './routes/operations.routes.js';
import { complaintsRoutes } from './routes/complaints.routes.js';
import { paymentRoutes } from './routes/payment.routes.js';
import { metricsRoutes } from './routes/metrics.routes.js';
import { anomaliesRoutes } from './routes/anomalies.routes.js';
import { auditRoutes } from './routes/audit.routes.js';
import { exportRoutes } from './routes/export.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { DataClassification } from './types/domain.js';
import { getLoggerConfig } from './config/logger.js';
import { config } from './config/index.js';
import type { IDatabaseAdapter } from './db/adapters/types.js';
import { getDatabase } from './db/connection.js';
import { AnomalyService } from './services/anomaly.service.js';

export interface BuildAppOptions {
  logger?: any;
  dbAdapter?: IDatabaseAdapter;
  checkDatabaseReady?: () => Promise<boolean>;
  rateLimitMax?: number;
  rateLimitTimeWindow?: number | string;
  enableRateLimit?: boolean;
  enableHsts?: boolean;
}

export function buildApp(options?: BuildAppOptions): FastifyInstance {
  const loggerConfig = options?.logger !== undefined ? options.logger : getLoggerConfig();

  const app = Fastify({
    logger: loggerConfig,
    requestIdHeader: false,
    genReqId(req) {
      const incoming = req.headers['x-request-id'];
      if (typeof incoming === 'string') {
        const trimmed = incoming.trim();
        if (trimmed.length >= 1 && trimmed.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(trimmed)) {
          return trimmed;
        }
      }
      return crypto.randomUUID();
    }
  });

  // Attach correlation ID to response headers
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // 1. Security Response Headers (Helmet)
  const isProd = config.NODE_ENV === 'production';
  const enableHsts = options?.enableHsts !== undefined ? options.enableHsts : (config.HSTS_ENABLED || isProd);

  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://*.tile.openstreetmap.org'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: isProd ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: enableHsts ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    } : false
  });

  // 2. CORS registration
  app.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? '*' : config.CORS_ORIGIN.split(',').map(s => s.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });

  // 3. HTTP Rate Limiting
  const rateLimitEnabled = options?.enableRateLimit !== undefined ? options.enableRateLimit : config.RATE_LIMIT_ENABLED;

  if (rateLimitEnabled) {
    app.register(rateLimit, {
      max: options?.rateLimitMax ?? config.RATE_LIMIT_MAX,
      timeWindow: options?.rateLimitTimeWindow ?? config.RATE_LIMIT_WINDOW_MS,
      allowList: (req) => {
        // Deliberate architecture decision: Health & readiness probes are exempt
        // from rate limiting to prevent false-positive service outages during automated health polling.
        const path = req.url.split('?')[0];
        return path === '/healthz' || path === '/readyz';
      },
      errorResponseBuilder: (_req, context) => {
        return {
          error: 'TOO_MANY_REQUESTS',
          message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
          statusCode: 429
        };
      }
    });
  }

  // Structured logging for rate limit rejections
  app.addHook('onResponse', async (request, reply) => {
    if (reply.statusCode === 429 && request.log) {
      request.log.warn({
        reqId: request.id,
        method: request.method,
        url: request.url,
        statusCode: 429
      }, 'Rate limit threshold exceeded for request');
    }
  });

  // Root health and environment disclaimer (registered as plugin so rate-limiting and hooks apply)
  app.register(async (rootApp) => {
    rootApp.get('/', async () => {
      return {
        system: 'Municipal Solid Waste Collection Monitoring, Verification & Audit Engine',
        version: '1.0.0-phase1',
        status: 'OPERATIONAL',
        data_classification: DataClassification.SIMULATED_DEMO_DATA,
        disclaimer: 'SYNTHETIC DATA FOR DEMONSTRATION AND TESTING ONLY. NOT REAL MUNICIPAL RECORDS.',
        timestamp: new Date().toISOString()
      };
    });
  });

  // Observability & Health Probes (/healthz, /readyz)
  app.register(healthRoutes, {
    dbAdapter: options?.dbAdapter,
    checkDatabaseReady: options?.checkDatabaseReady
  });

  // API v1 Routes
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(masterRoutes, { prefix: '/api/v1/master' });
  app.register(operationsRoutes, { prefix: '/api/v1/operations' });
  app.register(complaintsRoutes, { prefix: '/api/v1/complaints' });
  app.register(paymentRoutes, { prefix: '/api/v1/finance' });
  app.register(metricsRoutes, { prefix: '/api/v1/metrics' });
  app.register(anomaliesRoutes, { prefix: '/api/v1/anomalies' });
  app.register(auditRoutes, { prefix: '/api/v1/audit' });
  app.register(exportRoutes, { prefix: '/api/v1/audit/export' });

  // Automatic ANOM-01 Inactivity Watcher:
  // Deterministic background evaluator for ANOM-01 that runs independently of dashboard views or manual endpoints.
  const db = getDatabase();
  const anomalyService = new AnomalyService(db);
  const anomalySweepTimer = setInterval(() => {
    try {
      anomalyService.evaluateAllOverdueVehicleInactivity();
    } catch (err) {
      app.log.error(err, 'Automatic ANOM-01 background sweep encountered an error');
    }
  }, 60_000);

  if (anomalySweepTimer.unref) {
    anomalySweepTimer.unref();
  }

  app.addHook('onClose', async () => {
    clearInterval(anomalySweepTimer);
  });

  app.decorate('anomalyService', anomalyService);
  app.decorate('runAutomaticAnomalySweep', (currentIsoTime?: string) => {
    return anomalyService.evaluateAllOverdueVehicleInactivity(currentIsoTime);
  });

  // Consistent Error Handler with structured operational logging
  app.setErrorHandler((error: any, request, reply) => {
    const statusCode = error?.statusCode || 500;

    if (request.log) {
      if (statusCode >= 500) {
        request.log.error({
          reqId: request.id,
          err: {
            type: error?.name || 'Error',
            message: error?.message,
            statusCode
          }
        }, 'Unhandled application error encountered');
      } else if (statusCode === 429) {
        request.log.warn({
          reqId: request.id,
          method: request.method,
          url: request.url,
          statusCode: 429
        }, 'Rate limit threshold exceeded for request');
      }
    }

    const errorName = error?.error || error?.name || (statusCode === 429 ? 'TOO_MANY_REQUESTS' : 'INTERNAL_SERVER_ERROR');
    const errorMessage = error?.message || 'An unexpected error occurred.';

    reply.status(statusCode).send({
      error: errorName,
      message: errorMessage,
      statusCode
    });
  });

  return app;
}
