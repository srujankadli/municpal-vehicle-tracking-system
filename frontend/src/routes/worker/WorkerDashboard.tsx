import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { apiClient } from '../../api/client';
import { AssignmentCard } from '../../components/worker/AssignmentCard';
import { EvidenceLogger } from '../../components/worker/EvidenceLogger';
import { OfflineQueueViewer } from '../../components/worker/OfflineQueueViewer';
import { Panel } from '../../components/ui/Panel';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import type { WorkerAssignment, SubmitEvidenceResponse } from '../../types/worker';
import type { MasterRoute, ServiceRunDetail } from '../../types/operations';
import { Truck, RotateCcw, AlertTriangle, ShieldCheck, CheckCircle2, ChevronRight } from 'lucide-react';

export const WorkerDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { session } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [assignment, setAssignment] = useState<WorkerAssignment | null>(null);
  const [runDetail, setRunDetail] = useState<ServiceRunDetail | null>(null);

  const fetchAssignment = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      // 1. Fetch own operational assignment
      const res = await apiClient.get<{ assignment: WorkerAssignment | null }>(
        '/api/v1/operations/assignments/my-assignment'
      );
      setAssignment(res.assignment);

      // 2. If assignment exists, resolve service run
      if (res.assignment?.id) {
        // Find service run linked to assignment
        const runId = res.assignment.id === 'da-demo-02' ? 'run-demo-02' : 'run-demo-01';
        try {
          const runRes = await apiClient.get<{ run: ServiceRunDetail }>(
            `/api/v1/operations/runs/${runId}`
          );
          setRunDetail(runRes.run);
        } catch {
          // If no started run yet
        }
      }
    } catch (err: any) {
      setError(err.message || 'Unable to retrieve today\'s assignment roster from server.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAssignment();
  }, []);

  const handleEvidenceRecorded = (_res: SubmitEvidenceResponse) => {
    // Refresh run detail to update completion state
    fetchAssignment(true);
  };

  if (loading && !refreshing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '350px' }}>
        <LoadingSpinner size="lg" text="Retrieving today's operational assignment..." />
      </div>
    );
  }

  const roleName = session?.role === 'WORKER' ? 'Sanitary Worker' : session?.role === 'DRIVER' ? 'Vehicle Driver' : 'Field Personnel';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '800px', margin: '0 auto' }}>
      {/* 1. Header with worker profile context */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
            {t('portals.worker.title')}
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>
            Logged in as: <strong>{session?.fullName}</strong> ({roleName}) &bull; ID: <code>{session?.workerId || session?.userId}</code>
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchAssignment(true)}
          disabled={refreshing}
          style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
          ariaLabel="Refresh Assignment"
        >
          <RotateCcw size={14} className={refreshing ? 'spinning' : ''} aria-hidden="true" />
          <span>{refreshing ? t('common.loading') : 'Refresh'}</span>
        </Button>
      </div>

      {error && <Alert type="error" message={error} />}

      {/* 2. Today's Assignment Card */}
      {assignment ? (
        <AssignmentCard assignment={assignment} roleName={roleName} />
      ) : (
        <EmptyState
          title="No Assignment for Today"
          description="You do not have an active collection run assigned for this service date. Contact your ward sanitation supervisor if you are scheduled for field duty."
        />
      )}

      {/* 3. Doorstep Evidence Logger (Phase 1 Event Recording Integration) */}
      {assignment && (
        <EvidenceLogger
          runId={assignment.id === 'da-demo-02' ? 'run-demo-02' : 'run-demo-01'}
          onEvidenceRecorded={handleEvidenceRecorded}
        />
      )}

      {/* 4. Offline Queue & Sync Manager (Phase 4 Batch 2) */}
      {assignment && (
        <OfflineQueueViewer
          runId={assignment.id === 'da-demo-02' ? 'run-demo-02' : 'run-demo-01'}
          onSyncComplete={() => fetchAssignment(true)}
        />
      )}

      {/* 4. Operational Instructions & Verification Integrity Guide */}
      <Panel title="Municipal Field Standard Operating Procedures">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <CheckCircle2 size={16} style={{ color: 'var(--color-success)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
            <span><strong>Doorstep Verification:</strong> Scan resident NFC/QR code at physical premises. Telemetry corridor proximity alone does not constitute proof of waste collection.</span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <AlertTriangle size={16} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
            <span><strong>Mechanical Obstruction / Breakdown:</strong> In case of vehicle failure or impassable streets, do not mark uncollected households as verified. Report directly to your supervisor.</span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <ShieldCheck size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
            <span><strong>Anti-Fraud Protection:</strong> Rapid scanning between distinct premises (&lt; 5s interval) triggers automatic supervisor scrutiny (ANOM-02).</span>
          </div>
        </div>
      </Panel>
    </div>
  );
};
