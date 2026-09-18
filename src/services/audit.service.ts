import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.js';
import type { UserRole } from '../types/domain.js';

export interface AuditEventParams {
  actorId: string;
  actorRole: UserRole | string;
  actionType: string;
  entityName: string;
  entityId: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  ipAddress?: string;
}

export class AuditService {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  public logEvent(params: AuditEventParams): string {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO audit_events (
        id, actor_id, actor_role, action_type, entity_name,
        entity_id, before_state, after_state, ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      params.actorId,
      params.actorRole,
      params.actionType,
      params.entityName,
      params.entityId,
      params.beforeState ? JSON.stringify(params.beforeState) : null,
      params.afterState ? JSON.stringify(params.afterState) : null,
      params.ipAddress || '127.0.0.1',
      createdAt
    );

    return id;
  }

  public getEvents(filter: {
    entityName?: string;
    entityId?: string;
    actorId?: string;
    limit?: number;
  }): Record<string, unknown>[] {
    let sql = `SELECT * FROM audit_events WHERE 1=1`;
    const params: (string | number)[] = [];

    if (filter.entityName) {
      sql += ` AND entity_name = ?`;
      params.push(filter.entityName);
    }
    if (filter.entityId) {
      sql += ` AND entity_id = ?`;
      params.push(filter.entityId);
    }
    if (filter.actorId) {
      sql += ` AND actor_id = ?`;
      params.push(filter.actorId);
    }

    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(filter.limit || 100);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Record<string, unknown>[];
  }
}
