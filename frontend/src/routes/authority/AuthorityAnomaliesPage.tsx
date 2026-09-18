import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { apiClient } from '../../api/client';
import { Panel } from '../../components/ui/Panel';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { formatDate, formatTime } from '../../i18n/formatters';
import type { OperationalAnomaly } from '../../types/operations';
import {
  AlertTriangle,
  RotateCcw,
  Search,
  Filter,
  Eye,
  X,
  PlayCircle,
  Info,
  CheckCircle2
} from 'lucide-react';

export const AuthorityAnomaliesPage: React.FC = () => {
  const { t, locale } = useTranslation();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [anomalies, setAnomalies] = useState<OperationalAnomaly[]>([]);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Trigger Evidence Drawer
  const [inspectingAnomaly, setInspectingAnomaly] = useState<OperationalAnomaly | null>(null);

  // Manual Evaluation States
  const [evaluatingInactivity, setEvaluatingInactivity] = useState<boolean>(false);
  const [evaluatingAbandonment, setEvaluatingAbandonment] = useState<boolean>(false);
  const [evaluationFeedback, setEvaluationFeedback] = useState<string | null>(null);

  const fetchAnomalies = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await apiClient.get<{ anomalies: OperationalAnomaly[] }>('/api/v1/anomalies');
      setAnomalies(res.anomalies || []);
    } catch (err: any) {
      setError(err.message || t('errors.networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnomalies();
  }, []);

  useEffect(() => {
    if (!inspectingAnomaly) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInspectingAnomaly(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectingAnomaly]);

  // Trigger explicit evaluation for ANOM-01
  const handleEvaluateInactivity = async () => {
    setEvaluatingInactivity(true);
    setEvaluationFeedback(null);
    try {
      // Use active demo assignment da-demo-01
      const res = await apiClient.post<{ anomaly_triggered: boolean; anomaly: OperationalAnomaly | null }>(
        '/api/v1/anomalies/evaluate-inactivity/da-demo-01',
        { current_time: '2026-09-14T09:00:00.000Z' }
      );
      if (res.anomaly_triggered && res.anomaly) {
        setEvaluationFeedback(
          t('portals.authority.anomalies.evaluateSuccess').replace('{result}', `Triggered ANOM-01 (${res.anomaly.description})`)
        );
      } else {
        setEvaluationFeedback(t('portals.authority.anomalies.noAnomaliesTriggered'));
      }
      fetchAnomalies(true);
    } catch (err: any) {
      setError(err.message || t('errors.networkError'));
    } finally {
      setEvaluatingInactivity(false);
    }
  };

  // Trigger explicit evaluation for ANOM-06
  const handleEvaluateAbandonment = async () => {
    setEvaluatingAbandonment(true);
    setEvaluationFeedback(null);
    try {
      // Use run-demo-01
      const res = await apiClient.post<{ anomaly_triggered: boolean; anomaly: OperationalAnomaly | null }>(
        '/api/v1/anomalies/evaluate-abandonment/run-demo-01'
      );
      if (res.anomaly_triggered && res.anomaly) {
        setEvaluationFeedback(
          t('portals.authority.anomalies.evaluateSuccess').replace('{result}', `Triggered ANOM-06 (${res.anomaly.description})`)
        );
      } else {
        setEvaluationFeedback(t('portals.authority.anomalies.noAnomaliesTriggered'));
      }
      fetchAnomalies(true);
    } catch (err: any) {
      setError(err.message || t('errors.networkError'));
    } finally {
      setEvaluatingAbandonment(false);
    }
  };

  // Filtered anomalies
  const filteredAnomalies = useMemo(() => {
    return anomalies.filter((a) => {
      const matchesSeverity = severityFilter === 'ALL' || a.severity === severityFilter;
      const matchesStatus = statusFilter === 'ALL' || a.status === statusFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q ||
        a.anomaly_id.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        (a.service_run_id && a.service_run_id.toLowerCase().includes(q));
      return matchesSeverity && matchesStatus && matchesSearch;
    });
  }, [anomalies, severityFilter, statusFilter, searchQuery]);

  const columns: Column<OperationalAnomaly>[] = [
    {
      key: 'anomaly_id',
      header: t('portals.authority.anomalies.anomalyId'),
      render: (anom) => (
        <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
          {anom.anomaly_id}
        </span>
      )
    },
    {
      key: 'severity',
      header: t('portals.authority.anomalies.severity'),
      render: (anom) => (
        <StatusBadge category="anomaly" status={anom.severity} />
      )
    },
    {
      key: 'description',
      header: t('portals.authority.anomalies.description'),
      render: (anom) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
            {anom.description}
          </div>
          {anom.service_run_id && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
              {t('portals.authority.anomalies.affectedRun')}: {anom.service_run_id}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'status',
      header: t('portals.authority.anomalies.status'),
      render: (anom) => (
        <StatusBadge category="anomaly" status={anom.status} customLabel={anom.status} />
      )
    },
    {
      key: 'detected_at',
      header: t('portals.authority.anomalies.detectedAt'),
      render: (anom) => (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {formatDate(anom.detected_at, locale)} {formatTime(anom.detected_at, locale)}
        </span>
      )
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (anom) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setInspectingAnomaly(anom)}
          title={t('portals.authority.anomalies.inspectEvidence')}
        >
          <Eye size={13} aria-hidden="true" />
          <span>{t('portals.authority.anomalies.inspectEvidence')}</span>
        </Button>
      )
    }
  ];

  if (loading && anomalies.length === 0) {
    return <LoadingSpinner text={t('common.loading')} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header and Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {t('portals.authority.anomalies.title')}
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {t('portals.authority.anomalies.subtitle')}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchAnomalies(true)}
          disabled={refreshing}
          style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
        >
          <RotateCcw size={14} className={refreshing ? 'spinning' : ''} aria-hidden="true" />
          <span>{refreshing ? t('common.loading') : t('common.retry')}</span>
        </Button>
      </div>

      {error && <Alert type="error" message={error} />}
      {evaluationFeedback && <Alert type="info" message={evaluationFeedback} />}

      {/* Disclosures: Provenance & Objective Rule-Based Character */}
      <Alert
        type="info"
        title={t('shell.demoBanner')}
        message={t('portals.authority.anomalies.provenanceNotice')}
      />

      <Alert
        type="warning"
        title="Objective Discrepancy Scrutiny"
        message={t('portals.authority.anomalies.objectiveNotice')}
      />

      {/* Explicit Backend Evaluation Trigger Panel */}
      <Panel
        title={t('portals.authority.anomalies.evaluateSectionTitle')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            {t('portals.authority.anomalies.evaluateSectionSubtitle')}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEvaluateInactivity}
              disabled={evaluatingInactivity}
            >
              <PlayCircle size={14} aria-hidden="true" />
              <span>{evaluatingInactivity ? t('portals.authority.anomalies.evaluating') : t('portals.authority.anomalies.evaluateInactivityBtn')}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleEvaluateAbandonment}
              disabled={evaluatingAbandonment}
            >
              <PlayCircle size={14} aria-hidden="true" />
              <span>{evaluatingAbandonment ? t('portals.authority.anomalies.evaluating') : t('portals.authority.anomalies.evaluateAbandonmentBtn')}</span>
            </Button>
          </div>
        </div>
      </Panel>

      {/* Filter and Search Bar */}
      <Panel>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', flex: 1, minWidth: '260px' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1', minWidth: '180px' }}>
              <Search
                size={16}
                style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder={t('portals.authority.anomalies.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.4375rem 0.75rem 0.4375rem 2.25rem',
                  fontSize: '0.8125rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-primary)'
                }}
                aria-label={t('portals.authority.anomalies.searchPlaceholder')}
              />
            </div>

            {/* Severity Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Filter size={15} style={{ color: 'var(--color-text-muted)' }} aria-hidden="true" />
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                style={{
                  padding: '0.4375rem 0.75rem',
                  fontSize: '0.8125rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-primary)'
                }}
                aria-label={t('portals.authority.anomalies.filterSeverity')}
              >
                <option value="ALL">{t('portals.authority.anomalies.allSeverities')}</option>
                <option value="CRITICAL">{t('status.anomaly.CRITICAL')}</option>
                <option value="HIGH">{t('status.anomaly.HIGH')}</option>
                <option value="MEDIUM">{t('status.anomaly.MEDIUM')}</option>
                <option value="LOW">{t('status.anomaly.LOW')}</option>
              </select>
            </div>

            {/* Status Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '0.4375rem 0.75rem',
                  fontSize: '0.8125rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-primary)'
                }}
                aria-label={t('portals.authority.anomalies.filterStatus')}
              >
                <option value="ALL">{t('portals.authority.anomalies.allStatuses')}</option>
                <option value="UNRESOLVED">{t('status.anomaly.UNRESOLVED')}</option>
                <option value="INVESTIGATING">{t('status.anomaly.INVESTIGATING')}</option>
                <option value="RESOLVED">{t('status.anomaly.RESOLVED')}</option>
                <option value="DISMISSED">{t('status.anomaly.DISMISSED')}</option>
              </select>
            </div>
          </div>

          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {filteredAnomalies.length} Incidents Flagged
          </span>
        </div>
      </Panel>

      {/* Anomalies Table */}
      <Panel>
        <DataTable
          columns={columns}
          data={filteredAnomalies}
          keyExtractor={(anom) => anom.id}
          caption={t('portals.authority.anomalies.title')}
          emptyMessage={t('common.empty')}
        />
      </Panel>

      {/* Trigger Evidence Inspection Drawer */}
      {inspectingAnomaly && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="anomaly-evidence-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInspectingAnomaly(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid var(--color-border)'
              }}
            >
              <h3 id="anomaly-evidence-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                {t('portals.authority.anomalies.evidenceDrawerTitle').replace('{id}', inspectingAnomaly.anomaly_id)}
              </h3>
              <button
                type="button"
                onClick={() => setInspectingAnomaly(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '1.125rem' }}>
                  {inspectingAnomaly.anomaly_id}
                </span>
                <StatusBadge category="anomaly" status={inspectingAnomaly.severity} />
              </div>

              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                {inspectingAnomaly.description}
              </p>

              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                  Trigger Evidence Payload (Deterministic JSON):
                </span>
                <pre
                  style={{
                    margin: '0.375rem 0 0',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-surface-subtle)',
                    border: '1px solid var(--color-border)',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    overflowX: 'auto',
                    color: 'var(--color-text-primary)'
                  }}
                >
                  {inspectingAnomaly.trigger_evidence_json || (inspectingAnomaly as any).trigger_evidence
                    ? JSON.stringify(
                        typeof inspectingAnomaly.trigger_evidence_json === 'string'
                          ? JSON.parse(inspectingAnomaly.trigger_evidence_json || '{}')
                          : (inspectingAnomaly as any).trigger_evidence,
                        null,
                        2
                      )
                    : t('portals.authority.anomalies.noEvidence')}
                </pre>
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Detected at: {formatDate(inspectingAnomaly.detected_at, locale)} {formatTime(inspectingAnomaly.detected_at, locale)}
              </div>
            </div>

            <div
              style={{
                padding: '0.875rem 1.25rem',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'flex-end'
              }}
            >
              <Button variant="outline" size="sm" onClick={() => setInspectingAnomaly(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
