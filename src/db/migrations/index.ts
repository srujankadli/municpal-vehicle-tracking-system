/**
 * Central Migration Registry
 * Phase 3 — Production Readiness & Persistence Hardening (Batch 2)
 *
 * Maintains the deterministic, version-ordered list of forward migrations.
 */

import type { Migration } from './types.js';
import { migration_0001 } from './0001_initial_domain_schema.js';

export * from './types.js';

/**
 * Authoritative list of migrations in strictly increasing version order.
 */
export const MIGRATIONS: Migration[] = [
  migration_0001
];

/**
 * Retrieve sorted migrations verifying version uniqueness and order.
 */
export function getOrderedMigrations(): Migration[] {
  const versions = new Set<string>();
  for (const m of MIGRATIONS) {
    if (versions.has(m.version)) {
      throw new Error(`[MIGRATION_REGISTRY_ERROR] Duplicate migration version detected: ${m.version}`);
    }
    versions.add(m.version);
  }

  return [...MIGRATIONS].sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
}
