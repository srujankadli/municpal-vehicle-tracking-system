import type { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService, type TokenPayload } from '../services/auth.service.js';
import { UserRole } from '../types/domain.js';

// Extend FastifyRequest type
declare module 'fastify' {
  interface FastifyRequest {
    user?: TokenPayload;
  }
}

const authService = new AuthService();

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Authentication required. Missing or malformed Authorization header.'
    });
    return;
  }

  const token = authHeader.substring(7);
  const payload = authService.verifyToken(token);

  if (!payload) {
    reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Invalid or expired session token.'
    });
    return;
  }

  request.user = payload;
}

export function requireRoles(...allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'Authentication required.'
      });
      return;
    }

    // ADMIN always has full system authorization
    if (request.user.role === UserRole.ADMIN) {
      return;
    }

    if (!allowedRoles.includes(request.user.role)) {
      reply.status(403).send({
        error: 'FORBIDDEN',
        message: `Role '${request.user.role}' is not authorized to access this resource. Worker/Driver isolation active.`
      });
      return;
    }
  };
}

export async function enforceHouseholdAccess(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user) {
    reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Authentication required.' });
    return;
  }

  const params = request.params as { household_id?: string; service_uid?: string } | undefined;
  const targetHouseholdId = params?.household_id;

  // Citizens are strictly confined to their own household record (Anti-IDOR)
  if (request.user.role === UserRole.CITIZEN) {
    if (!request.user.householdId || request.user.householdId !== targetHouseholdId) {
      reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Anti-IDOR Violation: Citizens can only access their own registered household records.'
      });
      return;
    }
  }
}

/**
 * Enforces financial access boundary:
 * - CITIZEN may only access their own registered household.
 * - AUTHORITY and ADMIN may access any household.
 * - WORKER, DRIVER, SUPERVISOR, and WARD_OFFICER are strictly rejected with HTTP 403.
 */
export async function enforceFinanceAccess(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user) {
    reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Authentication required.' });
    return;
  }

  const params = request.params as { household_id?: string } | undefined;
  const targetHouseholdId = params?.household_id;

  if (request.user.role === UserRole.ADMIN || request.user.role === UserRole.AUTHORITY) {
    return; // Full administrative access
  }

  if (request.user.role === UserRole.CITIZEN) {
    if (!request.user.householdId || request.user.householdId !== targetHouseholdId) {
      reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Anti-IDOR Violation: Citizens can only access their own registered household payment records.'
      });
      return;
    }
    return;
  }

  // All other roles (WORKER, DRIVER, SUPERVISOR, WARD_OFFICER) are blocked
  reply.status(403).send({
    error: 'FORBIDDEN',
    message: `Role '${request.user.role}' is not authorized to access municipal financial or payment records.`
  });
}

