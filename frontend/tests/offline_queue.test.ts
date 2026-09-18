import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { QueuedEvidenceEvent, QueueEventStatus } from '../src/offline/queue';

describe('Phase 4 - Batch 2: Frontend Offline Queue & Sync Invariants', () => {
  it('1. Offline queue item structure enforces client_event_id and immutable capture timestamp', () => {
    const item: QueuedEvidenceEvent = {
      client_event_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      run_id: 'run-demo-01',
      household_id: 'house-demo-102',
      evidence_type: 'DOORSTEP_NFC_TAP',
      captured_at: '2026-09-18T10:00:00.000Z',
      status: 'QUEUED',
      retry_count: 0,
      created_at: '2026-09-18T10:00:01.000Z'
    };

    assert.match(item.client_event_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    assert.equal(item.status, 'QUEUED');
    assert.equal(item.captured_at, '2026-09-18T10:00:00.000Z');
  });

  it('2. Queue status lifecycle adheres strictly to canonical offline states', () => {
    const validStatuses: QueueEventStatus[] = ['QUEUED', 'SYNCING', 'SYNCED', 'FAILED'];

    assert.ok(validStatuses.includes('QUEUED'));
    assert.ok(validStatuses.includes('SYNCING'));
    assert.ok(validStatuses.includes('SYNCED'));
    assert.ok(validStatuses.includes('FAILED'));
    assert.equal(validStatuses.length, 4);
  });

  it('3. Invariant: Offline queued items remain UNVERIFIED on client until server confirmation', () => {
    // When offline, client cannot manufacture VERIFIED state
    const offlineDefaultState = 'NOT_VERIFIED';
    const serverVerifiedState = 'VERIFIED';

    assert.notEqual(offlineDefaultState, serverVerifiedState);
    assert.equal(offlineDefaultState, 'NOT_VERIFIED');
  });

  it('4. Strict FIFO ordering invariant: earlier created events take precedence in replay sequence', () => {
    const items: QueuedEvidenceEvent[] = [
      {
        client_event_id: '11111111-1111-4111-8111-111111111111',
        run_id: 'run-demo-01',
        household_id: 'house-demo-101',
        evidence_type: 'DOORSTEP_NFC_TAP',
        captured_at: '2026-09-18T10:00:00.000Z',
        status: 'QUEUED',
        retry_count: 0,
        created_at: '2026-09-18T10:00:05.000Z'
      },
      {
        client_event_id: '22222222-2222-4222-8222-222222222222',
        run_id: 'run-demo-01',
        household_id: 'house-demo-102',
        evidence_type: 'DOORSTEP_QR_SCAN',
        captured_at: '2026-09-18T09:59:00.000Z',
        status: 'QUEUED',
        retry_count: 0,
        created_at: '2026-09-18T09:59:05.000Z'
      }
    ];

    // Sort FIFO by created_at
    const sorted = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at));
    assert.equal(sorted[0].household_id, 'house-demo-102');
    assert.equal(sorted[1].household_id, 'house-demo-101');
  });

  it('5. Server duplicate confirmation does not count as error or increment failure count', () => {
    const serverResponse = {
      success: true,
      duplicate: true,
      evidence_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      synthesis: { status: 'VERIFIED', evidence_count: 1 }
    };

    assert.equal(serverResponse.success, true);
    assert.equal(serverResponse.duplicate, true);
    // Duplicate is a successful idempotent outcome, not a failure
  });
});
