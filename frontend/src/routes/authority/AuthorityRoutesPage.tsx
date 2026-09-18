import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n/I18nContext';
import { apiClient } from '../../api/client';
import { Panel } from '../../components/ui/Panel';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { formatDate, formatTime } from '../../i18n/formatters';
import type {
  MasterRoute,
  MasterWard,
  MasterVehicle,
  MasterWorker,
  DailyAssignment
} from '../../types/operations';
import {
  MapPin,
  RotateCcw,
  Search,
  Filter,
  Calendar,
  Truck,
  User,
  ShieldCheck,
  ExternalLink,
  Info
} from 'lucide-react';

interface RouteAssignmentRow {
  route: MasterRoute;
  wardName?: string;
  assignment?: DailyAssignment;
  vehicleRegistration?: string;
  driverName?: string;
  supervisorName?: string;
}

export const AuthorityRoutesPage: React.FC = () => {
  const { t, locale } = useTranslation();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Selected Service Date for temporal assignment lookup
  const [serviceDate, setServiceDate] = useState<string>('2026-09-14');

  // Master and Operational state
  const [routes, setRoutes] = useState<MasterRoute[]>([]);
  const [wards, setWards] = useState<MasterWard[]>([]);
  const [vehicles, setVehicles] = useState<MasterVehicle[]>([]);
  const [workers, setWorkers] = useState<MasterWorker[]>([]);
  const [assignments, setAssignments] = useState<DailyAssignment[]>([]);

  // Filters
  const [selectedWardId, setSelectedWardId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchRoutesData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [routeRes, wardRes, vehRes, wrkRes, assignRes] = await Promise.all([
        apiClient.get<{ routes: MasterRoute[] }>('/api/v1/master/routes'),
        apiClient.get<{ wards: MasterWard[] }>('/api/v1/master/wards'),
        apiClient.get<{ vehicles: MasterVehicle[] }>('/api/v1/master/vehicles'),
        apiClient.get<{ workers: MasterWorker[] }>('/api/v1/master/workers'),
        apiClient.get<{ assignments: DailyAssignment[] }>(`/api/v1/operations/assignments?service_date=${serviceDate}`)
      ]);

      setRoutes(routeRes.routes || []);
      setWards(wardRes.wards || []);
      setVehicles(vehRes.vehicles || []);
      setWorkers(wrkRes.workers || []);
      setAssignments(assignRes.assignments || []);
    } catch (err: any) {
      setError(err.message || t('errors.networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRoutesData();
  }, [serviceDate]);

  // Lookup maps for fast deterministic correlation without fabrication
  const wardMap = useMemo(() => new Map(wards.map((w) => [w.id, w.name])), [wards]);
  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v.registration_number])), [vehicles]);
  const workerMap = useMemo(() => new Map(workers.map((w) => [w.id, w.full_name])), [workers]);

  // Assignments mapped by route_id for the selected service date
  const assignmentByRoute = useMemo(() => {
    const map = new Map<string, DailyAssignment>();
    for (const a of assignments) {
      if (a.route_id) {
        map.set(a.route_id, a);
      }
    }
    return map;
  }, [assignments]);

  // Synthesized Rows
  const combinedRows = useMemo<RouteAssignmentRow[]>(() => {
    return routes.map((route) => {
      const assignment = assignmentByRoute.get(route.id);
      return {
        route,
        wardName: route.area_id ? wardMap.get(route.area_id) || route.area_id : undefined,
        assignment,
        vehicleRegistration: assignment?.vehicle_id ? vehicleMap.get(assignment.vehicle_id) || assignment.vehicle_id : undefined,
        driverName: assignment?.driver_id ? workerMap.get(assignment.driver_id) || assignment.driver_id : undefined,
        supervisorName: assignment?.supervisor_id ? workerMap.get(assignment.supervisor_id) || assignment.supervisor_id : undefined
      };
    });
  }, [routes, assignmentByRoute, wardMap, vehicleMap, workerMap]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return combinedRows.filter((row) => {
      const matchesWard = selectedWardId === 'ALL' || row.route.area_id === selectedWardId;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q ||
        row.route.code.toLowerCase().includes(q) ||
        row.route.name.toLowerCase().includes(q) ||
        (row.route.description && row.route.description.toLowerCase().includes(q));
      return matchesWard && matchesSearch;
    });
  }, [combinedRows, selectedWardId, searchQuery]);

  const columns: Column<RouteAssignmentRow>[] = [
    {
      key: 'code',
      header: t('portals.authority.routes.routeCode'),
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MapPin size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} aria-hidden="true" />
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {row.route.code}
          </span>
        </div>
      )
    },
    {
      key: 'name',
      header: t('portals.authority.routes.routeName'),
      render: (row) => (
        <div>
          <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{row.route.name}</div>
          {row.route.description && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{row.route.description}</div>
          )}
        </div>
      )
    },
    {
      key: 'ward',
      header: t('portals.authority.routes.ward'),
      render: (row) => (
        <span>{row.wardName || '—'}</span>
      )
    },
    {
      key: 'assigned_vehicle',
      header: t('portals.authority.routes.assignedVehicle'),
      render: (row) => {
        if (!row.vehicleRegistration) {
          return <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>{t('portals.authority.routes.noAssignment')}</span>;
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontFamily: 'var(--font-mono)' }}>
            <Truck size={14} style={{ color: 'var(--color-text-muted)' }} aria-hidden="true" />
            <span>{row.vehicleRegistration}</span>
          </div>
        );
      }
    },
    {
      key: 'assigned_driver',
      header: t('portals.authority.routes.assignedDriver'),
      render: (row) => {
        if (!row.driverName) {
          return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <User size={14} style={{ color: 'var(--color-text-muted)' }} aria-hidden="true" />
            <span>{row.driverName}</span>
          </div>
        );
      }
    },
    {
      key: 'scheduled_start',
      header: t('portals.authority.routes.scheduledStart'),
      render: (row) => {
        if (!row.assignment?.scheduled_start) {
          return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
        }
        return (
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {formatTime(row.assignment.scheduled_start, locale)}
          </span>
        );
      }
    },
    {
      key: 'assignment_status',
      header: t('portals.authority.routes.assignmentStatus'),
      render: (row) => {
        if (!row.assignment) {
          return (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              {t('portals.authority.routes.noAssignment')}
            </span>
          );
        }
        return <StatusBadge status={row.assignment.status} category="run" />;
      }
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: () => (
        <Link
          to="/authority/operations"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.75rem',
            color: 'var(--color-primary)',
            textDecoration: 'none',
            fontWeight: 500
          }}
        >
          <span>{t('portals.authority.routes.viewOnMap')}</span>
          <ExternalLink size={12} aria-hidden="true" />
        </Link>
      )
    }
  ];

  if (loading) {
    return <LoadingSpinner text={t('common.loading')} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {t('portals.authority.routes.title')}
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {t('portals.authority.routes.subtitle')}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchRoutesData(true)}
          disabled={refreshing}
          style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
        >
          <RotateCcw size={14} className={refreshing ? 'spinning' : ''} aria-hidden="true" />
          <span>{refreshing ? t('common.loading') : t('common.retry')}</span>
        </Button>
      </div>

      {error && <Alert type="error" message={error} />}

      {/* Provenance and Integrity Disclosure */}
      <Alert
        type="info"
        title={t('shell.demoBanner')}
        message={t('portals.authority.routes.provenanceNotice')}
      />

      {/* Filters and Date Selection Panel */}
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
            {/* Service Date Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Calendar size={15} style={{ color: 'var(--color-text-muted)' }} aria-hidden="true" />
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                style={{
                  padding: '0.375rem 0.625rem',
                  fontSize: '0.8125rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-primary)'
                }}
                aria-label={t('portals.authority.routes.serviceDateLabel')}
              />
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
                placeholder={t('portals.authority.routes.searchPlaceholder')}
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
                aria-label={t('portals.authority.routes.searchPlaceholder')}
              />
            </div>

            {/* Ward Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Filter size={15} style={{ color: 'var(--color-text-muted)' }} aria-hidden="true" />
              <select
                value={selectedWardId}
                onChange={(e) => setSelectedWardId(e.target.value)}
                style={{
                  padding: '0.4375rem 0.75rem',
                  fontSize: '0.8125rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-primary)'
                }}
                aria-label={t('portals.authority.routes.filterWard')}
              >
                <option value="ALL">{t('portals.authority.routes.allWards')}</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {t('portals.authority.routes.recordsCount').replace('{count}', String(filteredRows.length))}
          </span>
        </div>
      </Panel>

      {/* Routes Table */}
      <Panel>
        <DataTable
          columns={columns}
          data={filteredRows}
          keyExtractor={(row) => row.route.id}
          caption={t('portals.authority.routes.title')}
          emptyMessage={t('common.empty')}
        />
      </Panel>

      {/* Temporal Roster Invariant Notice */}
      <Panel>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', color: 'var(--color-text-secondary)' }}>
          <Info size={18} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
          <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.5 }}>
            {t('portals.authority.routes.rosterIntegrityNotice')}
          </p>
        </div>
      </Panel>
    </div>
  );
};
