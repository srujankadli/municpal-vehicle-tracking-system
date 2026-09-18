import type { DatabaseSync } from 'node:sqlite';
import { getDatabase } from './connection.js';
import { runMigrations } from './migrate.js';
import { AuthService } from '../services/auth.service.js';
import { ProvenanceService } from '../services/provenance.service.js';
import {
  DataClassification,
  SourceType,
  UserRole,
  VerificationStatus,
  EvidenceType,
  PaymentStatus,
  PaymentBeneficiaryType,
  PaymentObligationType,
  ReconciliationStatus,
  AnomalySeverity,
  AnomalyStatus
} from '../types/domain.js';

export function runSeed(dbInstance?: DatabaseSync): {
  sourceId: string;
  wardsCount: number;
  routesCount: number;
  householdsCount: number;
  usersCount: number;
} {
  // Production Demo Seeding Guard
  const isProd = process.env.NODE_ENV === 'production';
  const hasOverride = process.argv.includes('--allow-demo-seeding-in-production') || process.env.ALLOW_DEMO_SEEDING_IN_PRODUCTION === 'true';

  if (isProd && !hasOverride) {
    throw new Error(
      '[PRODUCTION_DATA_PROTECTION_GUARD] Synthetic demo seeding is strictly prohibited in production environment. ' +
      'To force demo seeding in production for staging/demo purposes, pass --allow-demo-seeding-in-production.'
    );
  }

  const db = dbInstance || getDatabase();
  const auth = new AuthService(db);
  const provenance = new ProvenanceService(db);

  // 0. Ensure tables exist
  runMigrations(db);

  // Clear existing simulated demo data deterministically
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec(`
    DELETE FROM operational_anomalies;
    DELETE FROM audit_events;
    DELETE FROM payment_reconciliations;
    DELETE FROM resident_payments;
    DELETE FROM payment_obligations;
    DELETE FROM complaints;
    DELETE FROM collection_records;
    DELETE FROM service_evidence;
    DELETE FROM telemetry_events;
    DELETE FROM daily_service_runs;
    DELETE FROM assignment_workers;
    DELETE FROM daily_assignments;
    DELETE FROM master_assignments;
    DELETE FROM households;
    DELETE FROM routes;
    DELETE FROM areas;
    DELETE FROM wards;
    DELETE FROM vehicles;
    DELETE FROM workers;
    DELETE FROM users;
    DELETE FROM data_sources WHERE classification = 'SIMULATED_DEMO_DATA';
  `);
  db.exec('PRAGMA foreign_keys = ON;');

  // 1. Provenance Source Registration
  const demoSource = provenance.registerDataSource({
    source_type: SourceType.SYNTHETIC_SEEDER,
    classification: DataClassification.SIMULATED_DEMO_DATA,
    provider_name: 'Deterministic Municipal Scenario Seeder (Phase 1 Baseline)',
    external_reference_id: 'SEED-BATCH-PHASE1',
    metadata_json: JSON.stringify({
      disclaimer: 'SYNTHETIC DATA FOR DEMONSTRATION AND TESTING ONLY. NOT REAL MUNICIPAL RECORDS.'
    })
  });
  const sourceId = demoSource.id;
  const now = new Date().toISOString();
  const serviceDate = '2026-09-14';

  // 2. Seed Users across all roles
  const users = [
    { id: 'usr-admin-01', username: 'admin', role: UserRole.ADMIN, name: 'System Administrator' },
    { id: 'usr-auth-01', username: 'commissioner', role: UserRole.AUTHORITY, name: 'Municipal Commissioner' },
    { id: 'usr-sup-01', username: 'supervisor_w14', role: UserRole.SUPERVISOR, name: 'Sanitation Supervisor Ward 14', wardId: 'ward-demo-14', workerId: 'wrk-demo-05' },
    { id: 'usr-sup-02', username: 'supervisor_w15', role: UserRole.SUPERVISOR, name: 'Sanitation Supervisor Ward 15', wardId: 'ward-demo-15' },
    { id: 'usr-ward-01', username: 'ward_officer_14', role: UserRole.WARD_OFFICER, name: 'Ward Officer 14', wardId: 'ward-demo-14' },
    { id: 'usr-driver-01', username: 'driver_ramesh', role: UserRole.DRIVER, name: 'Driver Ramesh Kumar', workerId: 'wrk-demo-01' },
    { id: 'usr-driver-02', username: 'driver_arun', role: UserRole.DRIVER, name: 'Driver Arun Varma', workerId: 'wrk-demo-02' },
    { id: 'usr-worker-01', username: 'worker_suresh', role: UserRole.WORKER, name: 'Sanitary Worker Suresh', workerId: 'wrk-demo-03' },
    { id: 'usr-worker-02', username: 'worker_deepak', role: UserRole.WORKER, name: 'Sanitary Worker Deepak', workerId: 'wrk-demo-04' },
    { id: 'usr-citizen-01', username: 'citizen_priya', role: UserRole.CITIZEN, name: 'Resident Priya Sharma', householdId: 'house-demo-101' },
    { id: 'usr-citizen-02', username: 'citizen_rajesh', role: UserRole.CITIZEN, name: 'Resident Rajesh Verma', householdId: 'house-demo-102' }
  ];

  const insertUserStmt = db.prepare(`
    INSERT INTO users (id, username, password_hash, full_name, role, ward_id, household_id, worker_id, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  for (const u of users) {
    const defaultPassword = `${u.username}_Pass123!`;
    const hash = auth.hashPassword(defaultPassword);
    insertUserStmt.run(u.id, u.username, hash, u.name, u.role, u.wardId || null, u.householdId || null, (u as any).workerId || null, now);
  }

  // 3. Seed Wards & Areas
  const insertWardStmt = db.prepare(`INSERT INTO wards VALUES (?, ?, ?, ?, ?, ?)`);
  insertWardStmt.run('ward-demo-14', 'WARD-14', 'Ward 14 (Central Commercial & Residential)', sourceId, now, now);
  insertWardStmt.run('ward-demo-15', 'WARD-15', 'Ward 15 (North Residential Sector)', sourceId, now, now);

  const insertAreaStmt = db.prepare(`INSERT INTO areas VALUES (?, ?, ?, ?, ?, ?)`);
  insertAreaStmt.run('area-demo-14A', 'ward-demo-14', 'Gandhi Road Commercial Enclave', sourceId, now, now);
  insertAreaStmt.run('area-demo-14B', 'ward-demo-14', 'Station Colony Residential', sourceId, now, now);
  insertAreaStmt.run('area-demo-15A', 'ward-demo-15', 'Greenfield Heights', sourceId, now, now);

  // 4. Seed Routes
  const insertRouteStmt = db.prepare(`INSERT INTO routes VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  insertRouteStmt.run('route-demo-A', 'area-demo-14A', 'RT-14A-01', 'Gandhi Road Main Route', null, sourceId, now, now);
  insertRouteStmt.run('route-demo-B', 'area-demo-14B', 'RT-14B-02', 'Station Colony Loop', null, sourceId, now, now);
  insertRouteStmt.run('route-demo-C', 'area-demo-15A', 'RT-15A-01', 'Greenfield Avenue', null, sourceId, now, now);
  insertRouteStmt.run('route-demo-D', 'area-demo-15A', 'RT-15A-02', 'Lake View Lane', null, sourceId, now, now);

  // 5. Seed Vehicles & Personnel
  const insertVehicleStmt = db.prepare(`INSERT INTO vehicles VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  insertVehicleStmt.run('veh-demo-01', 'DL-01-GA-1001', 'COMPACTOR', 6.5, 'ACTIVE', sourceId, now, now);
  insertVehicleStmt.run('veh-demo-02', 'DL-01-GA-1002', 'TIPPER', 3.5, 'ACTIVE', sourceId, now, now);
  insertVehicleStmt.run('veh-demo-03', 'DL-01-GA-1003', 'AUTO_TIPPER', 1.2, 'MAINTENANCE', sourceId, now, now);
  insertVehicleStmt.run('veh-demo-04', 'DL-01-GA-1004', 'COMPACTOR', 6.5, 'ACTIVE', sourceId, now, now);

  const insertWorkerStmt = db.prepare(`INSERT INTO workers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertWorkerStmt.run('wrk-demo-01', 'EMP-DRV-001', 'Ramesh Kumar', 'DRIVER', '+91 98****1001', 1, sourceId, now, now);
  insertWorkerStmt.run('wrk-demo-02', 'EMP-DRV-002', 'Arun Varma', 'DRIVER', '+91 98****1002', 1, sourceId, now, now);
  insertWorkerStmt.run('wrk-demo-03', 'EMP-SAN-001', 'Suresh Patel', 'SANITARY_WORKER', '+91 98****2001', 1, sourceId, now, now);
  insertWorkerStmt.run('wrk-demo-04', 'EMP-SAN-002', 'Deepak Yadav', 'SANITARY_WORKER', '+91 98****2002', 1, sourceId, now, now);
  insertWorkerStmt.run('wrk-demo-05', 'EMP-SUP-001', 'Ravi Shankar', 'SUPERVISOR', '+91 98****3001', 1, sourceId, now, now);

  // 6. SCENARIO 6: Master Assignments with Historical Records (Temporal Versioning)
  const insertMasterStmt = db.prepare(`
    INSERT INTO master_assignments (id, route_id, vehicle_id, driver_id, supervisor_id, valid_from, valid_to, is_current, source_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // Historical past assignment: Vehicle 1 was on Route B from Jan to June 2026
  insertMasterStmt.run('ma-hist-01', 'route-demo-B', 'veh-demo-01', 'wrk-demo-01', 'wrk-demo-05', '2026-01-01', '2026-06-30', 0, sourceId, now);
  // Current assignment: Vehicle 1 is on Route A from July 2026 to present
  insertMasterStmt.run('ma-curr-01', 'route-demo-A', 'veh-demo-01', 'wrk-demo-01', 'wrk-demo-05', '2026-07-01', null, 1, sourceId, now);
  // Current assignment: Vehicle 2 on Route B
  insertMasterStmt.run('ma-curr-02', 'route-demo-B', 'veh-demo-02', 'wrk-demo-02', 'wrk-demo-05', '2026-07-01', null, 1, sourceId, now);
  // Current assignment: Vehicle 4 on Route C
  insertMasterStmt.run('ma-curr-03', 'route-demo-C', 'veh-demo-04', 'wrk-demo-01', 'wrk-demo-05', '2026-07-01', null, 1, sourceId, now);

  // 7. Seed Households across routes
  const insertHouseStmt = db.prepare(`
    INSERT INTO households (id, route_id, service_uid, resident_name, phone_masked, address_line, latitude, longitude, nfc_tag_uid, qr_code_uid, is_active, source_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `);

  // Route A (Gandhi Road) - 10 Households (Normal Complete Scenario)
  for (let i = 1; i <= 10; i++) {
    const pad = String(i).padStart(2, '0');
    insertHouseStmt.run(
      `house-demo-1${pad}`,
      'route-demo-A',
      `H-14A-${pad}`,
      `Resident 14A-${pad}`,
      `+91 98****11${pad}`,
      `${i}, Gandhi Road Commercial Corridor, Ward 14`,
      28.6139 + (i * 0.0005),
      77.2090 + (i * 0.0005),
      `NFC-TAG-14A-${pad}`,
      `QR-CODE-14A-${pad}`,
      sourceId, now, now
    );
  }

  // Route B (Station Colony) - 10 Households (Breakdown / Incomplete Scenario)
  for (let i = 1; i <= 10; i++) {
    const pad = String(i).padStart(2, '0');
    insertHouseStmt.run(
      `house-demo-2${pad}`,
      'route-demo-B',
      `H-14B-${pad}`,
      `Resident 14B-${pad}`,
      `+91 98****12${pad}`,
      `${i}, Station Colony Lane, Ward 14`,
      28.6200 + (i * 0.0004),
      77.2150 + (i * 0.0004),
      `NFC-TAG-14B-${pad}`,
      `QR-CODE-14B-${pad}`,
      sourceId, now, now
    );
  }

  // Route C (Greenfield Avenue) - 5 Households (Complaint & Discrepancy Scenario)
  for (let i = 1; i <= 5; i++) {
    const pad = String(i).padStart(2, '0');
    insertHouseStmt.run(
      `house-demo-3${pad}`,
      'route-demo-C',
      `H-15A-${pad}`,
      `Resident 15A-${pad}`,
      `+91 98****13${pad}`,
      `${i}, Greenfield Avenue, Ward 15`,
      28.6300 + (i * 0.0003),
      77.2200 + (i * 0.0003),
      `NFC-TAG-15A-${pad}`,
      `QR-CODE-15A-${pad}`,
      sourceId, now, now
    );
  }

  // 8. SCENARIO 1: Normal Complete Route (Route A)
  const insertDailyAssignStmt = db.prepare(`
    INSERT INTO daily_assignments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertDailyAssignStmt.run(
    'da-demo-01', serviceDate, 'route-demo-A', 'veh-demo-01', 'wrk-demo-01', 'wrk-demo-05',
    '2026-09-14T06:00:00.000Z', 'COMPLETED', 'Regular morning collection', sourceId, now, 'usr-sup-01'
  );

  const insertAssignWorkerStmt = db.prepare(`INSERT INTO assignment_workers VALUES (?, ?, ?, ?, ?)`);
  insertAssignWorkerStmt.run('aw-demo-01', 'da-demo-01', 'wrk-demo-03', 'PRESENT', sourceId);
  insertAssignWorkerStmt.run('aw-demo-02', 'da-demo-01', 'wrk-demo-04', 'PRESENT', sourceId);

  const insertRunStmt = db.prepare(`INSERT INTO daily_service_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertRunStmt.run(
    'run-demo-01', 'da-demo-01', '2026-09-14T06:15:00.000Z', '2026-09-14T08:30:00.000Z',
    'COMPLETED', 100.00, sourceId, now, now
  );

  const insertEvidenceStmt = db.prepare(`
    INSERT INTO service_evidence VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCollRecordStmt = db.prepare(`
    INSERT INTO collection_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Log physical doorstep scans for all 10 households on Route A
  for (let i = 1; i <= 10; i++) {
    const pad = String(i).padStart(2, '0');
    const scanTime = `2026-09-14T06:${15 + (i * 6)}:00.000Z`;
    insertEvidenceStmt.run(
      `ev-demo-1${pad}`, 'run-demo-01', `house-demo-1${pad}`, EvidenceType.DOORSTEP_NFC_TAP,
      scanTime, 'DEVICE-HANDHELD-01', 'wrk-demo-03', null, sourceId, now
    );
    insertCollRecordStmt.run(
      `cr-demo-1${pad}`, 'run-demo-01', `house-demo-1${pad}`, VerificationStatus.VERIFIED,
      null, scanTime, sourceId, now, now
    );
  }

  // 9. SCENARIO 2: Incomplete Route Due to Vehicle Breakdown (Route B)
  insertDailyAssignStmt.run(
    'da-demo-02', serviceDate, 'route-demo-B', 'veh-demo-02', 'wrk-demo-02', 'wrk-demo-05',
    '2026-09-14T06:30:00.000Z', 'IN_PROGRESS', 'Mechanical clutch failure midway', sourceId, now, 'usr-sup-01'
  );
  insertAssignWorkerStmt.run('aw-demo-03', 'da-demo-02', 'wrk-demo-03', 'PRESENT', sourceId);

  insertRunStmt.run(
    'run-demo-02', 'da-demo-02', '2026-09-14T06:45:00.000Z', null,
    'INCOMPLETE', 30.00, sourceId, now, now
  );

  // Serviced first 3 households before breakdown
  for (let i = 1; i <= 3; i++) {
    const pad = String(i).padStart(2, '0');
    const scanTime = `2026-09-14T06:${45 + (i * 5)}:00.000Z`;
    insertEvidenceStmt.run(
      `ev-demo-2${pad}`, 'run-demo-02', `house-demo-2${pad}`, EvidenceType.DOORSTEP_QR_SCAN,
      scanTime, 'DEVICE-HANDHELD-02', 'wrk-demo-03', null, sourceId, now
    );
    insertCollRecordStmt.run(
      `cr-demo-2${pad}`, 'run-demo-02', `house-demo-2${pad}`, VerificationStatus.VERIFIED,
      null, scanTime, sourceId, now, now
    );
  }
  // Remaining 7 households are NOT_VERIFIED
  for (let i = 4; i <= 10; i++) {
    const pad = String(i).padStart(2, '0');
    insertCollRecordStmt.run(
      `cr-demo-2${pad}`, 'run-demo-02', `house-demo-2${pad}`, VerificationStatus.NOT_VERIFIED,
      'Vehicle breakdown before reaching street', null, sourceId, now, now
    );
  }

  // 10. SCENARIO 3: Missed-Collection Citizen Complaint causing DISPUTED status (Route C)
  insertDailyAssignStmt.run(
    'da-demo-03', serviceDate, 'route-demo-C', 'veh-demo-04', 'wrk-demo-01', 'wrk-demo-05',
    '2026-09-14T07:00:00.000Z', 'COMPLETED', 'Greenfield run', sourceId, now, 'usr-sup-02'
  );
  insertRunStmt.run(
    'run-demo-03', 'da-demo-03', '2026-09-14T07:10:00.000Z', '2026-09-14T08:15:00.000Z',
    'COMPLETED', 80.00, sourceId, now, now
  );

  // Crew logged physical scan for house 301
  insertEvidenceStmt.run(
    'ev-demo-301', 'run-demo-03', 'house-demo-301', EvidenceType.DOORSTEP_NFC_TAP,
    '2026-09-14T07:20:00.000Z', 'DEVICE-HANDHELD-01', 'wrk-demo-03', null, sourceId, now
  );
  // Citizen Priya Sharma filed complaint that collection was missed!
  const insertComplaintStmt = db.prepare(`INSERT INTO complaints VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertComplaintStmt.run(
    'comp-demo-01', 'house-demo-301', serviceDate, 'MISSED_COLLECTION',
    'Bins remained on kerbside; vehicle did not stop at premises.', 'SUBMITTED',
    '2026-09-14T09:30:00.000Z', null, null, null, sourceId
  );
  // Record enters DISPUTED state
  insertCollRecordStmt.run(
    'cr-demo-301', 'run-demo-03', 'house-demo-301', VerificationStatus.DISPUTED,
    'Crew marked collected but citizen filed missed-collection complaint', '2026-09-14T07:20:00.000Z', sourceId, now, now
  );

  // 11. SCENARIO 7: Observed Vehicle Activity Without Sufficient Evidence (Route C, House 302)
  insertEvidenceStmt.run(
    'ev-demo-302', 'run-demo-03', 'house-demo-302', EvidenceType.VEHICLE_PROXIMITY_CORRIDOR,
    '2026-09-14T07:25:00.000Z', 'VEHICLE-TELEMETRY-04', null,
    JSON.stringify({ note: 'Vehicle entered street corridor; no doorstep interaction' }), sourceId, now
  );
  insertCollRecordStmt.run(
    'cr-demo-302', 'run-demo-03', 'house-demo-302', VerificationStatus.OBSERVED,
    'Collection cannot be independently proven with the currently available data.', null, sourceId, now, now
  );

  // 12. Payment Obligations & Configurable Ledger
  const insertObligationStmt = db.prepare(`
    INSERT INTO payment_obligations (
      id, household_id, obligation_type, amount_paise, billing_period,
      beneficiary_model, is_active, beneficiary_driver_id, source_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // Route A houses have 100.00 INR (10000 paise) monthly fee with assigned route driver Ramesh Kumar (wrk-demo-01)
  insertObligationStmt.run('ob-demo-101', 'house-demo-101', PaymentObligationType.MONTHLY_CONTRIBUTION, 10000, '2026-09', PaymentBeneficiaryType.DESIGNATED_WORKER_ACCOUNT, 1, 'wrk-demo-01', sourceId, now);
  insertObligationStmt.run('ob-demo-102', 'house-demo-102', PaymentObligationType.MONTHLY_CONTRIBUTION, 10000, '2026-09', PaymentBeneficiaryType.DESIGNATED_WORKER_ACCOUNT, 1, 'wrk-demo-01', sourceId, now);
  insertObligationStmt.run('ob-demo-103', 'house-demo-103', PaymentObligationType.MONTHLY_CONTRIBUTION, 10000, '2026-09', PaymentBeneficiaryType.DESIGNATED_WORKER_ACCOUNT, 1, 'wrk-demo-01', sourceId, now);

  const insertPayStmt = db.prepare(`
    INSERT INTO resident_payments (
      id, household_id, obligation_id, amount_paise, currency, payment_method,
      provider_name, provider_transaction_ref, idempotency_key, status,
      initiated_at, confirmed_at, beneficiary_type, beneficiary_driver_id, source_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRecStmt = db.prepare(`
    INSERT INTO payment_reconciliations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Successful & Reconciled Payment (House 101) - Driver Ramesh Kumar
  insertPayStmt.run(
    'pay-demo-101', 'house-demo-101', 'ob-demo-101', 10000, 'INR', 'UPI',
    'SBI_EPAY', 'SBI-UPI-20260914-1001', 'IDEM-KEY-DEMO-101', PaymentStatus.RECONCILIATION_MATCHED,
    '2026-09-14T08:00:00.000Z', '2026-09-14T08:01:30.000Z', PaymentBeneficiaryType.DESIGNATED_WORKER_ACCOUNT, 'wrk-demo-01', sourceId
  );
  insertRecStmt.run(
    'rec-demo-101', 'pay-demo-101', 'BANK-STMT-20260914-001', 10000,
    ReconciliationStatus.MATCHED, '2026-09-14T10:00:00.000Z', 'usr-admin-01', 'Exact match with bank scroll', sourceId
  );

  // SCENARIO 4: Payment Reconciliation Mismatch (House 102) - Driver Ramesh Kumar
  // Confirmed at 100.00 INR (10000 paise), but bank statement only deposited 80.00 INR (8000 paise)
  insertPayStmt.run(
    'pay-demo-102', 'house-demo-102', 'ob-demo-102', 10000, 'INR', 'NET_BANKING',
    'SBI_EPAY', 'SBI-NB-20260914-1002', 'IDEM-KEY-DEMO-102', PaymentStatus.RECONCILIATION_MISMATCH,
    '2026-09-14T08:30:00.000Z', '2026-09-14T08:32:00.000Z', PaymentBeneficiaryType.DESIGNATED_WORKER_ACCOUNT, 'wrk-demo-01', sourceId
  );
  insertRecStmt.run(
    'rec-demo-102', 'pay-demo-102', 'BANK-STMT-20260914-002', 8000, // MISMATCH (2000 paise discrepancy)
    ReconciliationStatus.UNMATCHED_AMOUNT, '2026-09-14T10:15:00.000Z', 'usr-admin-01', 'Deposit amount short by 20.00 INR', sourceId
  );

  // SCENARIO 5: Pending / Failed Payment (House 103) - Driver Ramesh Kumar
  insertPayStmt.run(
    'pay-demo-103', 'house-demo-103', 'ob-demo-103', 10000, 'INR', 'CARD',
    'SBI_EPAY', null, 'IDEM-KEY-DEMO-103', PaymentStatus.PENDING_PROVIDER,
    '2026-09-14T09:00:00.000Z', null, PaymentBeneficiaryType.DESIGNATED_WORKER_ACCOUNT, 'wrk-demo-01', sourceId
  );

  // 13. Deterministic Seed Operational Anomalies
  const insertAnomalyStmt = db.prepare(`
    INSERT INTO operational_anomalies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // ANOM-03 for disputed collection in Scenario 3
  insertAnomalyStmt.run(
    'anom-demo-01', 'run-demo-03', 'ANOM-03', AnomalySeverity.MEDIUM,
    'Discrepancy: Collection marked VERIFIED by crew, but resident filed missed-collection complaint.',
    JSON.stringify({ household_id: 'house-demo-301', complaint_id: 'comp-demo-01' }),
    AnomalyStatus.UNRESOLVED, '2026-09-14T09:30:05.000Z', null, null, sourceId
  );
  // ANOM-05 for bank settlement discrepancy in Scenario 4
  insertAnomalyStmt.run(
    'anom-demo-02', null, 'ANOM-05', AnomalySeverity.CRITICAL,
    'Bank deposit amount differs from gateway settlement amount by -20.00 INR.',
    JSON.stringify({ payment_id: 'pay-demo-102', reconciliation_id: 'rec-demo-102', delta_paise: -2000 }),
    AnomalyStatus.UNRESOLVED, '2026-09-14T10:15:05.000Z', null, null, sourceId
  );

  return {
    sourceId,
    wardsCount: 2,
    routesCount: 4,
    householdsCount: 25,
    usersCount: users.length
  };
}

// Support CLI execution
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  try {
    console.log('[SEED] Running deterministic municipal scenario seeder...');
    const result = runSeed();
    console.log('[SEED] Deterministic seeding completed successfully:');
    console.log(`  - Data Source ID (SIMULATED_DEMO_DATA): ${result.sourceId}`);
    console.log(`  - Wards: ${result.wardsCount}`);
    console.log(`  - Routes: ${result.routesCount}`);
    console.log(`  - Households: ${result.householdsCount}`);
    console.log(`  - Users Seeded: ${result.usersCount}`);
  } catch (error) {
    console.error('[SEED_ERROR] Failed to seed database:', error);
    process.exit(1);
  }
}
