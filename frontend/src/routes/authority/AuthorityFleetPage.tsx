import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { apiClient } from '../../api/client';
import { Panel } from '../../components/ui/Panel';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { MetricCard } from '../../components/authority/MetricCard';
import { formatNumber } from '../../i18n/formatters';
import type { MasterVehicle, MetricResult } from '../../types/operations';
import {
  Truck,
  RotateCcw,
  Search,
  Filter,
  Info,
  ShieldCheck,
  Wrench,
  AlertCircle
} from 'lucide-react';

export const AuthorityFleetPage: React.FC = () => {
  const { t, locale } = useTranslation();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [vehicles, setVehicles] = useState<MasterVehicle[]>([]);
  const [foaMetric, setFoaMetric] = useState<MetricResult | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchFleetData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const today = new Date().toISOString().split('T')[0]!;
      const [vehRes, foaRes] = await Promise.all([
        apiClient.get<{ vehicles: MasterVehicle[] }>('/api/v1/master/vehicles'),
        apiClient.get<MetricResult>(`/api/v1/metrics/fleet-availability?service_date=${today}`)
      ]);

      setVehicles(vehRes.vehicles || []);
      setFoaMetric(foaRes || null);
    } catch (err: any) {
      setError(err.message || t('errors.networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFleetData();
  }, []);

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const matchesStatus = statusFilter === 'ALL' || v.operational_status === statusFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q ||
        v.registration_number.toLowerCase().includes(q) ||
        v.vehicle_type.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [vehicles, statusFilter, searchQuery]);

  const columns: Column<MasterVehicle>[] = [
    {
      key: 'registration_number',
      header: t('portals.authority.fleet.regNumber'),
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Truck size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} aria-hidden="true" />
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {row.registration_number}
          </span>
        </div>
      )
    },
    {
      key: 'vehicle_type',
      header: t('portals.authority.fleet.vehicleType'),
      render: (row) => (
        <span style={{ textTransform: 'capitalize' }}>
          {row.vehicle_type.replace(/_/g, ' ').toLowerCase()}
        </span>
      )
    },
    {
      key: 'capacity',
      header: t('portals.authority.fleet.capacityTons'),
      isNumeric: true,
      render: (row) => {
        const cap = row.capacity_metric_tons ?? row.capacity_tons ?? 0;
        return (
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {formatNumber(cap, locale)} T
          </span>
        );
      }
    },
    {
      key: 'operational_status',
      header: t('portals.authority.fleet.operationalStatus'),
      render: (row) => (
        <StatusBadge status={row.operational_status} category="vehicle" />
      )
    },
    {
      key: 'provenance',
      header: t('portals.authority.fleet.dataSource'),
      render: (_row) => (
        <span
          style={{
            fontSize: '0.6875rem',
            padding: '2px 6px',
            borderRadius: '2px',
            backgroundColor: 'var(--color-surface-subtle)',
            color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-mono)',
            border: '1px solid var(--color-border-subtle)'
          }}
        >
          SIMULATED_DEMO_DATA
        </span>
      )
    }
  ];

  if (loading) {
    return <LoadingSpinner text={t('common.loading')} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header and Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {t('portals.authority.fleet.title')}
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {t('portals.authority.fleet.subtitle')}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchFleetData(true)}
          disabled={refreshing}
          style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
        >
          <RotateCcw size={14} className={refreshing ? 'spinning' : ''} aria-hidden="true" />
          <span>{refreshing ? t('common.loading') : t('common.retry')}</span>
        </Button>
      </div>

      {error && <Alert type="error" message={error} />}

      {/* Provenance Disclosure Banner */}
      <Alert
        type="info"
        title={t('shell.demoBanner')}
        message={t('portals.authority.fleet.provenanceNotice')}
      />

      {/* FOA Metric Card (Consumes backend calculation directly) */}
      <div style={{ maxWidth: '420px' }}>
        <MetricCard
          title={t('portals.authority.fleet.foaCardTitle')}
          metric={foaMetric}
          description={t('portals.authority.fleet.foaCardSubtitle')}
          caveat={t('portals.authority.fleet.foaCardCaveat')}
          unit="vehicles"
        />
      </div>

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
            <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
              <Search
                size={16}
                style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder={t('portals.authority.fleet.searchPlaceholder')}
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
                aria-label={t('portals.authority.fleet.searchPlaceholder')}
              />
            </div>

            {/* Operational Status Selector */}
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
                aria-label={t('portals.authority.fleet.filterStatus')}
              >
                <option value="ALL">{t('portals.authority.fleet.allStatuses')}</option>
                <option value="ACTIVE">{t('status.vehicle.ACTIVE')}</option>
                <option value="MAINTENANCE">{t('status.vehicle.MAINTENANCE')}</option>
                <option value="DECOMMISSIONED">{t('status.vehicle.DECOMMISSIONED')}</option>
              </select>
            </div>
          </div>

          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {t('portals.authority.fleet.recordsCount').replace('{count}', String(filteredVehicles.length))}
          </span>
        </div>
      </Panel>

      {/* Vehicles Table */}
      <Panel>
        <DataTable
          columns={columns}
          data={filteredVehicles}
          keyExtractor={(v) => v.id}
          caption={t('portals.authority.fleet.title')}
          emptyMessage={t('common.empty')}
        />
      </Panel>

      {/* Honest Maintenance / Operational History State */}
      <Panel
        title={t('portals.authority.fleet.maintenanceHistoryTitle')}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', color: 'var(--color-text-secondary)' }}>
          <Info size={18} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
          <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.5 }}>
            {t('portals.authority.fleet.maintenanceHistoryNotice')}
          </p>
        </div>
      </Panel>
    </div>
  );
};
