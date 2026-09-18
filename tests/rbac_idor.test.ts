import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/app.js';
import { runSeed } from '../src/db/seed.js';
import { AuthService } from '../src/services/auth.service.js';
import { UserRole } from '../src/types/domain.js';

describe('RBAC & Anti-IDOR Security Invariants', () => {
  let app: ReturnType<typeof buildApp>;
  let authService: AuthService;
  let workerToken: string;
  let driverToken: string;
  let citizenToken: string;
  let authorityToken: string;

  before(async () => {
    runSeed(); // Seed database
    authService = new AuthService();
    app = buildApp();
    await app.ready();

    // Generate tokens for test roles
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

    authorityToken = authService.createToken({
      userId: 'usr-auth-01',
      username: 'commissioner',
      role: UserRole.AUTHORITY
    });
  });

  after(async () => {
    await app.close();
  });

  it('unauthenticated request receives HTTP 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/master/wards'
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error, 'UNAUTHORIZED');
  });

  it('WORKER token accessing authority metrics receives HTTP 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics/route-completion/run-demo-01',
      headers: { authorization: `Bearer ${workerToken}` }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, 'FORBIDDEN');
    assert.match(res.json().message, /Worker\/Driver isolation active/i);
  });

  it('DRIVER token accessing anomaly intelligence receives HTTP 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/anomalies',
      headers: { authorization: `Bearer ${driverToken}` }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, 'FORBIDDEN');
  });

  it('WORKER token accessing audit logs receives HTTP 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/audit/events',
      headers: { authorization: `Bearer ${workerToken}` }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, 'FORBIDDEN');
  });

  it('CITIZEN token accessing another household record receives HTTP 403 Forbidden (Anti-IDOR)', async () => {
    // Citizen Priya owns house-demo-101, attempts to access house-demo-102
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/master/households/house-demo-102',
      headers: { authorization: `Bearer ${citizenToken}` }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, 'FORBIDDEN');
    assert.match(res.json().message, /Anti-IDOR Violation/i);
  });

  it('CITIZEN token accessing another household payment history receives HTTP 403 Forbidden (Anti-IDOR)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/finance/payments/house-demo-102',
      headers: { authorization: `Bearer ${citizenToken}` }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, 'FORBIDDEN');
    assert.match(res.json().message, /Anti-IDOR Violation/i);
  });

  it('CITIZEN token filing complaint for another household receives HTTP 403 Forbidden (Anti-IDOR)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/complaints',
      headers: { authorization: `Bearer ${citizenToken}` },
      payload: {
        household_id: 'house-demo-102', // NOT their household
        service_date: '2026-09-14',
        complaint_type: 'MISSED_COLLECTION',
        resident_remarks: 'Attempting to lodge grievance for neighbor premises.'
      }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, 'FORBIDDEN');
    assert.match(res.json().message, /Anti-IDOR Violation/i);
  });

  it('AUTHORITY token successfully accesses executive metrics (HTTP 200)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics/route-completion/run-demo-01',
      headers: { authorization: `Bearer ${authorityToken}` }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().value_percentage, 100.00);
  });
});
