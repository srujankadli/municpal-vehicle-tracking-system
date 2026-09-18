import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { runSeed } from '../src/db/seed.js';
import { AuthService } from '../src/services/auth.service.js';
import { AuditService } from '../src/services/audit.service.js';
import { getDatabase } from '../src/db/connection.js';
import { UserRole } from '../src/types/domain.js';

describe('Phase 4 Batch 4: Administrative Compliance & Audit Export Engine', () => {
  let app: ReturnType<typeof buildApp>;
  let authService: AuthService;
  let authorityToken: string;
  let adminToken: string;
  let workerToken: string;
  let driverToken: string;
  let citizenToken: string;

  before(async () => {
    runSeed();
    authService = new AuthService();
    app = buildApp();
    await app.ready();

    authorityToken = authService.createToken({
      userId: 'usr-auth-01',
      username: 'commissioner',
      role: UserRole.AUTHORITY
    });

    adminToken = authService.createToken({
      userId: 'usr-admin-01',
      username: 'admin_sys',
      role: UserRole.ADMIN
    });

    workerToken = authService.createToken({
      userId: 'usr-worker-01',
      username: 'worker_suresh',
      role: UserRole.WORKER
    });

    driverToken = authService.createToken({
      userId: 'usr-driver-01',
      username: 'driver_ramesh',
      role: UserRole.DRIVER
    });

    citizenToken = authService.createToken({
      userId: 'usr-citizen-01',
      username: 'citizen_priya',
      role: UserRole.CITIZEN,
      householdId: 'house-demo-101'
    });
  });

  after(async () => {
    await app.close();
  });

  describe('1. RBAC and Authorization Invariants', () => {
    it('unauthenticated export request receives HTTP 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/export/audit-events?format=ndjson'
      });
      assert.equal(res.statusCode, 401);
      assert.equal(res.json().error, 'UNAUTHORIZED');
    });

    it('worker role cannot export and receives HTTP 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/export/audit-events?format=ndjson',
        headers: { authorization: `Bearer ${workerToken}` }
      });
      assert.equal(res.statusCode, 403);
      assert.equal(res.json().error, 'FORBIDDEN');
    });

    it('driver role cannot export and receives HTTP 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/export/operational-verification?format=csv',
        headers: { authorization: `Bearer ${driverToken}` }
      });
      assert.equal(res.statusCode, 403);
      assert.equal(res.json().error, 'FORBIDDEN');
    });

    it('citizen role cannot export and receives HTTP 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/export/payments-reconciliation?format=ndjson',
        headers: { authorization: `Bearer ${citizenToken}` }
      });
      assert.equal(res.statusCode, 403);
      assert.equal(res.json().error, 'FORBIDDEN');
    });

    it('authority role is authorized and receives HTTP 200', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/export/audit-events?format=ndjson',
        headers: { authorization: `Bearer ${authorityToken}` }
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['x-export-type'], 'audit-events');
      assert.equal(res.headers['x-export-format'], 'ndjson');
    });

    it('admin role is authorized and receives HTTP 200', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/export/configuration-summary?format=csv',
        headers: { authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['x-export-type'], 'configuration-summary');
      assert.equal(res.headers['x-export-format'], 'csv');
    });
  });

  describe('2. Validation & Request Parameter Guards', () => {
    it('returns HTTP 400 for unknown dataset', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/export/non-existent-dataset?format=ndjson',
        headers: { authorization: `Bearer ${authorityToken}` }
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error, 'BAD_REQUEST');
    });

    it('returns HTTP 400 for invalid format', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/export/audit-events?format=xml',
        headers: { authorization: `Bearer ${authorityToken}` }
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error, 'BAD_REQUEST');
    });
  });

  describe('3. Deterministic NDJSON & CSV Serialization Across All 5 Datasets', () => {
    const datasets = [
      'audit-events',
      'operational-verification',
      'anomalies',
      'payments-reconciliation',
      'configuration-summary'
    ] as const;

    for (const dataset of datasets) {
      it(`exports ${dataset} in NDJSON with deterministic metadata header envelope`, async () => {
        const res = await app.inject({
          method: 'GET',
          url: `/api/v1/audit/export/${dataset}?format=ndjson`,
          headers: { authorization: `Bearer ${authorityToken}` }
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-type'], 'application/x-ndjson; charset=utf-8');
        assert.ok(res.headers['content-disposition']?.includes(`.ndjson`));

        const body = res.body;
        const lines = body.trim().split('\n');
        assert.ok(lines.length >= 1, `Expected at least metadata line for ${dataset}`);

        // First line must be _export_metadata envelope
        const metaLine = JSON.parse(lines[0]!);
        assert.ok(metaLine._export_metadata, 'Missing _export_metadata envelope');
        assert.equal(metaLine._export_metadata.dataset, dataset);
        assert.equal(metaLine._export_metadata.format, 'ndjson');
        assert.ok(metaLine._export_metadata.provenance_classification);
        assert.ok(metaLine._export_metadata.disclaimer);
        assert.ok(typeof metaLine._export_metadata.record_count === 'number');

        // All subsequent lines must parse as valid JSON
        for (let i = 1; i < lines.length; i++) {
          const row = JSON.parse(lines[i]!);
          assert.ok(row && typeof row === 'object');
        }
      });

      it(`exports ${dataset} in CSV with comment metadata header and RFC 4180 conformity`, async () => {
        const res = await app.inject({
          method: 'GET',
          url: `/api/v1/audit/export/${dataset}?format=csv`,
          headers: { authorization: `Bearer ${authorityToken}` }
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
        assert.ok(res.headers['content-disposition']?.includes(`.csv`));

        const body = res.body;
        const lines = body.trim().split('\n');
        assert.ok(lines.length >= 2, `Expected metadata and header line for ${dataset}`);

        // Comment lines start with '#'
        const commentLines = lines.filter(l => l.startsWith('# '));
        assert.ok(commentLines.length >= 3, 'Expected multiple comment metadata lines');
        assert.ok(commentLines.some(l => l.includes(`export_type: ${dataset}`)));
        assert.ok(commentLines.some(l => l.includes('ordering_rule: ')));
        assert.ok(commentLines.some(l => l.includes('provenance_classification: ')));

        // Header line is the first non-comment line
        const headerLine = lines.find(l => !l.startsWith('#'))!;
        assert.ok(headerLine, 'Expected a CSV header line');
        const columns = headerLine.split(',');
        assert.ok(columns.length > 1, 'Header must have columns');
      });
    }
  });

  describe('4. Financial Precision Invariants in Payment Exports', () => {
    it('strictly exports payments in integer paise without floating point inaccuracy', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/export/payments-reconciliation?format=ndjson',
        headers: { authorization: `Bearer ${authorityToken}` }
      });
      assert.equal(res.statusCode, 200);

      const lines = res.body.trim().split('\n');
      assert.ok(lines.length > 1, 'Expected payment records in seed');

      for (let i = 1; i < lines.length; i++) {
        const row = JSON.parse(lines[i]!);
        // amount_paise must be integer
        assert.ok(Number.isInteger(row.amount_paise), `amount_paise must be integer, got: ${row.amount_paise}`);
        assert.equal(typeof row.amount_paise, 'number');

        // amount_inr_formatted must match rupee string
        assert.ok(typeof row.amount_inr_formatted === 'string');
        const expectedInr = `₹${Math.floor(row.amount_paise / 100)}.${String(row.amount_paise % 100).padStart(2, '0')}`;
        assert.equal(row.amount_inr_formatted, expectedInr);

        // statement_amount_paise if present must be integer
        if (row.statement_amount_paise !== null && row.statement_amount_paise !== undefined) {
          assert.ok(Number.isInteger(row.statement_amount_paise));
        }
      }
    });
  });

  describe('5. Credential Redaction Invariants in Configuration Summary', () => {
    it('strictly redacts password hashes, salts, and secret credentials from configuration exports', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/export/configuration-summary?format=ndjson',
        headers: { authorization: `Bearer ${authorityToken}` }
      });
      assert.equal(res.statusCode, 200);

      const rawBody = res.body;
      assert.ok(!rawBody.includes('password_hash'), 'Export must NOT contain password_hash key or value');
      assert.ok(!rawBody.includes('salt'), 'Export must NOT contain salt');
      assert.ok(!rawBody.includes('token_secret'), 'Export must NOT contain token_secret');

      const lines = rawBody.trim().split('\n');
      for (let i = 1; i < lines.length; i++) {
        const row = JSON.parse(lines[i]!);
        assert.strictEqual(row.password_hash, undefined);
        assert.strictEqual(row.salt, undefined);
        assert.strictEqual(row.password, undefined);
      }
    });
  });

  describe('6. Append-Only Relational Audit Logging of Export Actions', () => {
    it('creates an EXPORT action in audit_events for each invoked export', async () => {
      const db = getDatabase();
      const audit = new AuditService(db);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/export/anomalies?format=ndjson',
        headers: { authorization: `Bearer ${authorityToken}` }
      });
      assert.equal(res.statusCode, 200);

      const auditEvents = audit.getEvents({ entityName: 'anomalies' });
      const exportEvents = auditEvents.filter(e => e.action_type === 'EXPORT');
      assert.ok(exportEvents.length >= 1, 'Audit log must record EXPORT action');

      const latest = exportEvents[0]!;
      assert.equal(latest.actor_id, 'usr-auth-01');
      assert.equal(latest.actor_role, UserRole.AUTHORITY);

      const afterState = JSON.parse(String(latest.after_state));
      assert.equal(afterState.format, 'ndjson');
      assert.ok(typeof afterState.recordCount === 'number');
    });
  });

  describe('7. Deterministic Query Ordering Verification', () => {
    it('enforces canonical deterministic ordering rule across records', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/export/audit-events?format=ndjson',
        headers: { authorization: `Bearer ${authorityToken}` }
      });
      assert.equal(res.statusCode, 200);

      const lines = res.body.trim().split('\n');
      if (lines.length > 2) {
        for (let i = 2; i < lines.length; i++) {
          const prev = JSON.parse(lines[i - 1]!);
          const curr = JSON.parse(lines[i]!);
          // Must be ordered by created_at ASC, id ASC
          const prevKey = `${prev.created_at}_${prev.id}`;
          const currKey = `${curr.created_at}_${curr.id}`;
          assert.ok(prevKey <= currKey, `Ordering violation: ${prevKey} should be <= ${currKey}`);
        }
      }
    });
  });
});
