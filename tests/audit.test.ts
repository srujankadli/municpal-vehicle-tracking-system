import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runSeed } from '../src/db/seed.js';
import { AuditService } from '../src/services/audit.service.js';
import { UserRole } from '../src/types/domain.js';

describe('Append-Only Audit Trail System', () => {
  let db: DatabaseSync;
  let audit: AuditService;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    runSeed(db);
    audit = new AuditService(db);
  });

  it('records immutable audit events with actor, action, and before/after diffs', () => {
    const eventId = audit.logEvent({
      actorId: 'usr-sup-01',
      actorRole: UserRole.SUPERVISOR,
      actionType: 'MANUAL_VERIFICATION_OVERRIDE',
      entityName: 'collection_records',
      entityId: 'run-demo-01:house-demo-101',
      beforeState: { verification_status: 'NOT_VERIFIED' },
      afterState: { verification_status: 'VERIFIED', override_reason: 'Supervisor physical inspection approved' },
      ipAddress: '192.168.1.50'
    });

    assert.ok(eventId);

    const events = audit.getEvents({ entityName: 'collection_records', entityId: 'run-demo-01:house-demo-101' });
    assert.equal(events.length, 1);
    const event = events[0]!;
    assert.equal(event.actor_id, 'usr-sup-01');
    assert.equal(event.actor_role, UserRole.SUPERVISOR);
    assert.equal(event.action_type, 'MANUAL_VERIFICATION_OVERRIDE');
    assert.deepEqual(JSON.parse(String(event.before_state)), { verification_status: 'NOT_VERIFIED' });
    assert.deepEqual(JSON.parse(String(event.after_state)), {
      verification_status: 'VERIFIED',
      override_reason: 'Supervisor physical inspection approved'
    });
  });

  it('provides chronological event queries filtered by entity or actor', () => {
    audit.logEvent({
      actorId: 'usr-admin-01',
      actorRole: UserRole.ADMIN,
      actionType: 'CONFIG_UPDATE',
      entityName: 'system_settings',
      entityId: 'cfg-01',
      afterState: { key: 'tariff', value: 100 }
    });

    const adminEvents = audit.getEvents({ actorId: 'usr-admin-01' });
    assert.ok(adminEvents.length >= 1);
    assert.equal(adminEvents[0]!.action_type, 'CONFIG_UPDATE');
  });
});
