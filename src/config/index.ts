import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_DEV_JWT = 'super-secret-municipal-jwt-key-2026-strict-safety';
const DEFAULT_DEV_HMAC = 'municipal-gateway-hmac-sha256-secret-boundary';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3000),
  HOST: z.string().default('127.0.0.1'),
  DB_CLIENT: z.enum(['sqlite', 'postgres']).default('sqlite'),
  DATABASE_PATH: z.string().default('./data/municipal_waste.db'),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16).default(DEFAULT_DEV_JWT),
  WEBHOOK_HMAC_SECRET: z.string().min(16).default(DEFAULT_DEV_HMAC),
  CORS_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DB_POOL_MIN: z.coerce.number().int().min(1).default(2),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  RATE_LIMIT_ENABLED: z.coerce.boolean().default(true),
  HSTS_ENABLED: z.coerce.boolean().default(false)
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    if (data.JWT_SECRET === DEFAULT_DEV_JWT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: '[CONFIG_SECURITY_FATAL] Default development JWT_SECRET is forbidden in production environment.'
      });
    }
    if (data.WEBHOOK_HMAC_SECRET === DEFAULT_DEV_HMAC) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WEBHOOK_HMAC_SECRET'],
        message: '[CONFIG_SECURITY_FATAL] Default development WEBHOOK_HMAC_SECRET is forbidden in production environment.'
      });
    }
    if (data.DB_CLIENT === 'postgres' && !data.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: '[CONFIG_FATAL] DATABASE_URL is required when DB_CLIENT is set to postgres in production.'
      });
    }
  }
});

export function validateConfig(rawEnv: Record<string, unknown> = process.env) {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const errorDetails = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new Error(`[CONFIGURATION_VALIDATION_FAILURE] ${errorDetails}`);
  }
  return result.data;
}

export const config = validateConfig(process.env);
export type Config = z.infer<typeof envSchema>;

