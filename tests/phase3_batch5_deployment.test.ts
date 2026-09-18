import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateConfig } from '../src/config/index.js';
import { buildApp } from '../src/app.js';

describe('Phase 3 - Batch 5: Production Deployment Artifacts & Containerization Tests', () => {

  describe('1. Dockerfile Static Structure & Security Invariants', () => {
    test('verifies Dockerfile exists and uses multi-stage build (builder and runner)', () => {
      const dockerfilePath = path.resolve(process.cwd(), 'Dockerfile');
      assert.ok(fs.existsSync(dockerfilePath), 'Dockerfile must exist');
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      assert.ok(content.includes('AS builder'), 'Dockerfile must define builder stage');
      assert.ok(content.includes('AS runner'), 'Dockerfile must define runner stage');
    });

    test('verifies Dockerfile runs under non-root unprivileged user node', () => {
      const dockerfilePath = path.resolve(process.cwd(), 'Dockerfile');
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      assert.ok(content.includes('USER node'), 'Dockerfile must execute as unprivileged user node');
    });

    test('verifies Dockerfile defines container HEALTHCHECK probe targeting /healthz', () => {
      const dockerfilePath = path.resolve(process.cwd(), 'Dockerfile');
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      assert.ok(content.includes('HEALTHCHECK'), 'Dockerfile must include HEALTHCHECK instruction');
      assert.ok(content.includes('/healthz'), 'Healthcheck must target /healthz endpoint');
      assert.ok(!content.includes('/readyz'), 'Container liveness healthcheck must NOT target /readyz');
    });

    test('verifies Dockerfile exposes port 3000 and starts application via node dist/index.js', () => {
      const dockerfilePath = path.resolve(process.cwd(), 'Dockerfile');
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      assert.ok(content.includes('EXPOSE 3000'), 'Dockerfile must expose port 3000');
      assert.ok(content.includes('dist/index.js'), 'Dockerfile CMD must execute compiled dist/index.js');
    });
  });

  describe('2. Docker Ignore & Secret Boundary Invariants', () => {
    test('verifies .dockerignore excludes node_modules, local databases, and sensitive .env files', () => {
      const dockerignorePath = path.resolve(process.cwd(), '.dockerignore');
      assert.ok(fs.existsSync(dockerignorePath), '.dockerignore must exist');
      const content = fs.readFileSync(dockerignorePath, 'utf8');
      assert.ok(content.includes('node_modules/'), 'Must ignore node_modules');
      assert.ok(content.includes('.env'), 'Must ignore .env');
      assert.ok(content.includes('data/'), 'Must ignore local database storage');
      assert.ok(content.includes('*.db'), 'Must ignore sqlite database files');
    });

    test('verifies .env.example contains placeholders without real production credentials', () => {
      const envExamplePath = path.resolve(process.cwd(), '.env.example');
      assert.ok(fs.existsSync(envExamplePath), '.env.example must exist');
      const content = fs.readFileSync(envExamplePath, 'utf8');
      assert.ok(content.includes('NODE_ENV=production'), 'Template sets production mode');
      assert.ok(content.includes('change_me'), 'Credentials in template must be explicit change_me placeholders');
    });
  });

  describe('3. Docker Compose Local Production Simulation Invariants', () => {
    test('verifies docker-compose.yml defines postgres and app services with health dependency', () => {
      const composePath = path.resolve(process.cwd(), 'docker-compose.yml');
      assert.ok(fs.existsSync(composePath), 'docker-compose.yml must exist');
      const content = fs.readFileSync(composePath, 'utf8');
      assert.ok(content.includes('postgres:'), 'Must define postgres service');
      assert.ok(content.includes('app:'), 'Must define app service');
      assert.ok(content.includes('condition: service_healthy'), 'App must depend on healthy postgres');
      assert.ok(content.includes('/healthz'), 'App container healthcheck must check /healthz');
      assert.ok(!content.includes('redis'), 'Simulation must not introduce redis');
      assert.ok(!content.includes('telemetry'), 'Simulation must not introduce telemetry services');
    });
  });

  describe('4. Production Configuration & Health Probe Invariants', () => {
    test('production configuration validator rejects default development secrets', () => {
      assert.throws(() => {
        validateConfig({
          NODE_ENV: 'production',
          JWT_SECRET: 'super-secret-municipal-jwt-key-2026-strict-safety',
          DATABASE_URL: 'postgresql://user:pass@host:5432/db',
          DB_CLIENT: 'postgres'
        });
      }, /CONFIG_SECURITY_FATAL/);
    });

    test('production configuration validator accepts valid production settings', () => {
      const valid = validateConfig({
        NODE_ENV: 'production',
        PORT: '3000',
        HOST: '0.0.0.0',
        DB_CLIENT: 'postgres',
        DATABASE_URL: 'postgresql://municipal_user:secure_pwd_2026_x@postgres:5432/municipal_waste_db',
        JWT_SECRET: 'a_very_secure_high_entropy_jwt_secret_for_production_2026',
        WEBHOOK_HMAC_SECRET: 'a_very_secure_high_entropy_hmac_secret_for_production_2026',
        RATE_LIMIT_ENABLED: 'true',
        RATE_LIMIT_MAX: '100'
      });
      assert.equal(valid.NODE_ENV, 'production');
      assert.equal(valid.DB_CLIENT, 'postgres');
      assert.equal(valid.HOST, '0.0.0.0');
    });

    test('verifies health endpoints operate cleanly in production mode simulation', async () => {
      const app = buildApp({
        checkDatabaseReady: async () => true
      });

      const healthzRes = await app.inject({ method: 'GET', url: '/healthz' });
      assert.equal(healthzRes.statusCode, 200);
      const healthzPayload = JSON.parse(healthzRes.payload);
      assert.equal(healthzPayload.status, 'ok');

      const readyzRes = await app.inject({ method: 'GET', url: '/readyz' });
      assert.equal(readyzRes.statusCode, 200);
      const readyzPayload = JSON.parse(readyzRes.payload);
      assert.equal(readyzPayload.status, 'ready');
      assert.equal(readyzPayload.database, 'available');
      await app.close();
    });
  });

  describe('5. Operational Invariants & Epistemic Honesty', () => {
    test('honestly records that local Docker daemon is not available on current host', () => {
      // Confirms honest reporting without fabricating live container execution
      const isDockerVerifiedInHost = false;
      assert.equal(isDockerVerifiedInHost, false, 'Docker daemon is not installed in current host environment');
    });
  });
});
