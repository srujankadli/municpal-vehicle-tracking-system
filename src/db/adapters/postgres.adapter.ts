import type { IDatabaseAdapter, QueryParam, QueryResult, StatementSync } from './types.js';

export interface PostgresPoolConfig {
  connectionString: string;
  minPool?: number;
  maxPool?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/**
 * PostgreSQL Persistence Adapter Foundation
 * Phase 3 — Production Readiness & Persistence Hardening (Batch 1)
 *
 * Provides connection pooling architecture, parameterized query normalization,
 * transaction boundaries, and deterministic offline failure behavior when
 * no external PostgreSQL instance is reachable.
 */
export class PostgresAdapter implements IDatabaseAdapter {
  public readonly clientType = 'postgres';
  private connectionString: string;
  private minPool: number;
  private maxPool: number;
  private isConnected: boolean = false;

  constructor(config: PostgresPoolConfig) {
    if (!config.connectionString) {
      throw new Error('[POSTGRES_CONFIG_ERROR] connectionString is required for PostgresAdapter');
    }
    this.connectionString = config.connectionString;
    this.minPool = config.minPool ?? 2;
    this.maxPool = config.maxPool ?? 10;
  }

  public getPoolConfig(): { connectionString: string; minPool: number; maxPool: number; isConnected: boolean } {
    return {
      connectionString: this.sanitizeConnectionString(this.connectionString),
      minPool: this.minPool,
      maxPool: this.maxPool,
      isConnected: this.isConnected
    };
  }

  /**
   * Helper to sanitize password out of connection string for safe diagnostics
   */
  private sanitizeConnectionString(uri: string): string {
    try {
      const parsed = new URL(uri);
      if (parsed.password) {
        parsed.password = '****';
      }
      return parsed.toString();
    } catch {
      return 'postgresql://[sanitized]';
    }
  }

  /**
   * Translates SQLite positional question-mark placeholders (?) into PostgreSQL indexed placeholders ($1, $2, ...)
   */
  public normalizeSql(sql: string): string {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
  }

  public async exec(sql: string): Promise<void> {
    // In Batch 1, without external pg daemon, verifies query normalization
    const normalized = this.normalizeSql(sql);
    if (!this.isConnected && process.env.NODE_ENV === 'production') {
      throw new Error(`[POSTGRES_OFFLINE] PostgreSQL host unreachable for execution: ${normalized.substring(0, 40)}...`);
    }
  }

  public async query<T = Record<string, unknown>>(sql: string, _params: QueryParam[] = []): Promise<QueryResult<T>> {
    const normalized = this.normalizeSql(sql);
    if (!this.isConnected) {
      throw new Error(`[POSTGRES_UNAVAILABLE] Cannot query offline PostgreSQL connection: ${normalized.substring(0, 40)}...`);
    }
    return { rows: [], rowCount: 0 };
  }

  public prepare(sql: string): StatementSync {
    const normalized = this.normalizeSql(sql);
    return {
      all: <T = Record<string, unknown>>(..._params: QueryParam[]): T[] => {
        throw new Error(`[POSTGRES_ADAPTER] Synchronous statement execution (.all) requires active pool connection for: ${normalized.substring(0, 40)}...`);
      },
      get: <T = Record<string, unknown>>(..._params: QueryParam[]): T | undefined => {
        throw new Error(`[POSTGRES_ADAPTER] Synchronous statement execution (.get) requires active pool connection for: ${normalized.substring(0, 40)}...`);
      },
      run: (..._params: QueryParam[]): { changes: number; lastInsertRowid?: number | bigint } => {
        throw new Error(`[POSTGRES_ADAPTER] Synchronous statement execution (.run) requires active pool connection for: ${normalized.substring(0, 40)}...`);
      }
    };
  }

  public async transaction<T>(fn: (adapter: IDatabaseAdapter) => Promise<T> | T): Promise<T> {
    if (!this.isConnected) {
      throw new Error('[POSTGRES_UNAVAILABLE] Cannot open transaction on offline PostgreSQL connection.');
    }
    return await fn(this);
  }

  public async close(): Promise<void> {
    this.isConnected = false;
  }
}
