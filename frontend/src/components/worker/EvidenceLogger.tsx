import React, { useState } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { apiClient } from '../../api/client';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { StatusBadge } from '../ui/StatusBadge';
import type { EvidenceType, SubmitEvidenceResponse } from '../../types/worker';
import { QrCode, Radio, Camera, ShieldCheck, CheckCircle2, AlertCircle, CloudOff } from 'lucide-react';
import { enqueueEvidenceEvent, type QueuedEvidenceEvent } from '../../offline/queue';

export interface EvidenceLoggerProps {
  runId: string;
  onEvidenceRecorded?: (res: SubmitEvidenceResponse) => void;
}

export const EvidenceLogger: React.FC<EvidenceLoggerProps> = ({ runId, onEvidenceRecorded }) => {
  const { t } = useTranslation();

  const [householdId, setHouseholdId] = useState<string>('house-demo-101');
  const [evidenceType, setEvidenceType] = useState<EvidenceType>('DOORSTEP_NFC_TAP');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submissionResult, setSubmissionResult] = useState<SubmitEvidenceResponse | null>(null);
  const [queuedOffline, setQueuedOffline] = useState<QueuedEvidenceEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!householdId.trim()) return;

    setSubmitting(true);
    setError(null);
    setSubmissionResult(null);
    setQueuedOffline(null);

    const clientEventId = crypto.randomUUID ? crypto.randomUUID() : `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();

    const payload = {
      client_event_id: clientEventId,
      household_id: householdId.trim(),
      evidence_type: evidenceType,
      captured_at: now,
      device_id: 'FIELD-MOBILE-HANDHELD-01',
      raw_payload: {
        simulated_field_timestamp: now,
        app_mode: 'FIELD_WORKER_TERMINAL'
      }
    };

    // 1. If currently offline, enqueue immediately to IndexedDB
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        const queued = await enqueueEvidenceEvent({
          client_event_id: clientEventId,
          run_id: runId,
          household_id: householdId.trim(),
          evidence_type: evidenceType,
          captured_at: now,
          device_id: payload.device_id,
          raw_payload: payload.raw_payload
        });
        setQueuedOffline(queued);
      } catch (qErr: any) {
        setError(qErr.message || 'Failed to store event in offline queue');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // 2. If online, attempt server transmission
    try {
      const res = await apiClient.post<SubmitEvidenceResponse>(
        `/api/v1/operations/runs/${runId}/events`,
        payload
      );

      setSubmissionResult(res);
      if (onEvidenceRecorded) {
        onEvidenceRecorded(res);
      }
    } catch (err: any) {
      // If network failure / connection dropped during fetch, fallback gracefully to offline queue
      const isNetworkError =
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        err?.message?.includes('fetch') ||
        err?.message?.includes('NetworkError') ||
        err?.message?.includes('Failed to fetch') ||
        err?.status === 0;

      if (isNetworkError) {
        try {
          const queued = await enqueueEvidenceEvent({
            client_event_id: clientEventId,
            run_id: runId,
            household_id: householdId.trim(),
            evidence_type: evidenceType,
            captured_at: now,
            device_id: payload.device_id,
            raw_payload: payload.raw_payload
          });
          setQueuedOffline(queued);
          return;
        } catch (qErr: any) {
          setError(qErr.message || 'Failed to store event in offline queue');
        }
      } else {
        setError(err.message || 'Failed to transmit doorstep verification evidence to municipal backend.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
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
      <div>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
          Physical Service Evidence Capture
        </h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>
          Record verifiable doorstep interactions. Critical Rule: Vehicle proximity alone evaluates to <strong>OBSERVED</strong>. Physical doorstep scan transitions status to <strong>VERIFIED</strong>.
        </p>
      </div>

      {error && <Alert type="error" message={error} />}

      {submissionResult && (
        <div
          data-testid="server-confirmation-alert"
          style={{
            backgroundColor: 'var(--color-success-bg)',
            border: '1px solid var(--color-success-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.875rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={18} style={{ color: 'var(--color-success)' }} aria-hidden="true" />
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-success)' }}>
              Server Authoritative Confirmation Received
            </span>
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span>Evidence ID: <code>{submissionResult.evidence_id.substring(0, 8)}...</code></span>
            <span>Synthesized State:</span>
            <StatusBadge category="verification" status={submissionResult.synthesis.status} />
          </div>
          {submissionResult.anomalies_detected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--color-danger)' }}>
              <AlertCircle size={14} aria-hidden="true" />
              <span>Algorithmic Notice: Rapid scan anomaly flagged by backend engine.</span>
            </div>
          )}
        </div>
      )}

      {queuedOffline && (
        <div
          data-testid="offline-queued-alert"
          style={{
            backgroundColor: '#fffbeb',
            border: '1px solid #fcd34d',
            borderRadius: 'var(--radius-sm)',
            padding: '0.875rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CloudOff size={18} style={{ color: '#d97706' }} aria-hidden="true" />
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#92400e' }}>
              Stored in Local Offline Queue (IndexedDB)
            </span>
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span>Event ID: <code>{queuedOffline.client_event_id.substring(0, 8)}...</code></span>
            <span>Local State:</span>
            <StatusBadge category="verification" status="NOT_VERIFIED" />
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#92400e' }}>
            Captured at {new Date(queuedOffline.captured_at).toLocaleTimeString()}. Invariant: Evidence is stored safely offline and will synchronize to the authoritative ledger upon connectivity restoration.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label
            htmlFor="target-household-id"
            style={{
              display: 'block',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              marginBottom: '0.375rem',
            }}
          >
            Target Household Identifier / UID
          </label>
          <input
            id="target-household-id"
            type="text"
            value={householdId}
            onChange={(e) => setHouseholdId(e.target.value)}
            required
            placeholder="e.g. house-demo-101 or H-14A-01"
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '0.9375rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-mono)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label
            id="verification-method-label"
            style={{
              display: 'block',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              marginBottom: '0.5rem',
            }}
          >
            Doorstep Verification Method
          </label>

          <div
            role="radiogroup"
            aria-labelledby="verification-method-label"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}
          >
            <button
              type="button"
              role="radio"
              aria-checked={evidenceType === 'DOORSTEP_NFC_TAP'}
              onClick={() => setEvidenceType('DOORSTEP_NFC_TAP')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                border: evidenceType === 'DOORSTEP_NFC_TAP' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                backgroundColor: evidenceType === 'DOORSTEP_NFC_TAP' ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
                color: evidenceType === 'DOORSTEP_NFC_TAP' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: 600,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              <Radio size={16} aria-hidden="true" />
              <span>NFC Doorstep Tap</span>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={evidenceType === 'DOORSTEP_QR_SCAN'}
              onClick={() => setEvidenceType('DOORSTEP_QR_SCAN')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                border: evidenceType === 'DOORSTEP_QR_SCAN' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                backgroundColor: evidenceType === 'DOORSTEP_QR_SCAN' ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
                color: evidenceType === 'DOORSTEP_QR_SCAN' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: 600,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              <QrCode size={16} aria-hidden="true" />
              <span>QR Barcode Scan</span>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={evidenceType === 'VEHICLE_PROXIMITY_CORRIDOR'}
              onClick={() => setEvidenceType('VEHICLE_PROXIMITY_CORRIDOR')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                border: evidenceType === 'VEHICLE_PROXIMITY_CORRIDOR' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                backgroundColor: evidenceType === 'VEHICLE_PROXIMITY_CORRIDOR' ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
                color: evidenceType === 'VEHICLE_PROXIMITY_CORRIDOR' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: 600,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              <span>Proximity Only</span>
            </button>
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          disabled={submitting}
          style={{ width: '100%', padding: '0.875rem', justifyContent: 'center', fontSize: '0.9375rem' }}
        >
          {submitting ? 'Transmitting Evidence to Server...' : 'Submit Verification Evidence'}
        </Button>
      </form>
    </div>
  );
};
