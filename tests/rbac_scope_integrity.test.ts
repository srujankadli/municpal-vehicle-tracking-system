import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { runSeed } from '../src/db/seed.js';
import { AuthService } from '../src/services/auth.service.js';
import { UserRole } from '../src/types/domain.js';

describe('RBAC & Role-Scope Boundary Integrity Suite', () => {
  let app: ReturnType<typeof buildApp>;
  let authService: AuthService;

  let workerToken: string;
  let driverToken: string;
  let citizenToken: string;
  let otherCitizenToken: string;
  let supervisorWard14Token: string;
  let supervisorWard15Token: string;
  let authorityToken: string;
  let adminToken: string;
  let supervisorNoWardToken: string;
  let wardOfficerWard14Token: string;
  let wardOfficerNoWardToken: string;

  before(async () => {
    runSeed();
    authService = new AuthService();
    app = buildApp();
    await app.ready();

    // Driver Ramesh (assigned to Route A, da-demo-01, run-demo-01)
    driverToken = authService.createToken({
      userId: 'usr-driver-01',
      username: 'driver_ramesh',
      role: UserRole.DRIVER,
      workerId: 'wrk-demo-01'
    });

    // Worker Suresh (assigned to Route A, da-demo-01, run-demo-01)
    workerToken = authService.createToken({
      userId: 'usr-worker-01',
      username: 'worker_suresh',
      role: UserRole.WORKER,
      workerId: 'wrk-demo-03'
    });

    // Citizen Priya (household 101, Ward 14)
    citizenToken = authService.createToken({
      userId: 'usr-citizen-01',
      username: 'citizen_priya',
      role: UserRole.CITIZEN,
      householdId: 'house-demo-101'
    });

    // Other Citizen Rajesh (household 102, Ward 14)
    otherCitizenToken = authService.createToken({
      userId: 'usr-citizen-02',
      username: 'citizen_rajesh',
      role: UserRole.CITIZEN,
      householdId: 'house-demo-102'
    });

    // Supervisor Ward 14
    supervisorWard14Token = authService.createToken({
      userId: 'usr-sup-01',
      username: 'supervisor_w14',
      role: UserRole.SUPERVISOR,
      wardId: 'ward-demo-14'
    });

    // Supervisor Ward 15
    supervisorWard15Token = authService.createToken({
      userId: 'usr-sup-02',
      username: 'supervisor_w15',
      role: UserRole.SUPERVISOR,
      wardId: 'ward-demo-15'
    });

    // Authority Commissioner
    authorityToken = authService.createToken({
      userId: 'usr-auth-01',
      username: 'commissioner',
      role: UserRole.AUTHORITY
    });

    // Admin
    adminToken = authService.createToken({
      userId: 'usr-admin-01',
      username: 'sysadmin',
      role: UserRole.ADMIN
    });

    // Supervisor without assigned ward (for fail-closed testing)
    supervisorNoWardToken = authService.createToken({
      userId: 'usr-sup-noward',
      username: 'supervisor_unassigned',
      role: UserRole.SUPERVISOR
    });

    // Ward Officer Ward 14
    wardOfficerWard14Token = authService.createToken({
      userId: 'usr-ward-01',
      username: 'ward_officer_14',
      role: UserRole.WARD_OFFICER,
      wardId: 'ward-demo-14'
    });

    // Ward Officer without assigned ward (for fail-closed testing)
    wardOfficerNoWardToken = authService.createToken({
      userId: 'usr-ward-noward',
      username: 'ward_officer_unassigned',
      role: UserRole.WARD_OFFICER
    });
  });

  after(async () => {
    await app.close();
  });

  it('1. CITIZEN is strictly blocked from general operations assignments roster (HTTP 403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/assignments',
      headers: { authorization: `Bearer ${citizenToken}` }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, 'FORBIDDEN');
  });

  it('2. CITIZEN can dynamically inspect own household service status without hardcoded run IDs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/citizen/service-status?service_date=2026-09-14',
      headers: { authorization: `Bearer ${citizenToken}` }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.household_id, 'house-demo-101');
    assert.ok(body.synthesis);
    assert.ok(body.route);
  });

  it('3. WORKER/DRIVER cannot access finance obligations or payment ledgers (HTTP 403)', async () => {
    const res1 = await app.inject({
      method: 'GET',
      url: '/api/v1/finance/obligations/house-demo-101',
      headers: { authorization: `Bearer ${workerToken}` }
    });
    assert.equal(res1.statusCode, 403);

    const res2 = await app.inject({
      method: 'GET',
      url: '/api/v1/finance/payments/house-demo-101',
      headers: { authorization: `Bearer ${driverToken}` }
    });
    assert.equal(res2.statusCode, 403);
  });

  it('4. Anti-IDOR: Citizen cannot access another household financial obligations (HTTP 403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/finance/obligations/house-demo-102',
      headers: { authorization: `Bearer ${citizenToken}` }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, 'FORBIDDEN');
  });

  it('5. Safe Worker Household API: Worker receives households scoped strictly to assigned run', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/runs/run-demo-01/households',
      headers: { authorization: `Bearer ${workerToken}` }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.run_id, 'run-demo-01');
    assert.ok(Array.isArray(body.households));
    assert.ok(body.households.length > 0);
  });

  it('6. Safe Worker Household API: Cross-run inspection by unassigned worker receives HTTP 403', async () => {
    // Worker Suresh is assigned to run-demo-01, NOT run-demo-03
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/runs/run-demo-03/households',
      headers: { authorization: `Bearer ${workerToken}` }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, 'FORBIDDEN');
  });

  it('7. Cross-Ward Isolation: Supervisor Ward 15 cannot inspect run in Ward 14 (HTTP 403)', async () => {
    // run-demo-01 is in Ward 14
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/runs/run-demo-01',
      headers: { authorization: `Bearer ${supervisorWard15Token}` }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, 'FORBIDDEN');
  });

  it('8. Cross-Ward Isolation: Supervisor Ward 15 cannot apply manual override in Ward 14 (HTTP 403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/runs/run-demo-01/manual-override',
      headers: { authorization: `Bearer ${supervisorWard15Token}` },
      payload: {
        household_id: 'house-demo-101',
        target_status: 'EXCEPTION',
        override_reason: 'Cross-ward unauthorized override attempt'
      }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, 'FORBIDDEN');
  });

  it('9. Master Routes scoping: Citizen sees only assigned household route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/master/routes',
      headers: { authorization: `Bearer ${citizenToken}` }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.routes.length, 1);
    assert.equal(body.routes[0].id, 'route-demo-A');
  });

  it('10. Master Routes scoping: Authority and Admin see all routes', async () => {
    const resAuth = await app.inject({
      method: 'GET',
      url: '/api/v1/master/routes',
      headers: { authorization: `Bearer ${authorityToken}` }
    });
    assert.equal(resAuth.statusCode, 200);
    assert.ok(resAuth.json().routes.length >= 3);

    const resAdmin = await app.inject({
      method: 'GET',
      url: '/api/v1/master/routes',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(resAdmin.statusCode, 200);
    assert.ok(resAdmin.json().routes.length >= 3);
  });

  it('11. Master Routes & Households: Supervisor/Ward Officer responses are ward-scoped through areas and do not error', async () => {
    // Ward 14 routes
    const resRoutes = await app.inject({
      method: 'GET',
      url: '/api/v1/master/routes',
      headers: { authorization: `Bearer ${supervisorWard14Token}` }
    });
    assert.equal(resRoutes.statusCode, 200);
    const routes = resRoutes.json().routes;
    assert.ok(routes.length >= 1);
    // Ward 14 routes only (RT-14A-01, RT-14B-02)
    assert.ok(routes.every((r: any) => r.code.startsWith('RT-14')));

    // Ward 14 households
    const resHouseholds = await app.inject({
      method: 'GET',
      url: '/api/v1/master/households',
      headers: { authorization: `Bearer ${wardOfficerWard14Token}` }
    });
    assert.equal(resHouseholds.statusCode, 200);
    const households = resHouseholds.json().households;
    assert.ok(households.length >= 1);
    assert.ok(households.every((h: any) => h.service_uid.startsWith('H-14')));
  });

  it('12. Fail-Closed Ward Access: Supervisor without wardId receives HTTP 403 across ward-scoped endpoints', async () => {
    const endpoints = [
      { method: 'GET', url: '/api/v1/master/wards' },
      { method: 'GET', url: '/api/v1/master/routes' },
      { method: 'GET', url: '/api/v1/master/households' },
      { method: 'GET', url: '/api/v1/operations/assignments' },
      { method: 'GET', url: '/api/v1/operations/runs/run-demo-01' },
      { method: 'GET', url: '/api/v1/operations/runs/run-demo-01/households' },
      { method: 'PATCH', url: '/api/v1/operations/runs/run-demo-01/status', payload: { target_status: 'IN_PROGRESS' } },
      { method: 'GET', url: '/api/v1/operations/runs/run-demo-01/households/house-demo-101/status' },
      { method: 'POST', url: '/api/v1/operations/runs/run-demo-01/manual-override', payload: { household_id: 'house-demo-101', target_status: 'EXCEPTION', override_reason: 'Testing fail-closed' } },
      { method: 'GET', url: '/api/v1/complaints' },
      { method: 'PATCH', url: '/api/v1/complaints/comp-demo-01/resolve', payload: { status: 'RESOLVED', resolution_notes: 'Testing fail-closed' } },
      { method: 'GET', url: '/api/v1/anomalies' },
      { method: 'GET', url: '/api/v1/metrics/route-completion/run-demo-01' },
      { method: 'GET', url: '/api/v1/metrics/service-discrepancy/run-demo-01' }
    ] as const;

    for (const ep of endpoints) {
      const res = await app.inject({
        method: ep.method,
        url: ep.url,
        headers: { authorization: `Bearer ${supervisorNoWardToken}` },
        payload: (ep as any).payload
      });
      assert.equal(res.statusCode, 403, `Expected HTTP 403 for ${ep.method} ${ep.url}, got ${res.statusCode}`);
      assert.equal(res.json().error, 'FORBIDDEN');
    }
  });

  it('13. Fail-Closed Ward Access: Ward Officer without wardId receives HTTP 403 across ward-scoped endpoints', async () => {
    const endpoints = [
      { method: 'GET', url: '/api/v1/master/wards' },
      { method: 'GET', url: '/api/v1/master/routes' },
      { method: 'GET', url: '/api/v1/master/households' },
      { method: 'GET', url: '/api/v1/operations/assignments' },
      { method: 'GET', url: '/api/v1/operations/runs/run-demo-01' },
      { method: 'GET', url: '/api/v1/operations/runs/run-demo-01/households' },
      { method: 'GET', url: '/api/v1/operations/runs/run-demo-01/households/house-demo-101/status' },
      { method: 'GET', url: '/api/v1/complaints' },
      { method: 'PATCH', url: '/api/v1/complaints/comp-demo-01/resolve', payload: { status: 'RESOLVED', resolution_notes: 'Testing fail-closed' } },
      { method: 'GET', url: '/api/v1/anomalies' }
    ] as const;

    for (const ep of endpoints) {
      const res = await app.inject({
        method: ep.method,
        url: ep.url,
        headers: { authorization: `Bearer ${wardOfficerNoWardToken}` },
        payload: (ep as any).payload
      });
      assert.equal(res.statusCode, 403, `Expected HTTP 403 for ${ep.method} ${ep.url}, got ${res.statusCode}`);
      assert.equal(res.json().error, 'FORBIDDEN');
    }
  });

  it('14. Secure Household Status: Unassigned worker receives HTTP 403 on run inspection', async () => {
    // Worker Suresh is assigned to run-demo-01, NOT run-demo-03
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/runs/run-demo-03/households/house-demo-301/status',
      headers: { authorization: `Bearer ${workerToken}` }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, 'FORBIDDEN');
  });

  it('15. Secure Household Status: Cross-ward Supervisor receives HTTP 403', async () => {
    // Supervisor Ward 15 attempting to inspect run-demo-01 (in Ward 14)
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/runs/run-demo-01/households/house-demo-101/status',
      headers: { authorization: `Bearer ${supervisorWard15Token}` }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, 'FORBIDDEN');
  });

  it('16. Secure Household Status: Citizen cross-household access receives HTTP 403', async () => {
    // Citizen Priya (house-demo-101) requesting house-demo-102
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/runs/run-demo-01/households/house-demo-102/status',
      headers: { authorization: `Bearer ${citizenToken}` }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, 'FORBIDDEN');
  });

  it('17. Secure Household Status: Citizen requesting run not covering their household receives HTTP 403', async () => {
    // Citizen Priya (house-demo-101) requesting house-demo-101 against run-demo-03 (covers Route C, not Route A)
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/runs/run-demo-03/households/house-demo-101/status',
      headers: { authorization: `Bearer ${citizenToken}` }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, 'FORBIDDEN');
  });

  it('18. Secure Household Status: Authorized callers receive HTTP 200', async () => {
    // 1. Citizen on own household and valid run
    const resCitizen = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/runs/run-demo-01/households/house-demo-101/status',
      headers: { authorization: `Bearer ${citizenToken}` }
    });
    assert.equal(resCitizen.statusCode, 200);
    assert.ok(resCitizen.json().synthesis);

    // 2. Assigned Worker on run
    const resWorker = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/runs/run-demo-01/households/house-demo-101/status',
      headers: { authorization: `Bearer ${workerToken}` }
    });
    assert.equal(resWorker.statusCode, 200);

    // 3. Supervisor on assigned ward run
    const resSupervisor = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/runs/run-demo-01/households/house-demo-101/status',
      headers: { authorization: `Bearer ${supervisorWard14Token}` }
    });
    assert.equal(resSupervisor.statusCode, 200);

    // 4. Authority
    const resAuthority = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/runs/run-demo-01/households/house-demo-101/status',
      headers: { authorization: `Bearer ${authorityToken}` }
    });
    assert.equal(resAuthority.statusCode, 200);

    // 5. Admin
    const resAdmin = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/runs/run-demo-01/households/house-demo-101/status',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(resAdmin.statusCode, 200);
  });

  it('19. Restrict Complaint Filing: Denies Worker, Driver, Supervisor, Ward Officer, and Authority (HTTP 403)', async () => {
    const deniedRoles = [
      ['WORKER', workerToken],
      ['DRIVER', driverToken],
      ['SUPERVISOR', supervisorWard14Token],
      ['WARD_OFFICER', wardOfficerWard14Token],
      ['AUTHORITY', authorityToken]
    ] as const;

    for (const [roleName, token] of deniedRoles) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/complaints',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          household_id: 'house-demo-101',
          service_date: '2026-09-14',
          complaint_type: 'MISSED_COLLECTION',
          resident_remarks: `Unauthorized filing test by ${roleName}`
        }
      });
      assert.equal(res.statusCode, 403, `Expected HTTP 403 for filing complaint by ${roleName}`);
      assert.equal(res.json().error, 'FORBIDDEN');
    }

    // Citizen for own household: Allowed (HTTP 201)
    const resCitizen = await app.inject({
      method: 'POST',
      url: '/api/v1/complaints',
      headers: { authorization: `Bearer ${citizenToken}` },
      payload: {
        household_id: 'house-demo-101',
        service_date: '2026-09-14',
        complaint_type: 'MISSED_COLLECTION',
        resident_remarks: 'Valid complaint filed by resident Priya'
      }
    });
    assert.equal(resCitizen.statusCode, 201);
    assert.equal(resCitizen.json().success, true);

    // Admin: Allowed (HTTP 201)
    const resAdmin = await app.inject({
      method: 'POST',
      url: '/api/v1/complaints',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        household_id: 'house-demo-102',
        service_date: '2026-09-14',
        complaint_type: 'MISSED_COLLECTION',
        resident_remarks: 'Administrative grievance intake on behalf of citizen'
      }
    });
    assert.equal(resAdmin.statusCode, 201);
    assert.equal(resAdmin.json().success, true);
  });

  it('20. Automatic ANOM-01 creation: Overdue scheduled assignment (>90m delay) creates ANOM-01 on lifecycle query', async () => {
    const { getDatabase } = await import('../src/db/connection.js');
    const db = getDatabase();

    // Insert an overdue scheduled assignment (scheduled 120 mins ago)
    const assignmentId = 'da-auto-anom01-test';
    const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const srcRow = db.prepare(`SELECT id FROM data_sources LIMIT 1`).get() as { id: string };

    db.prepare(`
      INSERT INTO daily_assignments (
        id, service_date, route_id, vehicle_id, driver_id, supervisor_id,
        scheduled_start, status, source_id, created_at, created_by
      ) VALUES (
        ?, '2026-09-25', 'route-demo-A', 'veh-demo-01', 'wrk-demo-01', 'wrk-demo-05',
        ?, 'SCHEDULED', ?, ?, 'usr-admin-01'
      )
    `).run(assignmentId, twoHoursAgo, srcRow.id, now);

    // Confirm no ANOM-01 exists for this assignment yet
    const preCheck = db.prepare(`
      SELECT * FROM operational_anomalies
      WHERE anomaly_id = 'ANOM-01' AND trigger_evidence LIKE ?
    `).get(`%${assignmentId}%`);
    assert.equal(preCheck, undefined);

    // Trigger normal operational lifecycle query (GET /api/v1/operations/assignments)
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/assignments?service_date=2026-09-25',
      headers: { authorization: `Bearer ${authorityToken}` }
    });
    assert.equal(res.statusCode, 200);

    // Verify ANOM-01 was created automatically by the lifecycle evaluation
    const postCheck = db.prepare(`
      SELECT * FROM operational_anomalies
      WHERE anomaly_id = 'ANOM-01' AND trigger_evidence LIKE ?
    `).get(`%${assignmentId}%`) as any;

    assert.ok(postCheck, 'ANOM-01 must be created automatically by assignment lifecycle inspection');
    assert.equal(postCheck.anomaly_id, 'ANOM-01');
    assert.equal(postCheck.severity, 'HIGH');
    assert.match(postCheck.description, /Vehicle departure delayed/i);
  });

  it('21. Prevent Cross-Ward Anomaly Leakage: Ward Officer cannot view another ward global anomaly or unscoped financial anomalies', async () => {
    const { getDatabase } = await import('../src/db/connection.js');
    const db = getDatabase();
    const srcRow = db.prepare(`SELECT id FROM data_sources LIMIT 1`).get() as { id: string };
    const now = new Date().toISOString();

    // 1. Insert an unscoped financial anomaly (ANOM-04: payment collision, service_run_id: null)
    const finAnomId = 'anom-test-fin-unscoped';
    db.prepare(`
      INSERT INTO operational_anomalies (
        id, service_run_id, anomaly_id, severity, description,
        trigger_evidence, status, detected_at, source_id
      ) VALUES (
        ?, NULL, 'ANOM-04', 'CRITICAL', 'Unscoped financial anomaly test',
        ?, 'UNRESOLVED', ?, ?
      )
    `).run(finAnomId, JSON.stringify({ colliding_reference: 'UPI-COLLISION-TEST-999' }), now, srcRow.id);

    // 2. Insert an anomaly tied to Ward 15 via assignment (service_run_id: null, assignment_id in Ward 15)
    // First ensure an assignment in Ward 15 exists
    const asgnW15Id = 'asgn-w15-leak-test';
    db.prepare(`
      INSERT INTO daily_assignments (
        id, service_date, route_id, vehicle_id, driver_id, supervisor_id,
        scheduled_start, status, source_id, created_at, created_by
      ) VALUES (
        ?, '2026-09-29', 'route-demo-C', 'veh-demo-04', 'wrk-demo-01', 'wrk-demo-05',
        ?, 'SCHEDULED', ?, ?, 'usr-admin-01'
      )
    `).run(asgnW15Id, now, srcRow.id, now);

    const w15AnomId = 'anom-test-w15-assignment';
    db.prepare(`
      INSERT INTO operational_anomalies (
        id, service_run_id, anomaly_id, severity, description,
        trigger_evidence, status, detected_at, source_id
      ) VALUES (
        ?, NULL, 'ANOM-01', 'HIGH', 'Ward 15 assignment delay anomaly',
        ?, 'UNRESOLVED', ?, ?
      )
    `).run(w15AnomId, JSON.stringify({ assignment_id: asgnW15Id }), now, srcRow.id);

    // Query anomalies as Ward Officer of Ward 14
    const resW14 = await app.inject({
      method: 'GET',
      url: '/api/v1/anomalies',
      headers: { authorization: `Bearer ${wardOfficerWard14Token}` }
    });
    assert.equal(resW14.statusCode, 200);
    const w14Anomalies = resW14.json().anomalies as any[];

    // Must NOT contain the unscoped financial anomaly
    const foundFin = w14Anomalies.find((a: any) => a.id === finAnomId);
    assert.equal(foundFin, undefined, 'Ward 14 Officer must NOT see unscoped financial anomaly');

    // Must NOT contain the Ward 15 anomaly
    const foundW15 = w14Anomalies.find((a: any) => a.id === w15AnomId);
    assert.equal(foundW15, undefined, 'Ward 14 Officer must NOT see Ward 15 anomaly');

    // Query anomalies as Authority / Commissioner: Must see both
    const resAuth = await app.inject({
      method: 'GET',
      url: '/api/v1/anomalies',
      headers: { authorization: `Bearer ${authorityToken}` }
    });
    assert.equal(resAuth.statusCode, 200);
    const authAnomalies = resAuth.json().anomalies as any[];
    assert.ok(authAnomalies.some((a: any) => a.id === finAnomId), 'Authority must see global financial anomaly');
    assert.ok(authAnomalies.some((a: any) => a.id === w15AnomId), 'Authority must see Ward 15 anomaly');
  });

  it('22. Truly Automatic ANOM-01 Generation: Overdue assignment triggers ANOM-01 without calling read or manual endpoints', async () => {
    const { getDatabase } = await import('../src/db/connection.js');
    const db = getDatabase();
    const srcRow = db.prepare(`SELECT id FROM data_sources LIMIT 1`).get() as { id: string };

    const assignmentId = 'da-truly-auto-anom01';
    const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO daily_assignments (
        id, service_date, route_id, vehicle_id, driver_id, supervisor_id,
        scheduled_start, status, source_id, created_at, created_by
      ) VALUES (
        ?, '2026-09-30', 'route-demo-B', 'veh-demo-02', 'wrk-demo-02', 'wrk-demo-05',
        ?, 'SCHEDULED', ?, ?, 'usr-admin-01'
      )
    `).run(assignmentId, twoHoursAgo, srcRow.id, now);

    // Verify no anomaly exists prior to background evaluation
    const preCheck = db.prepare(`
      SELECT * FROM operational_anomalies
      WHERE anomaly_id = 'ANOM-01' AND trigger_evidence LIKE ?
    `).get(`%${assignmentId}%`);
    assert.equal(preCheck, undefined);

    // Execute background evaluation mechanism directly (WITHOUT HTTP dashboard read or manual evaluation)
    const detected = (app as any).runAutomaticAnomalySweep();
    assert.ok(Array.isArray(detected));

    // Confirm ANOM-01 was recorded in the database
    const postCheck = db.prepare(`
      SELECT * FROM operational_anomalies
      WHERE anomaly_id = 'ANOM-01' AND trigger_evidence LIKE ?
    `).get(`%${assignmentId}%`) as any;

    assert.ok(postCheck, 'ANOM-01 must be generated by background evaluation mechanism');
    assert.equal(postCheck.anomaly_id, 'ANOM-01');
    assert.equal(postCheck.severity, 'HIGH');
    assert.equal(postCheck.status, 'UNRESOLVED');

    // Prove idempotency: Running sweep again must not create duplicate unresolved anomaly
    (app as any).runAutomaticAnomalySweep();
    const countCheck = db.prepare(`
      SELECT COUNT(*) as count FROM operational_anomalies
      WHERE anomaly_id = 'ANOM-01' AND trigger_evidence LIKE ?
    `).get(`%${assignmentId}%`) as { count: number };
    assert.equal(countCheck.count, 1, 'Idempotency: exactly 1 anomaly record must exist');
  });

  it('23. Household Route Membership: Out-of-route household rejected with HTTP 403 for Worker, Supervisor, Authority, and Citizen', async () => {
    // run-demo-01 is assigned to route-demo-A.
    // house-demo-201 belongs to route-demo-B, NOT route-demo-A.
    const outOfRouteHousehold = 'house-demo-201';
    const runId = 'run-demo-01';

    // 1. Worker (assigned to run-demo-01, but requesting out-of-route household)
    const resWorker = await app.inject({
      method: 'GET',
      url: `/api/v1/operations/runs/${runId}/households/${outOfRouteHousehold}/status`,
      headers: { authorization: `Bearer ${workerToken}` }
    });
    assert.equal(resWorker.statusCode, 403);
    assert.equal(resWorker.json().error, 'FORBIDDEN');
    assert.match(resWorker.json().message, /does not belong to the route/i);

    // 2. Supervisor (Ward 14, but requesting out-of-route household on run)
    const resSupervisor = await app.inject({
      method: 'GET',
      url: `/api/v1/operations/runs/${runId}/households/${outOfRouteHousehold}/status`,
      headers: { authorization: `Bearer ${supervisorWard14Token}` }
    });
    assert.equal(resSupervisor.statusCode, 403);
    assert.equal(resSupervisor.json().error, 'FORBIDDEN');
    assert.match(resSupervisor.json().message, /does not belong to the route/i);

    // 3. Authority (Commissioner requesting out-of-route household on run)
    const resAuthority = await app.inject({
      method: 'GET',
      url: `/api/v1/operations/runs/${runId}/households/${outOfRouteHousehold}/status`,
      headers: { authorization: `Bearer ${authorityToken}` }
    });
    assert.equal(resAuthority.statusCode, 403);
    assert.equal(resAuthority.json().error, 'FORBIDDEN');
    assert.match(resAuthority.json().message, /does not belong to the route/i);

    // 4. Citizen (Resident Priya requesting out-of-route household on run)
    const resCitizen = await app.inject({
      method: 'GET',
      url: `/api/v1/operations/runs/${runId}/households/${outOfRouteHousehold}/status`,
      headers: { authorization: `Bearer ${citizenToken}` }
    });
    assert.equal(resCitizen.statusCode, 403);
    assert.equal(resCitizen.json().error, 'FORBIDDEN');
  });

  it('24. Citizen Service Status Contract: Admin and other non-citizen roles denied (HTTP 403) on /citizen/service-status', async () => {
    // Admin attempting to query citizen service status endpoint
    const resAdmin = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/citizen/service-status',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(resAdmin.statusCode, 403);
    assert.equal(resAdmin.json().error, 'FORBIDDEN');

    // Worker attempting to query citizen service status endpoint
    const resWorker = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/citizen/service-status',
      headers: { authorization: `Bearer ${workerToken}` }
    });
    assert.equal(resWorker.statusCode, 403);
    assert.equal(resWorker.json().error, 'FORBIDDEN');

    // Supervisor attempting to query citizen service status endpoint
    const resSup = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/citizen/service-status',
      headers: { authorization: `Bearer ${supervisorWard14Token}` }
    });
    assert.equal(resSup.statusCode, 403);
    assert.equal(resSup.json().error, 'FORBIDDEN');

    // Citizen successfully querying own dynamic service status
    const resCitizen = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/citizen/service-status',
      headers: { authorization: `Bearer ${citizenToken}` }
    });
    assert.equal(resCitizen.statusCode, 200);
    assert.equal(resCitizen.json().household_id, 'house-demo-101');
    assert.ok(resCitizen.json().synthesis);
  });
});

