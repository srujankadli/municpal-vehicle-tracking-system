/**
 * Migration System Types
 * Phase 3 — Production Readiness & Persistence Hardening (Batch 2)
 *
 * Defines the contract for forward migrations, migration metadata,
 * and dialect execution targets across SQLite and PostgreSQL.
 */

import type { IDatabaseAdapter } from '../adapters/types.js';

export type SupportedDialect = 'sqlite' | 'postgres';

export interface Migration {
  /**
   * Version identifier formatted with leading zeros (e.g., '0001').
   * Guarantees deterministic lexical ordering.
   */
  readonly version: string;

  /**
   * Human-readable migration descriptor.
   */
  readonly name: string;

  /**
   * Execute forward migration DDL/DML.
   */
  up: (adapter: IDatabaseAdapter) => Promise<void> | void;

  /**
   * Optional rollback definition for environments supporting reversible migrations.
   */
  down?: (adapter: IDatabaseAdapter) => Promise<void> | void;
}

export interface MigrationRecord {
  version: string;
  name: string;
  applied_at: string;
  checksum?: string | null;
}

export interface MigrationStatus {
  version: string;
  name: string;
  status: 'APPLIED' | 'PENDING';
  applied_at?: string | null;
}

export interface MigrationResult {
  appliedCount: number;
  appliedVersions: string[];
  alreadyAppliedCount: number;
  totalMigrations: number;
}

export interface SchemaValidationResult {
  valid: boolean;
  tableCount: number;
  domainTablesFound: string[];
  missingDomainTables: string[];
  infrastructureTablesFound: string[];
  errors: string[];
}
