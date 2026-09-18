/**
 * Structured Logging & Sensitive Data Redaction Configuration
 * Phase 3 — Production Readiness & Persistence Hardening (Batch 3)
 *
 * Configures Fastify/Pino structured JSON logging, correlation tracking,
 * and strict redaction of credentials, tokens, and resident data.
 */

import type { FastifyLoggerOptions } from 'fastify';
import { config } from './index.js';

export const SENSITIVE_REDACTION_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-webhook-signature"]',
  'headers.authorization',
  'headers.cookie',
  'password',
  'password_hash',
  'phone',
  'phone_masked',
  'jwt',
  'token',
  'secret',
  'secret_key',
  'connectionString',
  'raw_payload',
  '*.password',
  '*.password_hash',
  '*.phone',
  '*.phone_masked',
  '*.token',
  '*.secret'
] as const;

export interface LoggerConfigOptions {
  level?: 'debug' | 'info' | 'warn' | 'error';
  stream?: any;
  enabled?: boolean;
}

/**
 * Builds Fastify/Pino logger configuration with structured serializers,
 * correlation ID preservation, and sensitive data masking.
 */
export function getLoggerConfig(options?: LoggerConfigOptions): FastifyLoggerOptions | boolean {
  // If explicitly disabled, return false
  if (options?.enabled === false) {
    return false;
  }

  // If in test execution and no custom stream or level provided, keep test output quiet
  const isTestExecution = config.NODE_ENV === 'test' ||
                          process.env.NODE_ENV === 'test' ||
                          Boolean(process.env.NODE_TEST_CONTEXT) ||
                          Boolean(process.env.npm_lifecycle_event?.includes('test')) ||
                          process.execArgv.some(arg => arg.includes('test')) ||
                          process.argv.some(arg => arg.includes('test'));

  if (isTestExecution && !options?.level && !options?.stream && options?.enabled !== true) {
    return false;
  }

  const level = options?.level || config.LOG_LEVEL;

  const loggerOpts: any = {
    level,
    serializers: {
      req(req: any) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          path: req.routerPath || req.url,
          hostname: req.hostname,
          remoteAddress: req.ip
        };
      },
      res(res: any) {
        return {
          statusCode: res.statusCode
        };
      }
    },
    redact: {
      paths: [...SENSITIVE_REDACTION_PATHS],
      censor: '[REDACTED]'
    }
  };

  if (options?.stream) {
    (loggerOpts as any).stream = options.stream;
  }

  return loggerOpts;
}
