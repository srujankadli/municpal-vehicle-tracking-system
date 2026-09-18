import { apiClient, ApiClientError } from '../api/client';
import {
  getQueuedEvents,
  updateQueuedEventStatus,
  type QueuedEvidenceEvent
} from './queue';
import type { SubmitEvidenceResponse } from '../types/worker';

export interface SyncSummary {
  processed: number;
  synced: number;
  duplicates: number;
  failed: number;
  errors: string[];
}

let isSyncRunning = false;

export async function syncPendingQueue(targetRunId?: string): Promise<SyncSummary> {
  if (isSyncRunning) {
    return { processed: 0, synced: 0, duplicates: 0, failed: 0, errors: ['Sync already in progress'] };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { processed: 0, synced: 0, duplicates: 0, failed: 0, errors: ['Device is offline'] };
  }

  isSyncRunning = true;
  const summary: SyncSummary = {
    processed: 0,
    synced: 0,
    duplicates: 0,
    failed: 0,
    errors: []
  };

  try {
    const allEvents = await getQueuedEvents();
    // Filter to items that need syncing (QUEUED or FAILED) and optionally match targetRunId
    const pending = allEvents.filter(
      (e) => (e.status === 'QUEUED' || e.status === 'FAILED') && (!targetRunId || e.run_id === targetRunId)
    );

    for (const item of pending) {
      // If network went down during iteration, halt gracefully
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        break;
      }

      summary.processed++;
      await updateQueuedEventStatus(item.client_event_id, 'SYNCING');

      try {
        const payload = {
          client_event_id: item.client_event_id,
          household_id: item.household_id,
          evidence_type: item.evidence_type,
          captured_at: item.captured_at, // Preserve original physical capture time
          device_id: item.device_id || 'FIELD-MOBILE-OFFLINE-01',
          raw_payload: {
            ...item.raw_payload,
            offline_queued_at: item.created_at,
            sync_transmitted_at: new Date().toISOString()
          }
        };

        const res = await apiClient.post<SubmitEvidenceResponse & { duplicate?: boolean }>(
          `/api/v1/operations/runs/${item.run_id}/events`,
          payload
        );

        await updateQueuedEventStatus(item.client_event_id, 'SYNCED', {
          server_response: res
        });

        summary.synced++;
        if (res.duplicate) {
          summary.duplicates++;
        }
      } catch (err: any) {
        summary.failed++;
        const errorMsg = err?.message || 'Sync transmission failed';
        summary.errors.push(errorMsg);

        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          // Auth failure - halt sync loop immediately
          await updateQueuedEventStatus(item.client_event_id, 'FAILED', {
            error_message: `Authentication error (${err.status}): ${errorMsg}`
          });
          break;
        } else if (err instanceof ApiClientError && err.status >= 400 && err.status < 500) {
          // Schema / payload validation rejection - mark failed, do not retry automatically
          await updateQueuedEventStatus(item.client_event_id, 'FAILED', {
            error_message: `Rejected by server: ${errorMsg}`
          });
        } else {
          // Network failure or 5xx server error - mark QUEUED to allow subsequent auto-retry
          await updateQueuedEventStatus(item.client_event_id, 'QUEUED', {
            error_message: `Network failure during sync: ${errorMsg}`
          });
          // Stop this sync round if network connection dropped
          if (!navigator.onLine || errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
            break;
          }
        }
      }
    }
  } finally {
    isSyncRunning = false;
  }

  return summary;
}

let listenersInitialized = false;

export function initOfflineSyncListeners(onSyncComplete?: (summary: SyncSummary) => void) {
  if (listenersInitialized || typeof window === 'undefined') return;
  listenersInitialized = true;

  window.addEventListener('online', async () => {
    try {
      const summary = await syncPendingQueue();
      if (onSyncComplete && summary.processed > 0) {
        onSyncComplete(summary);
      }
    } catch {
      // Gracefully catch background sync errors
    }
  });
}
