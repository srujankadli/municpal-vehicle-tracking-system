/**
 * Migration 0001: Initial 21 Domain Tables
 * Phase 3 — Production Readiness & Persistence Hardening (Batch 2)
 *
 * Establishes the authoritative 21 domain tables with normalized relational
 * schema, check constraints, foreign keys, and indexes across SQLite and PostgreSQL.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Migration } from './types.js';
import type { IDatabaseAdapter } from '../adapters/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getDomainSchemaSql(): string {
  const candidates = [
    path.join(__dirname, '..', 'schema.sql'),
    path.join(__dirname, 'schema.sql'),
    path.join(process.cwd(), 'src', 'db', 'schema.sql'),
    path.join(process.cwd(), 'dist', 'db', 'schema.sql')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf8');
    }
  }

  throw new Error(`[MIGRATION_ERROR] schema.sql not found in search paths: ${candidates.join(', ')}`);
}

export const migration_0001: Migration = {
  version: '0001',
  name: 'initial_21_domain_tables',

  up: async (adapter: IDatabaseAdapter): Promise<void> => {
    const sql = getDomainSchemaSql();

    if (adapter.clientType === 'sqlite') {
      adapter.exec(sql);
    } else if (adapter.clientType === 'postgres') {
      // PostgreSQL execution: executes SQL script through adapter
      await adapter.exec(sql);
    }
  }
};
