import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import {
  getQueuedEvents,
  clearSyncedEvents,
  type QueuedEvidenceEvent
} from '../../offline/queue';
import { syncPendingQueue, type SyncSummary } from '../../offline/sync';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import {
  Wifi,
  WifiOff,
  RotateCw,
  Trash2,
  Inbox,
  AlertCircle,
  CheckCircle2,
  Clock
} from 'lucide-react';

export interface OfflineQueueViewerProps {
  runId?: string;
  onSyncComplete?: (summary: SyncSummary) => void;
}

export const OfflineQueueViewer: React.FC<OfflineQueueViewerProps> = ({ runId, onSyncComplete }) => {
  const { t } = useTranslation();
  const [events, setEvents] = useState<QueuedEvidenceEvent[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    try {
      const items = await getQueuedEvents();
      setEvents(items);
    } catch {
      // Graceful fallback if indexedDB is unavailable
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    loadQueue();

    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync when coming back online
      handleSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleQueueUpdated = () => {
      loadQueue();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offline-queue-updated', handleQueueUpdated);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-queue-updated', handleQueueUpdated);
    };
  }, [loadQueue]);

  const handleSync = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    setSyncResult(null);

    try {
      const summary = await syncPendingQueue(runId);
      await loadQueue();

      if (summary.processed > 0) {
        setSyncResult(
          `Sync completed: ${summary.synced} synchronized (${summary.duplicates} duplicates deduplicated), ${summary.failed} failed.`
        );
      } else {
        setSyncResult('All offline evidence is already synchronized.');
      }

      if (onSyncComplete) {
        onSyncComplete(summary);
      }
    } catch (err: any) {
      setSyncResult(`Sync error: ${err.message || 'Transmission failed'}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleClearSynced = async () => {
    try {
      await clearSyncedEvents();
      await loadQueue();
    } catch {
      // Ignore
    }
  };

  const pendingCount = events.filter((e) => e.status === 'QUEUED' || e.status === 'FAILED').length;
  const syncedCount = events.filter((e) => e.status === 'SYNCED').length;

  return (
    <div
      data-testid="offline-queue-viewer"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      {/* Header & Connectivity Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
              Field Offline Scan Queue &amp; Sync Manager
            </h3>
            <span
              data-testid="network-status-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '9999px',
                fontSize: '0.6875rem',
                fontWeight: 600,
                backgroundColor: isOnline ? 'var(--color-success-bg, #ecfdf5)' : 'var(--color-danger-bg, #fef2f2)',
                color: isOnline ? 'var(--color-success, #059669)' : 'var(--color-danger, #dc2626)',
                border: `1px solid ${isOnline ? 'var(--color-success-border, #a7f3d0)' : 'var(--color-danger-border, #fecaca)'}`,
              }}
            >
              {isOnline ? <Wifi size={12} aria-hidden="true" /> : <WifiOff size={12} aria-hidden="true" />}
              <span>{isOnline ? 'Online' : 'Offline Mode'}</span>
            </span>
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>
            Local IndexedDB buffer with deterministic FIFO sync. Preserves physical scan timestamps across offline sessions.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {syncedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearSynced}
              data-testid="clear-synced-btn"
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              aria-label="Clear Synced"
            >
              <Trash2 size={13} aria-hidden="true" />
              <span>Clear Synced ({syncedCount})</span>
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={handleSync}
            data-testid="sync-queue-btn"
            disabled={syncing || !isOnline || pendingCount === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
            aria-label="Sync Pending Scans"
          >
            <RotateCw size={13} className={syncing ? 'spinning' : ''} aria-hidden="true" />
            <span>{syncing ? 'Syncing...' : `Sync Queue (${pendingCount})`}</span>
          </Button>
        </div>
      </div>

      {syncResult && (
        <div
          data-testid="sync-result-notice"
          style={{
            fontSize: '0.75rem',
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-background-alt, #f8fafc)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)'
          }}
        >
          {syncResult}
        </div>
      )}

      {/* Queue Items Table / List */}
      {events.length === 0 ? (
        <div
          data-testid="empty-queue-message"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-muted)',
            gap: '0.5rem',
          }}
        >
          <Inbox size={28} aria-hidden="true" />
          <span style={{ fontSize: '0.8125rem' }}>Offline scan queue is empty. All doorstep events are synchronized.</span>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Client Event ID</th>
                <th style={{ padding: '0.5rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Household</th>
                <th style={{ padding: '0.5rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Type</th>
                <th style={{ padding: '0.5rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Captured At</th>
                <th style={{ padding: '0.5rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Queue State</th>
              </tr>
            </thead>
            <tbody>
              {events.map((item) => (
                <tr
                  key={item.client_event_id}
                  data-testid={`queue-row-${item.client_event_id}`}
                  style={{ borderBottom: '1px solid var(--color-border-light, #f1f5f9)' }}
                >
                  <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>
                    {item.client_event_id.substring(0, 8)}...
                  </td>
                  <td style={{ padding: '0.5rem', fontWeight: 500 }}>{item.household_id}</td>
                  <td style={{ padding: '0.5rem', fontSize: '0.75rem' }}>
                    {item.evidence_type.replace(/_/g, ' ')}
                  </td>
                  <td style={{ padding: '0.5rem', color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                    {new Date(item.captured_at).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.15rem 0.4rem',
                        borderRadius: '4px',
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        backgroundColor:
                          item.status === 'SYNCED'
                            ? 'var(--color-success-bg, #ecfdf5)'
                            : item.status === 'FAILED'
                            ? 'var(--color-danger-bg, #fef2f2)'
                            : item.status === 'SYNCING'
                            ? 'var(--color-info-bg, #eff6ff)'
                            : 'var(--color-warning-bg, #fffbeb)',
                        color:
                          item.status === 'SYNCED'
                            ? 'var(--color-success, #059669)'
                            : item.status === 'FAILED'
                            ? 'var(--color-danger, #dc2626)'
                            : item.status === 'SYNCING'
                            ? 'var(--color-info, #2563eb)'
                            : 'var(--color-warning, #d97706)',
                      }}
                    >
                      {item.status === 'SYNCED' ? (
                        <CheckCircle2 size={10} aria-hidden="true" />
                      ) : item.status === 'FAILED' ? (
                        <AlertCircle size={10} aria-hidden="true" />
                      ) : (
                        <Clock size={10} aria-hidden="true" />
                      )}
                      <span>{item.status}</span>
                    </span>
                    {item.error_message && (
                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-danger)', marginTop: '0.25rem' }}>
                        {item.error_message}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Epistemic disclaimer */}
      <div
        style={{
          fontSize: '0.6875rem',
          color: 'var(--color-text-muted)',
          borderTop: '1px solid var(--color-border)',
          paddingTop: '0.5rem',
        }}
      >
        <strong>Civic Integrity Invariant:</strong> Doorstep interactions logged offline are held in device IndexedDB and remain mathematically unverified until validated by the authoritative municipal engine upon reconnection.
      </div>
    </div>
  );
};
