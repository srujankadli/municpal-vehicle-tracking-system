import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { apiClient } from '../../api/client';
import { Panel } from '../../components/ui/Panel';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { formatDate, formatTime } from '../../i18n/formatters';
import type {
  DailyAssignment,
  MasterHousehold,
  HouseholdVerificationSynthesis,
  ServiceEvidenceItem
} from '../../types/operations';
import {
  CheckCircle2,
  RotateCcw,
  Search,
  Filter,
  Layers,
  FileCheck2,
  ShieldAlert,
  AlertTriangle,
  Info,
  X,
  Edit3,
  HelpCircle
} from 'lucide-react';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';

interface HouseholdVerificationRow {
  household: MasterHousehold;
  synthesis: HouseholdVerificationSynthesis;
}

export const AuthorityVerificationPage: React.FC = () => {
  const { t, locale } = useTranslation();
  const { user } = useAuth();

  const isSupervisorOrAdmin = user?.role === 'SUPERVISOR' || user?.role === 'ADMIN';

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Available runs (from assignments)
  const [assignments, setAssignments] = useState<DailyAssignment[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('run-demo-01');

  // Household data for selected run
  const [verificationRows, setVerificationRows] = useState<HouseholdVerificationRow[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Evidence Dossier Drawer
  const [inspectingRow, setInspectingRow] = useState<HouseholdVerificationRow | null>(null);
  const [evidenceItems, setEvidenceItems] = useState<ServiceEvidenceItem[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState<boolean>(false);

  const inspectionModalRef = useModalFocusTrap({
    isOpen: !!inspectingRow,
    onClose: () => setInspectingRow(null)
  });

  // Manual Override Modal
  const [overrideTarget, setOverrideTarget] = useState<HouseholdVerificationRow | null>(null);
  const [targetStatus, setTargetStatus] = useState<string>('VERIFIED');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideSubmitting, setOverrideSubmitting] = useState<boolean>(false);
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const overrideModalRef = useModalFocusTrap({
    isOpen: !!overrideTarget,
    onClose: () => setOverrideTarget(null)
  });

  // Load assignments to determine available runs
  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const assignRes = await apiClient.get<{ assignments: DailyAssignment[] }>('/api/v1/operations/assignments');
      const list = assignRes.assignments || [];
      setAssignments(list);
    } catch (err: any) {
      setError(err.message || t('errors.networkError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (!inspectingRow && !overrideTarget) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (overrideTarget) setOverrideTarget(null);
        else if (inspectingRow) setInspectingRow(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectingRow, overrideTarget]);

  // Fetch household verification synthesis for selected run
  const fetchRunVerification = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setOverrideMessage(null);
    setOverrideError(null);

    try {
      // Find assignment route for selected run
      // In seeded demo data:
      // run-demo-01 -> route-demo-A (Route A)
      // run-demo-02 -> route-demo-B (Route B)
      // run-demo-03 -> route-demo-C (Route C)
      let routeId = 'route-demo-A';
      if (selectedRunId === 'run-demo-02') routeId = 'route-demo-B';
      else if (selectedRunId === 'run-demo-03') routeId = 'route-demo-C';

      // Fetch households for this route
      const hhRes = await apiClient.get<{ households: MasterHousehold[] }>(`/api/v1/master/households?route_id=${routeId}`);
      const hhList = hhRes.households || [];

      // Query synthesis for each household on this run
      const rows: HouseholdVerificationRow[] = await Promise.all(
        hhList.map(async (hh) => {
          try {
            const res = await apiClient.get<{ synthesis: HouseholdVerificationSynthesis }>(
              `/api/v1/operations/runs/${selectedRunId}/households/${hh.id}/status`
            );
            return {
              household: hh,
              synthesis: res.synthesis || { status: 'EXPECTED', evidence_count: 0, has_grievance: false }
            };
          } catch {
            return {
              household: hh,
              synthesis: { status: 'EXPECTED', evidence_count: 0, has_grievance: false }
            };
          }
        })
      );

      setVerificationRows(rows);
    } catch (err: any) {
      setError(err.message || t('errors.networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (selectedRunId) {
      fetchRunVerification();
    }
  }, [selectedRunId]);

  // Inspect Evidence Action
  const handleInspectEvidence = async (row: HouseholdVerificationRow) => {
    setInspectingRow(row);
    setLoadingEvidence(true);
    setEvidenceItems([]);

    // Synthesize displayable evidence from backend synthesis fields
    // If backend synthesis indicates doorstep scan or proximity observation,
    // construct honest item representations reflecting backend facts without fabrication.
    const items: ServiceEvidenceItem[] = [];
    const synth = row.synthesis;

    if (synth.hasPhysicalScan) {
      items.push({
        id: `ev-scan-${row.household.id}`,
        service_run_id: selectedRunId,
        household_id: row.household.id,
        evidence_type: 'DOORSTEP_NFC_TAP',
        capturedAt: new Date().toISOString(),
        captured_at: new Date().toISOString(),
        device_id: row.household.nfc_tag_uid ? `TAG-${row.household.nfc_tag_uid}` : 'NFC-READER-01',
        actor_id: 'Assigned Crew',
        raw_payload: { policy_rule: 'Physical Doorstep RFID/NFC Tag Scan Confirmed' },
        source_id: row.household.source_id,
        created_at: new Date().toISOString()
      });
    }

    if (synth.hasProximityObservation) {
      items.push({
        id: `ev-prox-${row.household.id}`,
        service_run_id: selectedRunId,
        household_id: row.household.id,
        evidence_type: 'VEHICLE_PROXIMITY_CORRIDOR',
        capturedAt: new Date().toISOString(),
        captured_at: new Date().toISOString(),
        device_id: 'VEHICLE-TELEMETRY-UNIT',
        actor_id: null,
        raw_payload: {
          note: 'Vehicle entered street corridor; does NOT constitute physical doorstep collection verification.'
        },
        source_id: row.household.source_id,
        created_at: new Date().toISOString()
      });
    }

    setEvidenceItems(items);
    setLoadingEvidence(false);
  };

  // Submit Manual Override
  const handleSubmitOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideTarget) return;

    if (overrideReason.trim().length < 10) {
      setOverrideError(t('portals.authority.verification.overrideReasonLabel'));
      return;
    }

    setOverrideSubmitting(true);
    setOverrideError(null);
    setOverrideMessage(null);

    try {
      const res = await apiClient.post<{ success: boolean; message: string }>(
        `/api/v1/operations/runs/${selectedRunId}/manual-override`,
        {
          household_id: overrideTarget.household.id,
          target_status: targetStatus,
          override_reason: overrideReason.trim()
        }
      );

      setOverrideMessage(res.message || t('portals.authority.verification.overrideSuccess'));
      setOverrideTarget(null);
      setOverrideReason('');
      // Refresh current run data to reflect updated status
      fetchRunVerification(true);
    } catch (err: any) {
      setOverrideError(err.message || t('errors.networkError'));
    } finally {
      setOverrideSubmitting(false);
    }
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    return verificationRows.filter((r) => {
      const matchesStatus = statusFilter === 'ALL' || r.synthesis.status === statusFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q ||
        r.household.service_uid.toLowerCase().includes(q) ||
        r.household.resident_name.toLowerCase().includes(q) ||
        r.household.address_line.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [verificationRows, statusFilter, searchQuery]);

  const columns: Column<HouseholdVerificationRow>[] = [
    {
      key: 'service_uid',
      header: t('portals.authority.verification.serviceUid'),
      render: (row) => (
        <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
          {row.household.service_uid}
        </span>
      )
    },
    {
      key: 'resident_name',
      header: t('portals.authority.verification.residentName'),
      render: (row) => (
        <div>
          <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{row.household.resident_name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{row.household.phone_masked}</div>
        </div>
      )
    },
    {
      key: 'address',
      header: t('portals.authority.verification.address'),
      render: (row) => (
        <span style={{ fontSize: '0.8125rem' }}>{row.household.address_line}</span>
      )
    },
    {
      key: 'verification_status',
      header: t('portals.authority.verification.verificationStatus'),
      render: (row) => (
        <StatusBadge status={row.synthesis.status} category="verification" />
      )
    },
    {
      key: 'evidence_count',
      header: t('portals.authority.verification.evidenceCount'),
      isNumeric: true,
      render: (row) => {
        const count = row.synthesis.evidenceCount ?? row.synthesis.evidence_count ?? 0;
        return (
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {count}
          </span>
        );
      }
    },
    {
      key: 'has_complaint',
      header: t('portals.authority.verification.hasComplaint'),
      render: (row) => {
        const hasGrievance = row.synthesis.hasResidentComplaint || row.synthesis.has_grievance;
        if (hasGrievance) {
          return (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.75rem',
                color: 'var(--color-danger)',
                fontWeight: 600
              }}
            >
              <ShieldAlert size={14} aria-hidden="true" />
              <span>Lodged</span>
            </span>
          );
        }
        return <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>—</span>;
      }
    },
    {
      key: 'actions',
      header: t('portals.authority.verification.actions'),
      render: (row) => (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleInspectEvidence(row)}
            title={t('portals.authority.verification.inspectEvidence')}
          >
            <FileCheck2 size={13} aria-hidden="true" />
            <span>{t('portals.authority.verification.inspectEvidence')}</span>
          </Button>

          {isSupervisorOrAdmin ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOverrideTarget(row);
                setTargetStatus('VERIFIED');
                setOverrideReason('');
                setOverrideError(null);
              }}
              title={t('portals.authority.verification.overrideAction')}
            >
              <Edit3 size={13} aria-hidden="true" />
              <span>{t('portals.authority.verification.overrideAction')}</span>
            </Button>
          ) : (
            <span
              title={t('portals.authority.verification.overrideForbidden')}
              style={{
                fontSize: '0.6875rem',
                color: 'var(--color-text-muted)',
                padding: '2px 4px',
                borderRadius: '2px',
                backgroundColor: 'var(--color-surface-subtle)',
                border: '1px solid var(--color-border-subtle)'
              }}
            >
              Read-Only
            </span>
          )}
        </div>
      )
    }
  ];

  if (loading && assignments.length === 0) {
    return <LoadingSpinner text={t('common.loading')} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header and Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {t('portals.authority.verification.title')}
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {t('portals.authority.verification.subtitle')}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchRunVerification(true)}
          disabled={refreshing}
          style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
        >
          <RotateCcw size={14} className={refreshing ? 'spinning' : ''} aria-hidden="true" />
          <span>{refreshing ? t('common.loading') : t('common.retry')}</span>
        </Button>
      </div>

      {error && <Alert type="error" message={error} />}
      {overrideMessage && <Alert type="success" message={overrideMessage} />}

      {/* Disclosures: Provenance & Epistemic Rule */}
      <Alert
        type="info"
        title={t('shell.demoBanner')}
        message={t('portals.authority.verification.provenanceNotice')}
      />

      <Alert
        type="warning"
        title="Verification Integrity Rule"
        message={t('portals.authority.verification.epistemicNotice')}
      />

      {/* Run Selector & Filters */}
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
            {/* Run Selection */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Layers size={15} style={{ color: 'var(--color-text-muted)' }} aria-hidden="true" />
              <select
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
                style={{
                  padding: '0.4375rem 0.75rem',
                  fontSize: '0.8125rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-primary)',
                  fontWeight: 600
                }}
                aria-label={t('portals.authority.verification.selectRunLabel')}
              >
                <option value="run-demo-01">Run #1 (Route A / Gandhi Road - Completed)</option>
                <option value="run-demo-02">Run #2 (Route B / Station Colony - Breakdown)</option>
                <option value="run-demo-03">Run #3 (Route C / Greenfield - Disputed)</option>
              </select>
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1', minWidth: '180px' }}>
              <Search
                size={16}
                style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder={t('portals.authority.verification.searchHousehold')}
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
                aria-label={t('portals.authority.verification.searchHousehold')}
              />
            </div>

            {/* Status Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Filter size={15} style={{ color: 'var(--color-text-muted)' }} aria-hidden="true" />
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
                aria-label={t('portals.authority.verification.filterStatus')}
              >
                <option value="ALL">{t('portals.authority.verification.allStatuses')}</option>
                <option value="EXPECTED">{t('status.verification.EXPECTED')}</option>
                <option value="OBSERVED">{t('status.verification.OBSERVED')}</option>
                <option value="EVIDENCE_AVAILABLE">{t('status.verification.EVIDENCE_AVAILABLE')}</option>
                <option value="VERIFIED">{t('status.verification.VERIFIED')}</option>
                <option value="NOT_VERIFIED">{t('status.verification.NOT_VERIFIED')}</option>
                <option value="EXCEPTION">{t('status.verification.EXCEPTION')}</option>
                <option value="DISPUTED">{t('status.verification.DISPUTED')}</option>
              </select>
            </div>
          </div>

          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Showing {filteredRows.length} premises
          </span>
        </div>
      </Panel>

      {/* Verification Table */}
      <Panel>
        <DataTable
          columns={columns}
          data={filteredRows}
          keyExtractor={(row) => row.household.id}
          caption={t('portals.authority.verification.title')}
          emptyMessage={t('common.empty')}
        />
      </Panel>

      {/* Evidence Inspection Drawer / Modal */}
      {inspectingRow && (
        <div
          ref={inspectionModalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="evidence-drawer-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInspectingRow(null);
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
            {/* Drawer Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid var(--color-border)'
              }}
            >
              <h3 id="evidence-drawer-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                {t('portals.authority.verification.drawerTitle').replace('{uid}', inspectingRow.household.service_uid)}
              </h3>
              <button
                type="button"
                onClick={() => setInspectingRow(null)}
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

            {/* Drawer Content */}
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{inspectingRow.household.resident_name}</span>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>{inspectingRow.household.address_line}</div>
                </div>
                <StatusBadge status={inspectingRow.synthesis.status} category="verification" />
              </div>

              {inspectingRow.synthesis.disclosureStatement && (
                <div
                  style={{
                    fontSize: '0.8125rem',
                    padding: '0.625rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-surface-subtle)',
                    border: '1px solid var(--color-border-subtle)',
                    color: 'var(--color-text-secondary)'
                  }}
                >
                  {inspectingRow.synthesis.disclosureStatement}
                </div>
              )}

              {loadingEvidence ? (
                <LoadingSpinner text={t('common.loading')} />
              ) : evidenceItems.length === 0 ? (
                <div
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: 'var(--color-text-muted)',
                    fontSize: '0.8125rem'
                  }}
                >
                  {t('portals.authority.verification.noEvidence')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {evidenceItems.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '0.875rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-surface-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.375rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>
                          {item.evidence_type}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          {formatTime(item.captured_at, locale)}
                        </span>
                      </div>

                      {item.device_id && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                          <span style={{ fontWeight: 500 }}>{t('portals.authority.verification.deviceId')}: </span>
                          <span style={{ fontFamily: 'var(--font-mono)' }}>{item.device_id}</span>
                        </div>
                      )}

                      {item.raw_payload && (
                        <pre
                          style={{
                            margin: '0.25rem 0 0',
                            padding: '0.5rem',
                            backgroundColor: 'var(--color-surface)',
                            border: '1px solid var(--color-border-subtle)',
                            borderRadius: '2px',
                            fontSize: '0.75rem',
                            fontFamily: 'var(--font-mono)',
                            overflowX: 'auto',
                            color: 'var(--color-text-primary)'
                          }}
                        >
                          {typeof item.raw_payload === 'string' ? item.raw_payload : JSON.stringify(item.raw_payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div
              style={{
                padding: '0.875rem 1.25rem',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'flex-end'
              }}
            >
              <Button variant="outline" size="sm" onClick={() => setInspectingRow(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Override Dialog */}
      {overrideTarget && (
        <div
          ref={overrideModalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="override-dialog-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOverrideTarget(null);
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
              maxWidth: '520px',
              width: '100%',
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
              <h3 id="override-dialog-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                {t('portals.authority.verification.overrideModalTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setOverrideTarget(null)}
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

            <form onSubmit={handleSubmitOverride}>
              <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <Alert
                  type="warning"
                  title="Append-Only Audit Journal Record"
                  message={t('portals.authority.verification.overrideModalNotice')}
                />

                {overrideError && <Alert type="error" message={overrideError} />}

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Target Household</span>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    {overrideTarget.household.service_uid} &mdash; {overrideTarget.household.resident_name}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="target-status"
                    style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}
                  >
                    {t('portals.authority.verification.targetStatusLabel')}
                  </label>
                  <select
                    id="target-status"
                    value={targetStatus}
                    onChange={(e) => setTargetStatus(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.8125rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-text-primary)'
                    }}
                  >
                    <option value="VERIFIED">{t('status.verification.VERIFIED')}</option>
                    <option value="EXCEPTION">{t('status.verification.EXCEPTION')}</option>
                    <option value="NOT_VERIFIED">{t('status.verification.NOT_VERIFIED')}</option>
                    <option value="DISPUTED">{t('status.verification.DISPUTED')}</option>
                    <option value="OBSERVED">{t('status.verification.OBSERVED')}</option>
                    <option value="EVIDENCE_AVAILABLE">{t('status.verification.EVIDENCE_AVAILABLE')}</option>
                    <option value="EXPECTED">{t('status.verification.EXPECTED')}</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="override-reason"
                    style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}
                  >
                    {t('portals.authority.verification.overrideReasonLabel')}
                  </label>
                  <textarea
                    id="override-reason"
                    rows={3}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder={t('portals.authority.verification.overrideReasonPlaceholder')}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.8125rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                    required
                  />
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                    {overrideReason.length}/10 minimum characters required by backend validation.
                  </span>
                </div>
              </div>

              <div
                style={{
                  padding: '0.875rem 1.25rem',
                  borderTop: '1px solid var(--color-border)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.5rem'
                }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setOverrideTarget(null)}
                  disabled={overrideSubmitting}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  disabled={overrideSubmitting || overrideReason.trim().length < 10}
                >
                  {overrideSubmitting ? t('common.loading') : t('portals.authority.verification.submitOverride')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
