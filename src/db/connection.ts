import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import type { IDatabaseAdapter } from './adapters/types.js';
import { SQLiteAdapter } from './adapters/sqlite.adapter.js';
import { PostgresAdapter } from './adapters/postgres.adapter.js';

let rawDbInstance: DatabaseSync | null = null;
let adapterInstance: IDatabaseAdapter | null = null;

export function getDatabase(dbPath?: string): DatabaseSync {
  if (rawDbInstance && !dbPath) {
    return rawDbInstance;
  }

  const targetPath = dbPath || config.DATABASE_PATH;

  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(targetPath);

  // Enforce critical database invariants
  db.exec('PRAGMA foreign_keys = ON;');
  if (targetPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  if (!dbPath) {
    rawDbInstance = db;
  }

  return db;
}

export function getDatabaseAdapter(options?: { client?: 'sqlite' | 'postgres'; pathOrUrl?: string }): IDatabaseAdapter {
  if (adapterInstance && !options) {
    return adapterInstance;
  }

  const client = options?.client || config.DB_CLIENT;

  if (client === 'postgres') {
    const connectionString = options?.pathOrUrl || config.DATABASE_URL || 'postgresql://localhost:5432/municipal_waste';
    const pgAdapter = new PostgresAdapter({
      connectionString,
      minPool: config.DB_POOL_MIN,
      maxPool: config.DB_POOL_MAX
    });
    if (!options) {
      adapterInstance = pgAdapter;
    }
    return pgAdapter;
  }

  // Default SQLite adapter
  const db = getDatabase(options?.pathOrUrl);
  const sqliteAdapter = new SQLiteAdapter(db);
  if (!options) {
    adapterInstance = sqliteAdapter;
  }
  return sqliteAdapter;
}

export function closeDatabase(): void {
  if (adapterInstance) {
    adapterInstance.close();
    adapterInstance = null;
  }
  if (rawDbInstance) {
    rawDbInstance.close();
    rawDbInstance = null;
  }
}

