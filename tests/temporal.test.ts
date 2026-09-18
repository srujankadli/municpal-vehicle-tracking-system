import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runSeed } from '../src/db/seed.js';

describe('Temporal Assignments & Historical Invariant Preservation', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    runSeed(db);
  });

  it('preserves historical past assignments when vehicle is reassigned', () => {
    // Check Vehicle 1 (veh-demo-01) history
    const stmt = db.prepare(`
      SELECT id, route_id, vehicle_id, valid_from, valid_to, is_current
      FROM master_assignments
      WHERE vehicle_id = 'veh-demo-01'
      ORDER BY valid_from ASC
    `);
    const history = stmt.all() as {
      id: string;
      route_id: string;
      valid_from: string;
      valid_to: string | null;
      is_current: number;
    }[];

    assert.equal(history.length, 2, 'Vehicle 1 should have exactly 2 historical assignment records');

    // Past assignment
    const past = history[0]!;
    assert.equal(past.route_id, 'route-demo-B');
    assert.equal(past.valid_from, '2026-01-01');
    assert.equal(past.valid_to, '2026-06-30');
    assert.equal(past.is_current, 0);

    // Current assignment
    const current = history[1]!;
    assert.equal(current.route_id, 'route-demo-A');
    assert.equal(current.valid_from, '2026-07-01');
    assert.equal(current.valid_to, null);
    assert.equal(current.is_current, 1);
  });

  it('reassigning vehicle to new route creates a new version without modifying past history', () => {
    const now = new Date().toISOString();
    // Simulate administrative reassignment of Vehicle 1 to Route C on 2026-10-01
    const closeCurrentStmt = db.prepare(`
      UPDATE master_assignments
      SET valid_to = '2026-09-30', is_current = 0
      WHERE id = 'ma-curr-01'
    `);
    closeCurrentStmt.run();

    const insertNewStmt = db.prepare(`
      INSERT INTO master_assignments (
        id, route_id, vehicle_id, driver_id, supervisor_id,
        valid_from, valid_to, is_current, source_id, created_at
      ) VALUES ('ma-new-01', 'route-demo-C', 'veh-demo-01', 'wrk-demo-01', 'wrk-demo-05', '2026-10-01', null, 1, 'src-test', ?)
    `);
    // Insert dummy source first if needed or use existing
    const srcRow = db.prepare(`SELECT id FROM data_sources LIMIT 1`).get() as { id: string };
    db.prepare(`
      INSERT INTO master_assignments (
        id, route_id, vehicle_id, driver_id, supervisor_id,
        valid_from, valid_to, is_current, source_id, created_at
      ) VALUES ('ma-new-01', 'route-demo-C', 'veh-demo-01', 'wrk-demo-01', 'wrk-demo-05', '2026-10-01', null, 1, ?, ?)
    `).run(srcRow.id, now);

    // Verify all 3 records exist and past records were not overwritten
    const stmt = db.prepare(`
      SELECT id, route_id, valid_from, valid_to, is_current
      FROM master_assignments
      WHERE vehicle_id = 'veh-demo-01'
      ORDER BY valid_from ASC
    `);
    const history = stmt.all() as { id: string; route_id: string; is_current: number }[];
    assert.equal(history.length, 3);
    assert.equal(history[0]!.route_id, 'route-demo-B');
    assert.equal(history[1]!.route_id, 'route-demo-A');
    assert.equal(history[2]!.route_id, 'route-demo-C');
    assert.equal(history[2]!.is_current, 1);
  });
});
