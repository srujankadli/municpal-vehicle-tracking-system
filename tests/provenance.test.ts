import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runSeed } from '../src/db/seed.js';
import { ProvenanceService } from '../src/services/provenance.service.js';
import { DataClassification, SourceType } from '../src/types/domain.js';

describe('Data Provenance & Classification Engine', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    runSeed(db);
  });

  it('answers "Where did this data originate?" for all seeded entities', () => {
    // Check that all households reference a valid data_source
    const stmt = db.prepare(`
      SELECT h.id, h.service_uid, ds.classification, ds.provider_name, ds.source_type
      FROM households h
      JOIN data_sources ds ON h.source_id = ds.id
    `);
    const rows = stmt.all() as { classification: string; provider_name: string; source_type: string }[];
    assert.ok(rows.length > 0, 'Should have seeded households');

    for (const row of rows) {
      assert.equal(row.classification, DataClassification.SIMULATED_DEMO_DATA);
      assert.equal(row.source_type, SourceType.SYNTHETIC_SEEDER);
      assert.match(row.provider_name, /Deterministic Municipal Scenario Seeder/);
    }
  });

  it('ensures 100% of seeded operational and payment records have SIMULATED_DEMO_DATA classification', () => {
    // Check payments
    const payStmt = db.prepare(`
      SELECT p.id, ds.classification
      FROM resident_payments p
      JOIN data_sources ds ON p.source_id = ds.id
    `);
    const payments = payStmt.all() as { classification: string }[];
    assert.ok(payments.length > 0);
    for (const p of payments) {
      assert.equal(p.classification, DataClassification.SIMULATED_DEMO_DATA);
    }

    // Check collection records
    const collStmt = db.prepare(`
      SELECT cr.id, ds.classification
      FROM collection_records cr
      JOIN data_sources ds ON cr.source_id = ds.id
    `);
    const records = collStmt.all() as { classification: string }[];
    assert.ok(records.length > 0);
    for (const r of records) {
      assert.equal(r.classification, DataClassification.SIMULATED_DEMO_DATA);
    }
  });

  it('registers new real-data provenance sources correctly', () => {
    const provenance = new ProvenanceService(db);
    const source = provenance.registerDataSource({
      source_type: SourceType.PAYMENT_GATEWAY,
      classification: DataClassification.REAL_DATA,
      provider_name: 'Authorised State Treasury Payment Gateway',
      external_reference_id: 'TREASURY-GW-PROD-01'
    });

    assert.ok(source.id);
    assert.equal(source.classification, DataClassification.REAL_DATA);
    assert.equal(source.source_type, SourceType.PAYMENT_GATEWAY);

    const fetched = provenance.getDataSource(source.id);
    assert.deepEqual(fetched, source);
  });
});
