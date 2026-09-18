import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.js';
import { config } from '../config/index.js';
import { UserRole } from '../types/domain.js';

export interface TokenPayload {
  userId: string;
  username: string;
  role: UserRole;
  wardId?: string | null;
  householdId?: string | null;
  workerId?: string | null;
  exp: number;
}

export class AuthService {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  public hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  public verifyPassword(password: string, storedHash: string): boolean {
    const [salt, originalHash] = storedHash.split(':');
    if (!salt || !originalHash) return false;
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
  }

  public createToken(payload: Omit<TokenPayload, 'exp'>, expiresInHours: number = 24): string {
    const fullPayload: TokenPayload = {
      ...payload,
      exp: Math.floor(Date.now() / 1000) + (expiresInHours * 3600)
    };

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', config.JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');

    return `${header}.${body}.${signature}`;
  }

  public verifyToken(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [header, body, signature] = parts;
      if (!header || !body || !signature) return null;

      const expectedSignature = crypto
        .createHmac('sha256', config.JWT_SECRET)
        .update(`${header}.${body}`)
        .digest('base64url');

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return null;
      }

      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        return null; // Expired
      }

      return payload;
    } catch {
      return null;
    }
  }

  public authenticate(username: string, password: string): { token: string; user: TokenPayload } | null {
    const stmt = this.db.prepare(`SELECT * FROM users WHERE username = ? AND is_active = 1`);
    const row = stmt.get(username) as Record<string, unknown> | undefined;
    if (!row) return null;

    const valid = this.verifyPassword(password, String(row.password_hash));
    if (!valid) return null;

    const user: Omit<TokenPayload, 'exp'> = {
      userId: String(row.id),
      username: String(row.username),
      role: row.role as UserRole,
      wardId: row.ward_id ? String(row.ward_id) : null,
      householdId: row.household_id ? String(row.household_id) : null,
      workerId: row.worker_id ? String(row.worker_id) : null
    };

    const token = this.createToken(user);
    return { token, user: { ...user, exp: Math.floor(Date.now() / 1000) + 86400 } };
  }
}
