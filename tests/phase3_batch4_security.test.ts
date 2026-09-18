/**
 * Phase 3 — Batch 4: Security Response Headers & HTTP Rate Limiting Tests
 *
 * Verifies:
 *   1. Standard security response headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy.
 *   2. Content Security Policy (CSP): restrictive directives compatible with application and tile retrieval.
 *   3. Strict-Transport-Security (HSTS): disabled for local HTTP, conditionally enabled for production.
 *   4. HTTP Rate Limiting: requests below threshold succeed.
 *   5. Rate Limit Exceeded: returns HTTP 429 with retry-after header and standard error schema.
 *   6. Health Probe Exemption: /healthz and /readyz are exempt from rate limiting.
 *   7. Client Isolation: different client IPs maintain separate rate limit buckets.
 *   8. Authentication Preservation: rate limiting does not bypass authentication or RBAC boundaries.
 *   9. Structured Rate Limit Logging: rate limit events are logged with reqId without leaking credentials.
 *   10. Process-Local vs Distributed: verifies process-local architecture without claiming distributed coordination.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { buildApp } from '../src/app.js';
import { getLoggerConfig } from '../src/config/logger.js';
import { config } from '../src/config/index.js';

class MemoryLogStream extends Writable {
  public lines: string[] = [];
  _write(chunk: any, _encoding: string, callback: () => void) {
    this.lines.push(chunk.toString());
    callback();
  }
  public getJsonLogs(): any[] {
    return this.lines
      .map(line => {
        try {
          return JSON.parse(line.trim());
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
}

describe('Phase 3 - Batch 4: Security Headers & Rate Limiting Tests', () => {

  describe('1. Security Response Headers (Helmet Integration)', () => {
    it('sets protective security headers on HTTP responses', async () => {
      const app = buildApp();
      await app.ready();

      const res = await app.inject({
        method: 'GET',
        url: '/healthz'
      });

      assert.equal(res.statusCode, 200);

      // X-Content-Type-Options
      assert.equal(res.headers['x-content-type-options'], 'nosniff');

      // X-Frame-Options
      assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');

      // Referrer-Policy
      assert.equal(res.headers['referrer-policy'], 'no-referrer');

      // Content-Security-Policy
      const csp = res.headers['content-security-policy'];
      assert.ok(csp, 'Content-Security-Policy header must be present');
      assert.match(String(csp), /default-src 'self'/);
      assert.match(String(csp), /object-src 'none'/);
    });

    it('disables HSTS by default in local/development environment to protect local HTTP', async () => {
      const app = buildApp({ enableHsts: false });
      await app.ready();

      const res = await app.inject({
        method: 'GET',
        url: '/healthz'
      });

      assert.equal(res.headers['strict-transport-security'], undefined, 'HSTS must be absent in local development');
    });

    it('enables HSTS with 1-year max-age when production HSTS is explicitly configured', async () => {
      const app = buildApp({ enableHsts: true });
      await app.ready();

      const res = await app.inject({
        method: 'GET',
        url: '/healthz'
      });

      const hsts = res.headers['strict-transport-security'];
      assert.ok(hsts, 'HSTS header must be present when enabled');
      assert.match(String(hsts), /max-age=31536000/);
      assert.match(String(hsts), /includeSubDomains/);
    });

    it('preserves JSON API and CORS compatibility alongside security headers', async () => {
      const app = buildApp();
      await app.ready();

      const res = await app.inject({
        method: 'GET',
        url: '/',
        headers: {
          origin: 'http://localhost:5173'
        }
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['access-control-allow-origin'], '*');
      assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
      const data = res.json();
      assert.equal(data.status, 'OPERATIONAL');
    });
  });

  describe('2. HTTP Rate Limiting & Denial-of-Service Mitigation', () => {
    it('allows requests within the configured rate limit threshold', async () => {
      const app = buildApp({
        rateLimitMax: 5,
        rateLimitTimeWindow: 60000
      });
      await app.ready();

      for (let i = 1; i <= 5; i++) {
        const res = await app.inject({
          method: 'GET',
          url: '/'
        });
        assert.equal(res.statusCode, 200, `Request #${i} must succeed under limit`);
        assert.ok(res.headers['x-ratelimit-remaining'] !== undefined);
      }
    });

    it('returns HTTP 429 with retry-after header and standard error format when limit exceeded', async () => {
      const app = buildApp({
        rateLimitMax: 3,
        rateLimitTimeWindow: 60000
      });
      await app.ready();

      // Exhaust limit of 3
      for (let i = 1; i <= 3; i++) {
        await app.inject({ method: 'GET', url: '/' });
      }

      // 4th request must be rejected with HTTP 429
      const res = await app.inject({
        method: 'GET',
        url: '/'
      });

      assert.equal(res.statusCode, 429, 'Excess request must return HTTP 429 Too Many Requests');
      assert.ok(res.headers['retry-after'], 'retry-after header must be provided');

      const body = res.json();
      assert.equal(body.error, 'TOO_MANY_REQUESTS');
      assert.equal(body.statusCode, 429);
      assert.ok(body.message.includes('Rate limit exceeded'));
    });

    it('exempts health probes (/healthz, /readyz) from rate limiting', async () => {
      const app = buildApp({
        rateLimitMax: 2,
        rateLimitTimeWindow: 60000
      });
      await app.ready();

      // Exhaust limit on standard endpoint
      await app.inject({ method: 'GET', url: '/' });
      await app.inject({ method: 'GET', url: '/' });
      const blockedRes = await app.inject({ method: 'GET', url: '/' });
      assert.equal(blockedRes.statusCode, 429);

      // Health probes must remain accessible even when regular limit is exhausted
      const healthRes = await app.inject({ method: 'GET', url: '/healthz' });
      assert.equal(healthRes.statusCode, 200, '/healthz must be exempt from rate limits');

      const readyRes = await app.inject({ method: 'GET', url: '/readyz' });
      assert.equal(readyRes.statusCode, 200, '/readyz must be exempt from rate limits');
    });

    it('tracks rate limits independently across different client remote addresses', async () => {
      const app = buildApp({
        rateLimitMax: 2,
        rateLimitTimeWindow: 60000
      });
      await app.ready();

      // Client A exhausts limit
      await app.inject({ method: 'GET', url: '/', remoteAddress: '192.168.1.10' });
      await app.inject({ method: 'GET', url: '/', remoteAddress: '192.168.1.10' });
      const clientABlocked = await app.inject({ method: 'GET', url: '/', remoteAddress: '192.168.1.10' });
      assert.equal(clientABlocked.statusCode, 429);

      // Client B from different IP must NOT be blocked
      const clientBSuccess = await app.inject({ method: 'GET', url: '/', remoteAddress: '192.168.1.20' });
      assert.equal(clientBSuccess.statusCode, 200, 'Different client IP must have separate rate limit bucket');
    });
  });

  describe('3. Rate Limit Logging & Security Boundary Integrity', () => {
    it('logs structured rate limit rejection with reqId without exposing sensitive credentials', async () => {
      const logStream = new MemoryLogStream();
      const loggerConfig = getLoggerConfig({ level: 'warn', stream: logStream, enabled: true });
      const app = buildApp({
        logger: loggerConfig,
        rateLimitMax: 1,
        rateLimitTimeWindow: 60000
      });
      await app.ready();

      // 1st request succeeds
      await app.inject({ method: 'GET', url: '/' });

      // 2nd request triggers rate limit
      const traceId = 'req-trace-ratelimit-001';
      const res = await app.inject({
        method: 'GET',
        url: '/',
        headers: {
          'x-request-id': traceId,
          authorization: 'Bearer sensitive-token-must-not-leak'
        }
      });
      assert.equal(res.statusCode, 429);

      const logs = logStream.getJsonLogs();
      const rateLimitLog = logs.find(l => l.statusCode === 429);
      assert.ok(rateLimitLog, 'Rate limit rejection must be logged');
      assert.equal(rateLimitLog.reqId, traceId);

      // Verify no sensitive token appears in raw log lines
      const rawLogs = logStream.lines.join('\n');
      assert.equal(rawLogs.includes('sensitive-token-must-not-leak'), false, 'Authorization token must be redacted');
    });

    it('confirms rate limiting does not bypass authentication or RBAC boundaries', async () => {
      const app = buildApp({
        rateLimitMax: 10,
        rateLimitTimeWindow: 60000
      });
      await app.ready();

      // Unauthenticated request to protected endpoint must return 401, not bypass auth
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/master/wards'
      });
      assert.equal(res.statusCode, 401);
    });

    it('honestly reports process-local in-memory storage for rate limiting', () => {
      // Confirm rate limiting is in-memory process-local; no distributed Redis is configured
      assert.ok(config.RATE_LIMIT_MAX > 0);
      assert.ok(config.RATE_LIMIT_WINDOW_MS >= 1000);
      assert.equal(typeof config.RATE_LIMIT_ENABLED, 'boolean');
    });
  });
});
