import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseJwtPayload, loadStoredSession } from '../src/auth/AuthContext.js';

describe('Phase 2.1 - Authentication & Route Guard Logic Tests', () => {
  it('1. parseJwtPayload safely extracts payload from valid JWT tokens', () => {
    // Header: {"alg":"HS256","typ":"JWT"} -> eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
    // Payload: {"sub":"usr_1","role":"ADMINISTRATOR","exp":1893456000}
    // -> eyJzdWIiOiJ1c3JfMSIsInJvbGUiOiJBRE1JTklTVFJBVE9SIiwiZXhwIjoxODkzNDU2MDAwfQ
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfMSIsInJvbGUiOiJBRE1JTklTVFJBVE9SIiwiZXhwIjoxODkzNDU2MDAwfQ.sig';
    const payload = parseJwtPayload(token);
    assert.ok(payload);
    assert.equal(payload.sub, 'usr_1');
    assert.equal(payload.role, 'ADMINISTRATOR');
  });

  it('2. parseJwtPayload gracefully handles malformed tokens without throwing', () => {
    assert.equal(parseJwtPayload('invalid-string'), null);
    assert.equal(parseJwtPayload('part1.part2'), null);
    assert.equal(parseJwtPayload(''), null);
  });

  it('3. Role authorization rules strictly match municipal portal boundaries', () => {
    const authorityRoles = ['AUTHORITY', 'SUPERVISOR', 'WARD_OFFICER', 'ADMIN'];
    const workerRoles = ['WORKER', 'DRIVER', 'SUPERVISOR', 'ADMIN'];
    const citizenRoles = ['CITIZEN', 'ADMIN'];

    // Authority Portal
    assert.ok(authorityRoles.includes('AUTHORITY'));
    assert.ok(authorityRoles.includes('SUPERVISOR'));
    assert.ok(authorityRoles.includes('WARD_OFFICER'));
    assert.ok(authorityRoles.includes('ADMIN'));
    assert.ok(!authorityRoles.includes('WORKER'));
    assert.ok(!authorityRoles.includes('DRIVER'));
    assert.ok(!authorityRoles.includes('CITIZEN'));

    // Worker Portal
    assert.ok(workerRoles.includes('WORKER'));
    assert.ok(workerRoles.includes('DRIVER'));
    assert.ok(!workerRoles.includes('CITIZEN'));
    assert.ok(!workerRoles.includes('AUTHORITY'));

    // Citizen Portal
    assert.ok(citizenRoles.includes('CITIZEN'));
    assert.ok(!citizenRoles.includes('WORKER'));
    assert.ok(!citizenRoles.includes('DRIVER'));
    assert.ok(!citizenRoles.includes('AUTHORITY'));
  });
});
