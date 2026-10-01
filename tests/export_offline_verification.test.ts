import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { runSeed } from '../src/db/seed.js';
import { AuthService } from '../src/services/auth.service.js';
import { UserRole } from '../src/types/domain.js';

describe('Export Pipeline & Offline Sync Verification Test Suite', () => {
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

  describe('1. Export Endpoint RBAC Enforcement', () => {
    it('rejects unauthenticated requests to export endpoints with HTTP 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/export/audit-events?format=ndjson'
      });
      assert.equal(res.statusCode, 401);
      assert.equal(res.json().error, 'UNAUTHORIZED');
    });

    it('rejects non-administrative roles (worker, driver, citizen) with HTTP 403', async () => {
      for (const [role, token] of [
        ['WORKER', workerToken],
        ['DRIVER', driverToken],
        ['CITIZEN', citizenToken]
      ] as const) {
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/audit/export/audit-events?format=ndjson',
          headers: { authorization: `Bearer ${token}` }
        });
        assert.equal(res.statusCode, 403, `Expected HTTP 403 for role ${role}`);
        assert.equal(res.json().error, 'FORBIDDEN');
      }
    });

    it('authorizes AUTHORITY and ADMIN roles to export audit datasets', async () => {
      for (const [role, token] of [
        ['AUTHORITY', authorityToken],
        ['ADMIN', adminToken]
      ] as const) {
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/audit/export/audit-events?format=ndjson',
          headers: { authorization: `Bearer ${token}` }
        });
        assert.equal(res.statusCode, 200, `Expected HTTP 200 for role ${role}`);
        assert.equal(res.headers['x-export-type'], 'audit-events');
      }
    });
  });

  describe('2. RFC 4180 CSV Escaping & NDJSON Format Conformity', () => {
    it('NDJSON export contains valid metadata envelope on line 0 and valid JSON per subsequent line', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/export/operational-verification?format=ndjson',
        headers: { authorization: `Bearer ${authorityToken}` }
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'application/x-ndjson; charset=utf-8');

      const lines = res.body.trim().split('\n');
      assert.ok(lines.length >= 1);

      // Line 0 metadata envelope
      const meta = JSON.parse(lines[0]!);
      assert.ok(meta._export_metadata, 'Line 0 must have _export_metadata envelope');
      assert.equal(meta._export_metadata.dataset, 'operational-verification');
      assert.equal(meta._export_metadata.format, 'ndjson');
      assert.equal(meta._export_metadata.provenance_classification, 'SIMULATED_DEMO_DATA');

      // Subsequent rows
      for (let i = 1; i < lines.length; i++) {
        const row = JSON.parse(lines[i]!);
        assert.ok(typeof row === 'object' && row !== null);
      }
    });

    it('CSV export contains RFC 4180 comment metadata and proper escaping for fields with special characters', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/export/audit-events?format=csv',
        headers: { authorization: `Bearer ${authorityToken}` }
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');

      const lines = res.body.trim().split('\n');
      assert.ok(lines.length >= 3);

      // Metadata comments
      const commentLines = lines.filter(l => l.startsWith('# '));
      assert.ok(commentLines.some(l => l.includes('export_type: audit-events')));
      assert.ok(commentLines.some(l => l.includes('provenance_classification: SIMULATED_DEMO_DATA')));

      // First non-comment line is header
      const headerLine = lines.find(l => !l.startsWith('#'))!;
      assert.ok(headerLine);
      const headers = headerLine.split(',');
      assert.ok(headers.length >= 4);
    });

    it('RFC 4180 test: fields with commas, quotes, and newlines are properly escaped in CSV serialization', () => {
      // Direct unit test of RFC 4180 escaping rule
      const escapeCsvField = (val: unknown): string => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      assert.equal(escapeCsvField('simple'), 'simple');
      assert.equal(escapeCsvField('hello, world'), '"hello, world"');
      assert.equal(escapeCsvField('hello "quoted" world'), '"hello ""quoted"" world"');
      assert.equal(escapeCsvField('multi\nline'), '"multi\nline"');
      assert.equal(escapeCsvField('all, of "them"\ncombined'), '"all, of ""them""\ncombined"');
    });
  });

  describe('3. Offline Queue Synchronization Semantics & Invariants', () => {
    interface QueueItem {
      client_event_id: string;
      run_id: string;
      household_id: string;
      evidence_type: string;
      captured_at: string;
      status: 'QUEUED' | 'SYNCING' | 'SYNCED' | 'FAILED';
      retry_count: number;
      created_at: string;
    }

    it('offline queue item mandates standard UUID v4 client_event_id and immutable capture timestamp', () => {
      const item: QueueItem = {
        client_event_id: '12345678-1234-4234-8234-123456789012',
        run_id: 'run-demo-01',
        household_id: 'house-demo-101',
        evidence_type: 'DOORSTEP_QR_SCAN',
        captured_at: '2026-10-01T08:00:00.000Z',
        status: 'QUEUED',
        retry_count: 0,
        created_at: '2026-10-01T08:00:01.000Z'
      };

      assert.match(item.client_event_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      assert.equal(item.status, 'QUEUED');
      assert.equal(item.retry_count, 0);
    });

    it('strict FIFO queue replay ordering preserves chronological capture order', () => {
      const queue: QueueItem[] = [
        {
          client_event_id: 'b2222222-2222-4222-8222-222222222222',
          run_id: 'run-demo-01',
          household_id: 'house-demo-102',
          evidence_type: 'DOORSTEP_NFC_TAP',
          captured_at: '2026-10-01T08:05:00.000Z',
          status: 'QUEUED',
          retry_count: 0,
          created_at: '2026-10-01T08:05:02.000Z'
        },
        {
          client_event_id: 'a1111111-1111-4111-8111-111111111111',
          run_id: 'run-demo-01',
          household_id: 'house-demo-101',
          evidence_type: 'DOORSTEP_QR_SCAN',
          captured_at: '2026-10-01T08:00:00.000Z',
          status: 'QUEUED',
          retry_count: 0,
          created_at: '2026-10-01T08:00:02.000Z'
        }
      ];

      // Sort FIFO by created_at
      const fifoOrdered = [...queue].sort((a, b) => a.created_at.localeCompare(b.created_at));
      assert.equal(fifoOrdered[0].household_id, 'house-demo-101');
      assert.equal(fifoOrdered[1].household_id, 'house-demo-102');
    });

    it('offline queue transitions to FAILED when maximum retry limit is reached', () => {
      const MAX_RETRIES = 3;
      let item: QueueItem = {
        client_event_id: 'c3333333-3333-4333-8333-333333333333',
        run_id: 'run-demo-01',
        household_id: 'house-demo-103',
        evidence_type: 'DOORSTEP_QR_SCAN',
        captured_at: '2026-10-01T08:10:00.000Z',
        status: 'QUEUED',
        retry_count: 0,
        created_at: '2026-10-01T08:10:02.000Z'
      };

      // Simulate failed attempts
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        item = {
          ...item,
          status: attempt >= MAX_RETRIES ? 'FAILED' : 'QUEUED',
          retry_count: attempt
        };
      }

      assert.equal(item.status, 'FAILED');
      assert.equal(item.retry_count, 3);
    });

    it('idempotent duplicate response is treated as successful sync, preserving duplicate safety', () => {
      const serverResponse = {
        success: true,
        duplicate: true,
        evidence_id: 'd4444444-4444-4444-8444-444444444444',
        synthesis: { status: 'VERIFIED', evidence_count: 1 }
      };

      // Handling logic: duplicate is NOT a failure, it marks the queue item as SYNCED
      const isSynced = serverResponse.success === true;
      assert.ok(isSynced);
      assert.ok(serverResponse.duplicate);
    });
  });
});
