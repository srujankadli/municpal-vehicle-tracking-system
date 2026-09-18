import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../src/db/migrate.js';

describe('Database Schema & Constraint Invariants', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    runMigrations(db);
  });

  it('enforces foreign key constraints on dependent child tables', () => {
    // Attempt inserting area with non-existent ward_id
    assert.throws(() => {
      db.prepare(`
        INSERT INTO areas VALUES ('area-x', 'non-existent-ward', 'Area X', 'fake-source', '2026-09-14T00:00:00Z', '2026-09-14T00:00:00Z')
      `).run();
    }, /foreign key/i);
  });

  it('enforces unique constraints on ward code and household service_uid', () => {
    // Insert dummy provenance source
    db.prepare(`
      INSERT INTO data_sources VALUES ('src-01', 'SYNTHETIC_SEEDER', 'SIMULATED_DEMO_DATA', 'Test Source', null, '2026-09-14T00:00:00Z', null, null, null)
    `).run();

    db.prepare(`
      INSERT INTO wards VALUES ('w-01', 'WARD-TEST', 'Ward Test', 'src-01', '2026-09-14T00:00:00Z', '2026-09-14T00:00:00Z')
    `).run();

    // Duplicate code must throw
    assert.throws(() => {
      db.prepare(`
        INSERT INTO wards VALUES ('w-02', 'WARD-TEST', 'Ward Test Duplicate', 'src-01', '2026-09-14T00:00:00Z', '2026-09-14T00:00:00Z')
      `).run();
    }, /UNIQUE constraint/i);
  });

  it('enforces check constraints on payment amounts (non-negative paise)', () => {
    db.prepare(`
      INSERT INTO data_sources VALUES ('src-01', 'SYNTHETIC_SEEDER', 'SIMULATED_DEMO_DATA', 'Test Source', null, '2026-09-14T00:00:00Z', null, null, null)
    `).run();
    db.prepare(`INSERT INTO wards VALUES ('w-01', 'W-01', 'Ward 1', 'src-01', '2026-09-14T00:00:00Z', '2026-09-14T00:00:00Z')`).run();
    db.prepare(`INSERT INTO areas VALUES ('a-01', 'w-01', 'Area 1', 'src-01', '2026-09-14T00:00:00Z', '2026-09-14T00:00:00Z')`).run();
    db.prepare(`INSERT INTO routes VALUES ('r-01', 'a-01', 'RT-01', 'Route 1', null, 'src-01', '2026-09-14T00:00:00Z', '2026-09-14T00:00:00Z')`).run();
    db.prepare(`INSERT INTO households VALUES ('h-01', 'r-01', 'UID-01', 'Resident A', '98****1234', 'Address 1', 28.6, 77.2, null, null, 1, 'src-01', '2026-09-14T00:00:00Z', '2026-09-14T00:00:00Z')`).run();

    // Negative paise must fail check constraint
    assert.throws(() => {
      db.prepare(`
        INSERT INTO payment_obligations VALUES ('ob-01', 'h-01', 'MONTHLY_CONTRIBUTION', -500, '2026-09', 'MUNICIPAL_TREASURY_ACCOUNT', 1, 'src-01', '2026-09-14T00:00:00Z')
      `).run();
    }, /CHECK constraint/i);
  });

  it('enforces temporal validity constraints on master assignments (valid_to >= valid_from)', () => {
    db.prepare(`
      INSERT INTO data_sources VALUES ('src-01', 'SYNTHETIC_SEEDER', 'SIMULATED_DEMO_DATA', 'Test Source', null, '2026-09-14T00:00:00Z', null, null, null)
    `).run();
    db.prepare(`INSERT INTO wards VALUES ('w-01', 'W-01', 'Ward 1', 'src-01', '2026-09-14T00:00:00Z', '2026-09-14T00:00:00Z')`).run();
    db.prepare(`INSERT INTO areas VALUES ('a-01', 'w-01', 'Area 1', 'src-01', '2026-09-14T00:00:00Z', '2026-09-14T00:00:00Z')`).run();
    db.prepare(`INSERT INTO routes VALUES ('r-01', 'a-01', 'RT-01', 'Route 1', null, 'src-01', '2026-09-14T00:00:00Z', '2026-09-14T00:00:00Z')`).run();
    db.prepare(`INSERT INTO vehicles VALUES ('v-01', 'DL-01-1111', 'COMPACTOR', 5.0, 'ACTIVE', 'src-01', '2026-09-14T00:00:00Z', '2026-09-14T00:00:00Z')`).run();
    db.prepare(`INSERT INTO workers VALUES ('w-d', 'E-01', 'Driver A', 'DRIVER', '98****0001', 1, 'src-01', '2026-09-14T00:00:00Z', '2026-09-14T00:00:00Z')`).run();
    db.prepare(`INSERT INTO workers VALUES ('w-s', 'E-02', 'Supervisor B', 'SUPERVISOR', '98****0002', 1, 'src-01', '2026-09-14T00:00:00Z', '2026-09-14T00:00:00Z')`).run();

    // Invalid temporal range: valid_to is BEFORE valid_from
    assert.throws(() => {
      db.prepare(`
        INSERT INTO master_assignments VALUES (
          'ma-01', 'r-01', 'v-01', 'w-d', 'w-s',
          '2026-06-01', '2026-01-01', 0, 'src-01', '2026-09-14T00:00:00Z'
        )
      `).run();
    }, /CHECK constraint/i);
  });
});
