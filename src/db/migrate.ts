/**
 * Database Migration CLI & Runtime Migration Entrypoint
 * Phase 3 — Production Readiness & Persistence Hardening (Batch 2)
 *
 * Provides command-line interface for:
 *   - apply forward migrations (up)
 *   - inspect migration status (status)
 *   - validate established domain schema (validate)
 *
 * Preserves 100% backward compatibility for synchronous DatabaseSync invocations.
 */

import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase, getDatabaseAdapter } from './connection.js';
import type { IDatabaseAdapter } from './adapters/types.js';
import { SQLiteAdapter } from './adapters/sqlite.adapter.js';
import {
  runPendingMigrations,
  runMigrationsSync,
  getMigrationStatus,
  validateDomainSchema,
  DOMAIN_TABLES,
  INFRASTRUCTURE_TABLES
} from './migration_runner.js';
import type { MigrationResult, MigrationStatus, SchemaValidationResult } from './migrations/types.js';
export type { MigrationResult, MigrationStatus, SchemaValidationResult };

const __filename = fileURLToPath(import.meta.url);

/**
 * Backward-compatible synchronous migration runner for SQLite,
 * with polymorphic support for IDatabaseAdapter instances.
 */
export function runMigrations(dbInstance?: DatabaseSync | IDatabaseAdapter): MigrationResult {
  if (dbInstance && 'clientType' in dbInstance) {
    if (dbInstance.clientType === 'sqlite') {
      const sqliteAdapter = dbInstance as SQLiteAdapter;
      return runMigrationsSync(sqliteAdapter.getRawDatabase());
    }
    throw new Error('[MIGRATION_ERROR] Synchronous runMigrations cannot execute on non-sqlite adapter. Use runMigrationsAsync.');
  }

  const db = (dbInstance as DatabaseSync) || getDatabase();
  return runMigrationsSync(db);
}

/**
 * Asynchronous migration runner supporting both SQLite and PostgreSQL adapters.
 */
export async function runMigrationsAsync(adapter?: IDatabaseAdapter): Promise<MigrationResult> {
  const dbAdapter = adapter || getDatabaseAdapter();
  return runPendingMigrations(dbAdapter);
}

export { getMigrationStatus, validateDomainSchema, DOMAIN_TABLES, INFRASTRUCTURE_TABLES };

/**
 * CLI Execution Handler
 */
async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'up';

  // Production safety check: Disallow any destructive intent
  const destructiveFlags = ['reset', '--reset', 'drop', '--drop', 'truncate', '--truncate'];
  if (destructiveFlags.some(flag => args.includes(flag))) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[MIGRATION_BLOCKED] Destructive database operations are strictly forbidden in production environment.');
      process.exit(1);
    }
    console.error('[MIGRATION_ERROR] Destructive reset commands are disabled. Use deterministic forward migrations.');
    process.exit(1);
  }

  const adapter = getDatabaseAdapter();
  console.log(`[MIGRATION_CLI] Active persistence client: ${adapter.clientType}`);

  switch (command) {
    case 'up':
    case 'migrate': {
      console.log('[MIGRATION_CLI] Inspecting pending migrations...');
      const result = await runPendingMigrations(adapter);
      if (result.appliedCount === 0) {
        console.log(`[MIGRATION_CLI] Database is up to date (${result.alreadyAppliedCount}/${result.totalMigrations} applied).`);
      } else {
        console.log(`[MIGRATION_CLI] Successfully applied ${result.appliedCount} migration(s): ${result.appliedVersions.join(', ')}`);
      }

      console.log('[MIGRATION_CLI] Validating domain schema...');
      const validation = await validateDomainSchema(adapter);
      console.log(`[MIGRATION_CLI] Domain validation OK: ${validation.domainTablesFound.length}/${DOMAIN_TABLES.length} domain tables verified.`);
      break;
    }

    case 'status': {
      const statuses = await getMigrationStatus(adapter);
      console.log('\n=================== MIGRATION STATUS ===================');
      console.log('Version | Name                         | Status  | Applied At');
      console.log('--------------------------------------------------------');
      for (const s of statuses) {
        const appliedStr = s.applied_at ? s.applied_at : '---';
        console.log(`${s.version.padEnd(7)} | ${s.name.padEnd(28)} | ${s.status.padEnd(7)} | ${appliedStr}`);
      }
      console.log('========================================================\n');
      break;
    }

    case 'validate': {
      const validation = await validateDomainSchema(adapter);
      if (validation.valid) {
        console.log(`[SCHEMA_VALIDATION] OK: All ${validation.domainTablesFound.length} domain tables and ${validation.infrastructureTablesFound.length} metadata tables present.`);
      } else {
        console.error('[SCHEMA_VALIDATION_ERROR] Schema validation failed:', validation.errors);
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`[MIGRATION_CLI_ERROR] Unknown command: "${command}". Supported: up, status, validate.`);
      process.exit(1);
  }
}

// Execute if run as main script
if (process.argv[1] === __filename) {
  runCli().catch(err => {
    console.error('[MIGRATION_CLI_FATAL]', err);
    process.exit(1);
  });
}
