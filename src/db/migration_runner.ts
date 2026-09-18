/**
 * Dual-Dialect Migration Runner & Schema Validator
 * Phase 3 — Production Readiness & Persistence Hardening (Batch 2)
 *
 * Provides deterministic forward migration execution, transactional safety,
 * schema_migrations infrastructure tracking, and domain table validation
 * across both SQLite and PostgreSQL persistence adapters.
 */

import { DatabaseSync } from 'node:sqlite';
import type { IDatabaseAdapter } from './adapters/types.js';
import { SQLiteAdapter } from './adapters/sqlite.adapter.js';
import {
  getOrderedMigrations,
  type MigrationRecord,
  type MigrationStatus,
  type MigrationResult,
  type SchemaValidationResult
} from './migrations/index.js';

/**
 * Authoritative set of the 21 domain tables.
 * Guaranteed invariant across all Phase 1–Phase 3 operations.
 */
export const DOMAIN_TABLES: readonly string[] = [
  'data_sources',
  'users',
  'wards',
  'areas',
  'routes',
  'households',
  'vehicles',
  'workers',
  'master_assignments',
  'daily_assignments',
  'assignment_workers',
  'daily_service_runs',
  'service_evidence',
  'collection_records',
  'complaints',
  'payment_obligations',
  'resident_payments',
  'payment_reconciliations',
  'audit_events',
  'operational_anomalies',
  'telemetry_events'
] as const;

export const INFRASTRUCTURE_TABLES: readonly string[] = [
  'schema_migrations'
] as const;

/**
 * Ensures the infrastructure metadata table exists.
 * Does not insert or touch domain business data.
 */
export async function ensureMetadataTable(adapter: IDatabaseAdapter): Promise<void> {
  if (adapter.clientType === 'sqlite') {
    adapter.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
          version TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL,
          checksum TEXT
      );
    `);
  } else if (adapter.clientType === 'postgres') {
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          checksum VARCHAR(64)
      );
    `);
  }
}

/**
 * Ensures the infrastructure metadata table exists synchronously for SQLite.
 */
export function ensureMetadataTableSync(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        checksum TEXT
    );
  `);
}

/**
 * Fetch all applied migrations from schema_migrations table.
 */
export async function getAppliedMigrations(adapter: IDatabaseAdapter): Promise<MigrationRecord[]> {
  await ensureMetadataTable(adapter);

  const result = await adapter.query<MigrationRecord>(
    'SELECT version, name, applied_at, checksum FROM schema_migrations ORDER BY version ASC;'
  );

  return result.rows;
}

/**
 * Fetch all applied migrations synchronously for SQLite.
 */
export function getAppliedMigrationsSync(db: DatabaseSync): MigrationRecord[] {
  ensureMetadataTableSync(db);
  const stmt = db.prepare('SELECT version, name, applied_at, checksum FROM schema_migrations ORDER BY version ASC;');
  return stmt.all() as unknown as MigrationRecord[];
}

/**
 * Inspect migration status: lists all registered migrations and their applied/pending state.
 */
export async function getMigrationStatus(adapter: IDatabaseAdapter): Promise<MigrationStatus[]> {
  const registered = getOrderedMigrations();
  const applied = await getAppliedMigrations(adapter);
  const appliedMap = new Map(applied.map(m => [m.version, m]));

  return registered.map(m => {
    const record = appliedMap.get(m.version);
    return {
      version: m.version,
      name: m.name,
      status: record ? 'APPLIED' : 'PENDING',
      applied_at: record ? record.applied_at : null
    };
  });
}

/**
 * Execute all pending forward migrations in deterministic version order.
 * Wraps each migration in an atomic transaction.
 * Validates domain schema upon completion.
 */
export async function runPendingMigrations(adapter: IDatabaseAdapter): Promise<MigrationResult> {
  await ensureMetadataTable(adapter);

  const registered = getOrderedMigrations();
  const applied = await getAppliedMigrations(adapter);
  const appliedVersions = new Set(applied.map(m => m.version));

  const pending = registered.filter(m => !appliedVersions.has(m.version));
  const newlyAppliedVersions: string[] = [];

  for (const migration of pending) {
    // Transactional execution per migration
    await adapter.transaction(async (txAdapter) => {
      // 1. Execute DDL
      await migration.up(txAdapter);

      // 2. Record successful migration metadata
      const appliedAt = new Date().toISOString();
      const insertSql = 'INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?);';

      if (txAdapter.clientType === 'sqlite') {
        const sqliteAdapter = txAdapter as SQLiteAdapter;
        sqliteAdapter.prepare(insertSql).run(migration.version, migration.name, appliedAt, null);
      } else {
        await txAdapter.query(insertSql, [migration.version, migration.name, appliedAt, null]);
      }
    });

    newlyAppliedVersions.push(migration.version);
  }

  // Validate resulting schema after migration
  const validation = await validateDomainSchema(adapter);
  if (!validation.valid) {
    throw new Error(`[MIGRATION_VALIDATION_FAILED] Schema incomplete after migrations: ${validation.errors.join('; ')}`);
  }

  return {
    appliedCount: newlyAppliedVersions.length,
    appliedVersions: newlyAppliedVersions,
    alreadyAppliedCount: applied.length,
    totalMigrations: registered.length
  };
}

/**
 * Execute migrations synchronously on SQLite DatabaseSync.
 * Guarantees 100% backward compatibility for existing in-memory tests and scripts.
 */
export function runMigrationsSync(db: DatabaseSync): MigrationResult {
  ensureMetadataTableSync(db);

  const registered = getOrderedMigrations();
  const applied = getAppliedMigrationsSync(db);
  const appliedVersions = new Set(applied.map(m => m.version));

  const pending = registered.filter(m => !appliedVersions.has(m.version));
  const newlyAppliedVersions: string[] = [];
  const adapter = new SQLiteAdapter(db);

  for (const migration of pending) {
    db.exec('BEGIN TRANSACTION;');
    try {
      // 1. Execute DDL
      migration.up(adapter);

      // 2. Record migration
      const appliedAt = new Date().toISOString();
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?);').run(
        migration.version,
        migration.name,
        appliedAt,
        null
      );

      db.exec('COMMIT;');
      newlyAppliedVersions.push(migration.version);
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // secondary rollback ignore
      }
      throw err;
    }
  }

  const validation = validateDomainSchemaSync(db);
  if (!validation.valid) {
    throw new Error(`[MIGRATION_VALIDATION_FAILED] Schema incomplete: ${validation.errors.join('; ')}`);
  }

  return {
    appliedCount: newlyAppliedVersions.length,
    appliedVersions: newlyAppliedVersions,
    alreadyAppliedCount: applied.length,
    totalMigrations: registered.length
  };
}

/**
 * Inspects database metadata and confirms the presence of all 21 domain tables
 * plus the 1 infrastructure schema_migrations table.
 */
export async function validateDomainSchema(adapter: IDatabaseAdapter): Promise<SchemaValidationResult> {
  let existingTables: string[] = [];

  if (adapter.clientType === 'sqlite') {
    const res = await adapter.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';"
    );
    existingTables = res.rows.map(r => r.name);
  } else if (adapter.clientType === 'postgres') {
    const res = await adapter.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
    );
    existingTables = res.rows.map(r => r.table_name);
  }

  const existingSet = new Set(existingTables);
  const domainTablesFound = DOMAIN_TABLES.filter(t => existingSet.has(t));
  const missingDomainTables = DOMAIN_TABLES.filter(t => !existingSet.has(t));
  const infrastructureTablesFound = INFRASTRUCTURE_TABLES.filter(t => existingSet.has(t));

  const errors: string[] = [];
  if (missingDomainTables.length > 0) {
    errors.push(`Missing domain tables (${missingDomainTables.length}): ${missingDomainTables.join(', ')}`);
  }
  if (!existingSet.has('schema_migrations')) {
    errors.push('Missing infrastructure metadata table: schema_migrations');
  }

  return {
    valid: missingDomainTables.length === 0 && existingSet.has('schema_migrations'),
    tableCount: existingTables.length,
    domainTablesFound,
    missingDomainTables,
    infrastructureTablesFound,
    errors
  };
}

/**
 * Validates domain schema synchronously on SQLite DatabaseSync.
 */
export function validateDomainSchemaSync(db: DatabaseSync): SchemaValidationResult {
  const rows = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';"
  ).all() as unknown as Array<{ name: string }>;

  const existingTables = rows.map(r => r.name);
  const existingSet = new Set(existingTables);

  const domainTablesFound = DOMAIN_TABLES.filter(t => existingSet.has(t));
  const missingDomainTables = DOMAIN_TABLES.filter(t => !existingSet.has(t));
  const infrastructureTablesFound = INFRASTRUCTURE_TABLES.filter(t => existingSet.has(t));

  const errors: string[] = [];
  if (missingDomainTables.length > 0) {
    errors.push(`Missing domain tables (${missingDomainTables.length}): ${missingDomainTables.join(', ')}`);
  }
  if (!existingSet.has('schema_migrations')) {
    errors.push('Missing infrastructure metadata table: schema_migrations');
  }

  return {
    valid: missingDomainTables.length === 0 && existingSet.has('schema_migrations'),
    tableCount: existingTables.length,
    domainTablesFound,
    missingDomainTables,
    infrastructureTablesFound,
    errors
  };
}
