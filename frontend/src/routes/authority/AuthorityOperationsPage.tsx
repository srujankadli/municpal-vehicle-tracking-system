import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { apiClient } from '../../api/client';
import { MetricCard } from '../../components/authority/MetricCard';
import { AuthorityGeospatialMap } from '../../components/authority/AuthorityGeospatialMap';
import { Panel } from '../../components/ui/Panel';
import { DataTable } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatDate, formatTime } from '../../i18n/formatters';
import type {
  DailyAssignment,
  OperationalAnomaly,
  ComplaintRecord,
  MasterVehicle,
  MasterRoute,
  MetricResult
} from '../../types/operations';
import {
  RotateCcw,
  AlertTriangle,
  FileText,
  Truck,
  CheckCircle2,
  Calendar,
  Layers,
  MapPin,
  ExternalLink,
  ChevronRight
} from 'lucide-react';

export const AuthorityOperationsPage: React.FC = () => {
  const { t, locale } = useTranslation();
  const { user } = useAuth();
  const isAuthorityOrAdmin = user?.role === 'AUTHORITY' || user?.role === 'ADMIN';

  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Operational Data from Backend
  const [assignments, setAssignments] = useState<DailyAssignment[]>([]);
  const [anomalies, setAnomalies] = useState<OperationalAnomaly[]>([]);
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [vehicles, setVehicles] = useState<MasterVehicle[]>([]);
  const [routes, setRoutes] = useState<MasterRoute[]>([]);

  // Derived Metrics from Backend
  const [rcMetric, setRcMetric] = useState<MetricResult | null>(null);
  const [sdrMetric, setSdrMetric] = useState<MetricResult | null>(null);
  const [foaMetric, setFoaMetric] = useState<MetricResult | null>(null);
  const [crrMetric, setCrrMetric] = useState<MetricResult | null>(null);

  // Drill-down selection state
  const [selectedRunId, setSelectedRunId] = useState<string | null>('run-demo-01');
  const [selectedAnomaly, setSelectedAnomaly] = useState<OperationalAnomaly | null>(null);

  const fetchData = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // 1. Fetch Master & Operational Collections concurrently
      const [
        assignRes,
        anomRes,
        compRes,
        vehRes,
        routeRes
      ] = await Promise.all([
        apiClient.get<{ assignments: DailyAssignment[] }>('/api/v1/operations/assignments'),
        apiClient.get<{ anomalies: OperationalAnomaly[] }>('/api/v1/anomalies'),
        apiClient.get<{ complaints: ComplaintRecord[] }>('/api/v1/complaints'),
        apiClient.get<{ vehicles: MasterVehicle[] }>('/api/v1/master/vehicles'),
        apiClient.get<{ routes: MasterRoute[] }>('/api/v1/master/routes')
      ]);

      setAssignments(assignRes.assignments || []);
      setAnomalies(anomRes.anomalies || []);
      setComplaints(compRes.complaints || []);
      setVehicles(vehRes.vehicles || []);
      setRoutes(routeRes.routes || []);

      // Fetch Authority/Admin metrics (FOA and CRR) only if authorized
      if (isAuthorityOrAdmin) {
        try {
          const [foaRes, crrRes] = await Promise.all([
            apiClient.get<MetricResult>('/api/v1/metrics/fleet-availability?service_date=2026-09-14'),
            apiClient.get<MetricResult>('/api/v1/metrics/collection-reconciliation?billing_period=2026-09')
          ]);
          setFoaMetric(foaRes || null);
          setCrrMetric(crrRes || null);
        } catch (mErr) {
          console.warn('Authority metrics fetch exception:', mErr);
          setFoaMetric(null);
          setCrrMetric(null);
        }
      } else {
        setFoaMetric(null);
        setCrrMetric(null);
      }

      // Fetch route completion and service discrepancy for the active demo run
      const activeRun = 'run-demo-01';
      try {
        const [rcRes, sdrRes] = await Promise.all([
          apiClient.get<MetricResult>(`/api/v1/metrics/route-completion/${activeRun}`),
          apiClient.get<MetricResult>(`/api/v1/metrics/service-discrepancy/${activeRun}`)
        ]);
        setRcMetric(rcRes || null);
        setSdrMetric(sdrRes || null);
      } catch (mErr) {
        console.warn('Metric sub-fetch exception:', mErr);
      }
    } catch (err: any) {
      setError(err.message || t('errors.networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const routeMap = React.useMemo(() => {
    const map = new Map<string, string>();
    routes.forEach(r => map.set(r.id, `${r.code} - ${r.name}`));
    return map;
  }, [routes]);

  const vehicleMap = React.useMemo(() => {
    const map = new Map<string, MasterVehicle>();
    vehicles.forEach(v => map.set(v.id, v));
    return map;
  }, [vehicles]);

  if (loading && !refreshing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '350px', gap: '1rem' }}>
        <LoadingSpinner size="lg" text="Loading municipal operations center records from verified backend..." />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* 1. Header with Operational Context & Refresh */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
              {t('portals.authority.title')}
            </h2>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-info-bg)',
                color: 'var(--color-info)',
                border: '1px solid var(--color-info-border)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              <Calendar size={12} aria-hidden="true" />
              Service Date: 2026-09-14
            </span>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>
            {t('portals.authority.subtitle')}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            ariaLabel="Refresh Operations Data"
          >
            <RotateCcw size={14} className={refreshing ? 'spinning' : ''} aria-hidden="true" />
            <span>{refreshing ? t('common.loading') : 'Refresh Records'}</span>
          </Button>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}

      {/* 2. Mathematical Operational Metrics Section (Phase 1 Exact Definitions) */}
      <div>
        <div style={{ marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
            Operational Integrity Metrics (Phase 1 Canonical Definitions)
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '0.125rem 0 0' }}>
            Computed directly by backend deterministic algorithms. No synthetic averages or client-side recalculations.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1rem',
          }}
        >
          <MetricCard
            title="Route Completion Rate (RC)"
            metric={rcMetric}
            description="Proportion of scheduled route households backed by verified physical scans or approved exceptions."
            caveat="A high RC does not prove 100% waste volume disposal unless weighbridge records correlate."
            unit="households"
          />

          <MetricCard
            title="Service Discrepancy Rate (SDR)"
            metric={sdrMetric}
            description="Proportion of scheduled route points where citizen non-service grievances contradict crew verification."
            caveat="Zero discrepancy indicates no lodged complaints; it does not confirm resident satisfaction."
            unit="disputes"
          />

          <MetricCard
            title="Fleet Operational Availability (FOA)"
            metric={foaMetric}
            description="Ratio of active assigned municipal collection vehicles against total operable fleet capacity."
            caveat="Vehicles under preventive maintenance are excluded from active numerator but counted in denominator."
            unit="vehicles"
          />

          <MetricCard
            title="Collection Reconciliation Ratio (CRR)"
            metric={crrMetric}
            description="Matched financial deposits verified against bank statements over total levied billing obligations."
            caveat="Calculated in exact integer paise. Does not account for unbilled commercial waste charges."
            unit="paise"
          />
        </div>
      </div>

      {/* 3. Today's Scheduled Rosters & Route Verification Status */}
      <Panel
        title="Today's Operational Roster & Service Runs"
        actions={
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Total Rosters: {assignments.length}
          </span>
        }
      >
        <DataTable<DailyAssignment>
          data={assignments}
          keyExtractor={(a) => a.id}
          caption="Daily vehicle assignments and operational execution status for Ward 14 & 15"
          columns={[
            {
              key: 'route_id',
              header: 'Assigned Route',
              render: (a) => (
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {routeMap.get(a.route_id) || a.route_id}
                  </span>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                    Start: {formatTime(a.scheduled_start, locale)}
                  </div>
                </div>
              ),
            },
            {
              key: 'vehicle_id',
              header: 'Vehicle & Reg',
              render: (a) => {
                const veh = vehicleMap.get(a.vehicle_id);
                return (
                  <div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {veh?.registration_number || a.vehicle_id}
                    </span>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', display: 'block' }}>
                      {veh?.vehicle_type || 'VEHICLE'} ({veh?.capacity_tons || 0}T)
                    </span>
                  </div>
                );
              },
            },
            {
              key: 'status',
              header: 'Run Status',
              render: (a) => (
                <StatusBadge
                  category="verification"
                  status={
                    a.status === 'COMPLETED'
                      ? 'VERIFIED'
                      : a.status === 'IN_PROGRESS'
                      ? 'OBSERVED'
                      : 'EXPECTED'
                  }
                  customLabel={a.status}
                />
              ),
            },
            {
              key: 'notes',
              header: 'Operational Notes',
              render: (a) => (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                  {a.notes || 'Normal routine schedule'}
                </span>
              ),
            },
            {
              key: 'actions',
              header: 'Audit Drill-Down',
              render: (a) => (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Switch run drill-down view
                    const runMap: Record<string, string> = {
                      'da-demo-01': 'run-demo-01',
                      'da-demo-02': 'run-demo-02',
                      'da-demo-03': 'run-demo-03'
                    };
                    const targetRun = runMap[a.id] || 'run-demo-01';
                    setSelectedRunId(targetRun);
                    // Fetch corresponding metrics
                    Promise.all([
                      apiClient.get<MetricResult>(`/api/v1/metrics/route-completion/${targetRun}`),
                      apiClient.get<MetricResult>(`/api/v1/metrics/service-discrepancy/${targetRun}`)
                    ]).then(([rc, sdr]) => {
                      setRcMetric(rc);
                      setSdrMetric(sdr);
                    });
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <span>Inspect Run</span>
                  <ChevronRight size={12} aria-hidden="true" />
                </Button>
              ),
            },
          ]}
        />
      </Panel>

      {/* 4. Operational Anomalies (Phase 1 Canonical Engine: ANOM-01 to ANOM-07) */}
      <Panel
        title="Active Operational Exceptions & Anomalies"
        actions={
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: anomalies.length > 0 ? 'var(--color-danger-bg)' : 'var(--color-success-bg)',
              color: anomalies.length > 0 ? 'var(--color-danger)' : 'var(--color-success)',
              border: `1px solid ${anomalies.length > 0 ? 'var(--color-danger-border)' : 'var(--color-success-border)'}`,
            }}
          >
            {anomalies.length} Flagged
          </span>
        }
      >
        <div style={{ marginBottom: '0.75rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          Exceptions detected by rule-based algorithmic scrutiny (unresolved disputes, settlement discrepancies, prolonged vehicle inactivity).
        </div>

        <DataTable<OperationalAnomaly>
          data={anomalies}
          keyExtractor={(anom) => anom.id}
          caption="Deterministic anomaly detections requiring authority oversight"
          emptyMessage="No operational exceptions currently detected across active runs."
          columns={[
            {
              key: 'anomaly_id',
              header: 'Rule ID',
              render: (anom) => (
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {anom.anomaly_id}
                </span>
              ),
            },
            {
              key: 'severity',
              header: 'Attention Level',
              render: (anom) => (
                <StatusBadge category="anomaly" status={anom.severity} />
              ),
            },
            {
              key: 'description',
              header: 'Objective Condition',
              render: (anom) => (
                <div>
                  <p style={{ margin: 0, fontWeight: 500, color: 'var(--color-text-primary)', fontSize: '0.8125rem' }}>
                    {anom.description}
                  </p>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                    Detected: {formatDate(anom.detected_at, locale)} {formatTime(anom.detected_at, locale)}
                  </span>
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (anom) => (
                <StatusBadge category="anomaly" status={anom.status} customLabel={anom.status} />
              ),
            },
            {
              key: 'actions',
              header: 'Evidence Drill-Down',
              render: (anom) => (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedAnomaly(anom)}
                >
                  Inspect Evidence
                </Button>
              ),
            },
          ]}
        />
      </Panel>

      {/* Selected Anomaly Evidence Modal / Drawer Box */}
      {selectedAnomaly && (
        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border-strong)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Anomaly Trigger Evidence: {selectedAnomaly.anomaly_id}
            </h4>
            <Button variant="outline" size="sm" onClick={() => setSelectedAnomaly(null)}>
              Close
            </Button>
          </div>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            {selectedAnomaly.description}
          </p>
          <pre
            style={{
              backgroundColor: 'var(--color-surface-subtle)',
              border: '1px solid var(--color-border-subtle)',
              padding: '0.75rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              overflowX: 'auto',
              margin: 0,
            }}
          >
            {JSON.stringify(JSON.parse(selectedAnomaly.trigger_evidence_json || '{}'), null, 2)}
          </pre>
        </div>
      )}

      {/* 5. Citizen Grievances & Verification Disputes */}
      <Panel
        title="Citizen Missed-Collection Grievances & Disputes"
        actions={
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {complaints.length} Submitted Complaints
          </span>
        }
      >
        <div style={{ marginBottom: '0.75rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          Citizen grievances logged through municipal channels. Grievance lodging triggers ANOM-03 scrutiny and transitions verified collections into <strong>DISPUTED</strong> until supervisor review.
        </div>

        <DataTable<ComplaintRecord>
          data={complaints}
          keyExtractor={(c) => c.id}
          caption="Citizen reported missed collection events"
          emptyMessage="No citizen complaints currently filed for this service cycle."
          columns={[
            {
              key: 'service_date',
              header: 'Service Date',
              render: (c) => formatDate(c.service_date, locale),
            },
            {
              key: 'household_id',
              header: 'Premises ID',
              render: (c) => (
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {c.household_id}
                </span>
              ),
            },
            {
              key: 'complaint_type',
              header: 'Grievance Type',
              render: (c) => (
                <span style={{ fontWeight: 500, fontSize: '0.8125rem' }}>
                  {c.complaint_type}
                </span>
              ),
            },
            {
              key: 'resident_remarks',
              header: 'Resident Remarks',
              render: (c) => (
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                  "{c.resident_remarks}"
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Dispute Status',
              render: (c) => (
                <StatusBadge
                  category="verification"
                  status="DISPUTED"
                  customLabel={c.status}
                />
              ),
            },
            {
              key: 'filed_at',
              header: 'Logged At',
              render: (c) => formatTime(c.filed_at, locale),
            },
          ]}
        />
      </Panel>

      {/* 6. Geospatial Operational Map & Route Corridors (Phase 2.5) */}
      <AuthorityGeospatialMap />
    </div>
  );
};
