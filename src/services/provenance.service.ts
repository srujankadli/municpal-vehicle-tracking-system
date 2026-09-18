import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.js';
import { DataClassification, SourceType, type DataSourceRecord } from '../types/domain.js';

export class ProvenanceService {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  public registerDataSource(params: {
    source_type: SourceType;
    classification: DataClassification;
    provider_name: string;
    external_reference_id?: string | null;
    ingested_by?: string | null;
    integrity_checksum?: string | null;
    metadata_json?: string | null;
  }): DataSourceRecord {
    const id = crypto.randomUUID();
    const ingested_at = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO data_sources (
        id, source_type, classification, provider_name,
        external_reference_id, ingested_at, ingested_by,
        integrity_checksum, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      params.source_type,
      params.classification,
      params.provider_name,
      params.external_reference_id || null,
      ingested_at,
      params.ingested_by || null,
      params.integrity_checksum || null,
      params.metadata_json || null
    );

    return {
      id,
      source_type: params.source_type,
      classification: params.classification,
      provider_name: params.provider_name,
      external_reference_id: params.external_reference_id || null,
      ingested_at,
      ingested_by: params.ingested_by || null,
      integrity_checksum: params.integrity_checksum || null,
      metadata_json: params.metadata_json || null
    };
  }

  public getDataSource(id: string): DataSourceRecord | null {
    const stmt = this.db.prepare(`SELECT * FROM data_sources WHERE id = ?`);
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;

    return {
      id: String(row.id),
      source_type: row.source_type as SourceType,
      classification: row.classification as DataClassification,
      provider_name: String(row.provider_name),
      external_reference_id: row.external_reference_id ? String(row.external_reference_id) : null,
      ingested_at: String(row.ingested_at),
      ingested_by: row.ingested_by ? String(row.ingested_by) : null,
      integrity_checksum: row.integrity_checksum ? String(row.integrity_checksum) : null,
      metadata_json: row.metadata_json ? String(row.metadata_json) : null
    };
  }

  public getPrimaryDemoSourceId(): string {
    const stmt = this.db.prepare(`
      SELECT id FROM data_sources 
      WHERE classification = ? AND source_type = ? 
      ORDER BY ingested_at ASC LIMIT 1
    `);
    const row = stmt.get(DataClassification.SIMULATED_DEMO_DATA, SourceType.SYNTHETIC_SEEDER) as { id: string } | undefined;
    if (row) return row.id;

    const source = this.registerDataSource({
      source_type: SourceType.SYNTHETIC_SEEDER,
      classification: DataClassification.SIMULATED_DEMO_DATA,
      provider_name: 'Deterministic Municipal Scenario Seeder v1',
      external_reference_id: 'SEED-BATCH-001',
      metadata_json: JSON.stringify({ note: 'Used strictly for testing and simulation' })
    });
    return source.id;
  }
}
