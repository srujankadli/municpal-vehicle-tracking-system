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

  interface AssignmentWithRun extends WorkerAssignment {
    run_id?: string;
    run_status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  }

  const [assignment, setAssignment] = useState<AssignmentWithRun | null>(null);
  const [runDetail, setRunDetail] = useState<ServiceRunDetail | null>(null);
  const [updatingRun, setUpdatingRun] = useState<boolean>(false);

  const fetchAssignment = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      // 1. Fetch own operational assignment (includes run_id from service runs)
      const res = await apiClient.get<{ assignment: AssignmentWithRun | null }>(
        '/api/v1/operations/assignments/my-assignment'
      );
      setAssignment(res.assignment);

      // 2. If assignment exists, resolve service run
      const activeRunId = res.assignment?.run_id || (res.assignment?.id === 'da-demo-02' ? 'run-demo-02' : 'run-demo-01');
      if (activeRunId) {
        try {
          const runRes = await apiClient.get<{ run: ServiceRunDetail }>(
            `/api/v1/operations/runs/${activeRunId}`
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

  const handleUpdateRunStatus = async (newStatus: 'IN_PROGRESS' | 'COMPLETED') => {
    const currentRunId = assignment?.run_id || runDetail?.id || (assignment?.id === 'da-demo-02' ? 'run-demo-02' : 'run-demo-01');
    if (!currentRunId) return;

    setUpdatingRun(true);
    setError(null);
    try {
      await apiClient.patch(`/api/v1/operations/runs/${currentRunId}/status`, {
        target_status: newStatus,
        status: newStatus
      });
      await fetchAssignment(true);
    } catch (err: any) {
      setError(err.message || `Failed to update run status to ${newStatus}`);
    } finally {
      setUpdatingRun(false);
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
        <>
          <AssignmentCard assignment={assignment} roleName={roleName} />

          {/* Service Run Lifecycle Controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Truck size={18} style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
              <div>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  Collection Run Status:
                </span>{' '}
                <StatusBadge
                  category="run"
                  status={runDetail?.status || assignment.run_status || 'NOT_STARTED'}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(!runDetail?.status || runDetail.status === 'NOT_STARTED' || assignment.run_status === 'NOT_STARTED') && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleUpdateRunStatus('IN_PROGRESS')}
                  disabled={updatingRun}
                >
                  {updatingRun ? 'Starting...' : 'Start Collection Run'}
                </Button>
              )}
              {(runDetail?.status === 'IN_PROGRESS' || assignment.run_status === 'IN_PROGRESS') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUpdateRunStatus('COMPLETED')}
                  disabled={updatingRun}
                >
                  {updatingRun ? 'Completing...' : 'Complete Collection Run'}
                </Button>
              )}
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          title="No Assignment for Today"
          description="You do not have an active collection run assigned for this service date. Contact your ward sanitation supervisor if you are scheduled for field duty."
        />
      )}

      {/* 3. Doorstep Evidence Logger */}
      {assignment && (
        <EvidenceLogger
          runId={assignment.run_id || runDetail?.id || (assignment.id === 'da-demo-02' ? 'run-demo-02' : 'run-demo-01')}
          onEvidenceRecorded={handleEvidenceRecorded}
        />
      )}

      {/* 4. Offline Queue & Sync Manager */}
      {assignment && (
        <OfflineQueueViewer
          runId={assignment.run_id || runDetail?.id || (assignment.id === 'da-demo-02' ? 'run-demo-02' : 'run-demo-01')}
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
