/**
 * Persistence Abstraction Interfaces
 * Phase 3 — Production Readiness & Persistence Hardening (Batch 1)
 *
 * Establishes a database-agnostic interface boundary supporting both
 * embedded SQLite (development/testing) and enterprise PostgreSQL (production).
 */

export type QueryParam = string | number | boolean | null | undefined;

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export interface StatementSync {
  all<T = Record<string, unknown>>(...params: QueryParam[]): T[];
  get<T = Record<string, unknown>>(...params: QueryParam[]): T | undefined;
  run(...params: QueryParam[]): { changes: number; lastInsertRowid?: number | bigint };
}

export interface IDatabaseAdapter {
  readonly clientType: 'sqlite' | 'postgres';

  /**
   * Execute raw SQL statements (DDL, PRAGMAs, multi-statement scripts).
   */
  exec(sql: string): Promise<void> | void;

  /**
   * Execute a parameterized query returning all matching rows.
   */
  query<T = Record<string, unknown>>(sql: string, params?: QueryParam[]): Promise<QueryResult<T>>;

  /**
   * Prepare a synchronous statement interface compatible with existing SQLite DatabaseSync calls.
   */
  prepare(sql: string): StatementSync;

  /**
   * Execute an atomic transaction block.
   */
  transaction<T>(fn: (adapter: IDatabaseAdapter) => Promise<T> | T): Promise<T>;

  /**
   * Close connection or connection pool cleanly.
   */
  close(): Promise<void> | void;
}
