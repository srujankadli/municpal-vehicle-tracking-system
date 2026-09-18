import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runSeed } from '../src/db/seed.js';
import { MetricsService } from '../src/services/metrics.service.js';

describe('Deterministic Mathematical Metrics Engine', () => {
  let db: DatabaseSync;
  let metrics: MetricsService;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    runSeed(db);
    metrics = new MetricsService(db);
  });

  describe('Metric 1: Route Completion Rate (RC)', () => {
    it('calculates 100% completion for fully verified route (Route A)', () => {
      const result = metrics.calculateRouteCompletionRate('run-demo-01');
      assert.equal(result.numerator, 10);
      assert.equal(result.denominator, 10);
      assert.equal(result.value_percentage, 100.00);
      assert.equal(result.formula, 'RC = ((H_verified + H_exception) / H_scheduled) * 100%');
    });

    it('calculates exact partial completion for incomplete route (Route B: 30%)', () => {
      const result = metrics.calculateRouteCompletionRate('run-demo-02');
      assert.equal(result.numerator, 3);
      assert.equal(result.denominator, 10);
      assert.equal(result.value_percentage, 30.00);
    });

    it('handles zero scheduled households gracefully returning 0.00%', () => {
      // Empty route D
      const now = new Date().toISOString();
      const srcRow = db.prepare(`SELECT id FROM data_sources LIMIT 1`).get() as { id: string };
      db.prepare(`
        INSERT INTO daily_assignments VALUES (
          'da-empty', '2026-09-14', 'route-demo-D', 'veh-demo-01',
          'wrk-demo-01', 'wrk-demo-05', '2026-09-14T06:00:00Z', 'COMPLETED', null, ?, ?, 'usr-admin-01'
        )
      `).run(srcRow.id, now);
      db.prepare(`
        INSERT INTO daily_service_runs VALUES (
          'run-empty', 'da-empty', null, null, 'COMPLETED', 0.00, ?, ?, ?
        )
      `).run(srcRow.id, now, now);

      const result = metrics.calculateRouteCompletionRate('run-empty');
      assert.equal(result.value_percentage, 0.00);
      assert.equal(result.denominator, 0);
    });
  });

  describe('Metric 2: Service Discrepancy Rate (SDR)', () => {
    it('calculates 0% discrepancy when no missed collections reported (Route A)', () => {
      const result = metrics.calculateServiceDiscrepancyRate('run-demo-01');
      assert.equal(result.value_percentage, 0.00);
      assert.equal(result.numerator, 0);
      assert.equal(result.denominator, 10);
    });

    it('calculates exact discrepancy for route with citizen complaint (Route C: 20%)', () => {
      // Route C has 5 households; house-demo-301 has a disputed complaint
      const result = metrics.calculateServiceDiscrepancyRate('run-demo-03');
      assert.equal(result.numerator, 1);
      assert.equal(result.denominator, 5);
      assert.equal(result.value_percentage, 20.00);
    });
  });

  describe('Metric 3: Fleet Operational Availability (FOA)', () => {
    it('calculates FOA accurately on service date', () => {
      // Seeded: 4 operable vehicles (DL-01, DL-02, DL-03 maintenance, DL-04 active).
      // Active runs on 2026-09-14: veh-demo-01, veh-demo-02, veh-demo-04 = 3 active out of 4 operable = 75.00%
      const result = metrics.calculateFleetOperationalAvailability('2026-09-14');
      assert.equal(result.numerator, 3);
      assert.equal(result.denominator, 4);
      assert.equal(result.value_percentage, 75.00);
    });

    it('handles zero operable vehicles returning 0.00%', () => {
      const emptyDb = new DatabaseSync(':memory:');
      const emptyMetrics = new MetricsService(emptyDb);
      emptyDb.exec(`
        CREATE TABLE vehicles (id TEXT, operational_status TEXT); 
        CREATE TABLE daily_assignments (id TEXT, vehicle_id TEXT, service_date TEXT); 
        CREATE TABLE daily_service_runs (id TEXT, assignment_id TEXT, run_status TEXT);
      `);
      const result = emptyMetrics.calculateFleetOperationalAvailability('2026-09-14');
      assert.equal(result.value_percentage, 0.00);
      assert.equal(result.denominator, 0);
    });
  });

  describe('Metric 4: Collection Reconciliation Ratio (CRR)', () => {
    it('calculates CRR in exact integer paise without floating-point errors', () => {
      // Billed: 3 obligations * 10000 paise = 30000 paise (300.00 INR)
      // Confirmed & MATCHED: pay-demo-101 = 10000 paise (100.00 INR)
      // Ratio: (10000 / 30000) * 100 = 33.33%
      const result = metrics.calculateCollectionReconciliationRatio('2026-09');
      assert.equal(result.numerator, 10000);
      assert.equal(result.denominator, 30000);
      assert.equal(result.value_percentage, 33.33);
      assert.equal(result.metadata?.reconciled_inr, '100.00');
      assert.equal(result.metadata?.billed_inr, '300.00');
    });
  });
});
