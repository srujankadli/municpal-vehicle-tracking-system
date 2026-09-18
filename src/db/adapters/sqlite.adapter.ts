import { DatabaseSync } from 'node:sqlite';
import type { IDatabaseAdapter, QueryParam, QueryResult, StatementSync } from './types.js';

export class SQLiteAdapter implements IDatabaseAdapter {
  public readonly clientType = 'sqlite';
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  public getRawDatabase(): DatabaseSync {
    return this.db;
  }

  public exec(sql: string): void {
    this.db.exec(sql);
  }

  private sanitizeParams(params: QueryParam[]): Array<null | number | bigint | string | Uint8Array> {
    return params.map(p => {
      if (p === undefined || p === null) return null;
      if (typeof p === 'boolean') return p ? 1 : 0;
      return p;
    });
  }

  public async query<T = Record<string, unknown>>(sql: string, params: QueryParam[] = []): Promise<QueryResult<T>> {
    const stmt = this.db.prepare(sql);
    const rows = (stmt.all as (...args: unknown[]) => unknown[])(...this.sanitizeParams(params)) as T[];
    return {
      rows,
      rowCount: rows.length
    };
  }

  public prepare(sql: string): StatementSync {
    const stmt = this.db.prepare(sql);
    const sanitize = this.sanitizeParams.bind(this);
    return {
      all: <T = Record<string, unknown>>(...params: QueryParam[]): T[] => {
        return (stmt.all as (...args: unknown[]) => unknown[])(...sanitize(params)) as T[];
      },
      get: <T = Record<string, unknown>>(...params: QueryParam[]): T | undefined => {
        return (stmt.get as unknown as (...args: unknown[]) => T | undefined)(...sanitize(params));
      },
      run: (...params: QueryParam[]): { changes: number; lastInsertRowid?: number | bigint } => {
        const res = (stmt.run as (...args: unknown[]) => { changes: number | bigint; lastInsertRowid?: number | bigint })(...sanitize(params));
        return {
          changes: Number(res.changes),
          lastInsertRowid: res.lastInsertRowid
        };
      }
    };
  }

  public async transaction<T>(fn: (adapter: IDatabaseAdapter) => Promise<T> | T): Promise<T> {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const result = await fn(this);
      this.db.exec('COMMIT;');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        // Rollback error secondary to original throw
      }
      throw error;
    }
  }

  public close(): void {
    this.db.close();
  }
}
