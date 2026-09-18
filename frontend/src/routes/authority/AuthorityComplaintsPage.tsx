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
import type { ComplaintRecord, MasterHousehold } from '../../types/operations';
import {
  MessageSquare,
  RotateCcw,
  Search,
  Filter,
  Info,
  Calendar,
  ShieldAlert,
  HelpCircle
} from 'lucide-react';

interface ComplaintWithHousehold extends ComplaintRecord {
  serviceUid?: string;
  residentName?: string;
}

export const AuthorityComplaintsPage: React.FC = () => {
  const { t, locale } = useTranslation();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [households, setHouseholds] = useState<MasterHousehold[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchComplaintsData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [compRes, hhRes] = await Promise.all([
        apiClient.get<{ complaints: ComplaintRecord[] }>('/api/v1/complaints'),
        apiClient.get<{ households: MasterHousehold[] }>('/api/v1/master/households')
      ]);

      setComplaints(compRes.complaints || []);
      setHouseholds(hhRes.households || []);
    } catch (err: any) {
      setError(err.message || t('errors.networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchComplaintsData();
  }, []);

  // Map households by ID for correlating service UID and registered resident
  const householdMap = useMemo(() => {
    const map = new Map<string, MasterHousehold>();
    for (const hh of households) {
      map.set(hh.id, hh);
    }
    return map;
  }, [households]);

  // Combined Rows
  const enrichedComplaints = useMemo<ComplaintWithHousehold[]>(() => {
    return complaints.map((c) => {
      const hh = householdMap.get(c.household_id);
      return {
        ...c,
        serviceUid: hh?.service_uid || c.household_id,
        residentName: hh?.resident_name || 'Resident'
      };
    });
  }, [complaints, householdMap]);

  // Filtered rows
  const filteredComplaints = useMemo(() => {
    return enrichedComplaints.filter((c) => {
      const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q ||
        c.id.toLowerCase().includes(q) ||
        (c.serviceUid && c.serviceUid.toLowerCase().includes(q)) ||
        (c.residentName && c.residentName.toLowerCase().includes(q)) ||
        c.resident_remarks.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [enrichedComplaints, statusFilter, searchQuery]);

  const columns: Column<ComplaintWithHousehold>[] = [
    {
      key: 'id',
      header: t('portals.authority.complaints.complaintId'),
      render: (c) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.8125rem' }}>
          {c.id.substring(0, 13)}...
        </span>
      )
    },
    {
      key: 'household',
      header: t('portals.authority.complaints.household'),
      render: (c) => (
        <div>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
            {c.serviceUid}
          </span>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {c.residentName}
          </div>
        </div>
      )
    },
    {
      key: 'service_date',
      header: t('portals.authority.complaints.serviceDate'),
      render: (c) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
          {c.service_date}
        </span>
      )
    },
    {
      key: 'complaint_type',
      header: t('portals.authority.complaints.complaintType'),
      render: (c) => (
        <span style={{ fontSize: '0.8125rem', textTransform: 'capitalize' }}>
          {c.complaint_type.replace(/_/g, ' ').toLowerCase()}
        </span>
      )
    },
    {
      key: 'resident_remarks',
      header: t('portals.authority.complaints.residentRemarks'),
      render: (c) => (
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)', maxWidth: '340px' }}>
          "{c.resident_remarks}"
        </div>
      )
    },
    {
      key: 'status',
      header: t('portals.authority.complaints.status'),
      render: (c) => (
        <StatusBadge category="anomaly" status={c.status} customLabel={c.status} />
      )
    },
    {
      key: 'filed_at',
      header: t('portals.authority.complaints.filedAt'),
      render: (c) => (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {formatDate(c.filed_at, locale)} {formatTime(c.filed_at, locale)}
        </span>
      )
    }
  ];

  if (loading && complaints.length === 0) {
    return <LoadingSpinner text={t('common.loading')} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header and Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {t('portals.authority.complaints.title')}
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {t('portals.authority.complaints.subtitle')}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchComplaintsData(true)}
          disabled={refreshing}
          style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
        >
          <RotateCcw size={14} className={refreshing ? 'spinning' : ''} aria-hidden="true" />
          <span>{refreshing ? t('common.loading') : t('common.retry')}</span>
        </Button>
      </div>

      {error && <Alert type="error" message={error} />}

      {/* Disclosures: Provenance & Epistemic Rule */}
      <Alert
        type="info"
        title={t('shell.demoBanner')}
        message={t('portals.authority.complaints.provenanceNotice')}
      />

      <Alert
        type="warning"
        title="Grievance Epistemic Boundary"
        message={t('portals.authority.complaints.epistemicNotice')}
      />

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
                placeholder={t('portals.authority.complaints.searchPlaceholder')}
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
                aria-label={t('portals.authority.complaints.searchPlaceholder')}
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
                aria-label={t('portals.authority.complaints.filterStatus')}
              >
                <option value="ALL">{t('portals.authority.complaints.allStatuses')}</option>
                <option value="SUBMITTED">SUBMITTED</option>
                <option value="INVESTIGATING">INVESTIGATING</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="DISMISSED">DISMISSED</option>
              </select>
            </div>
          </div>

          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {t('portals.authority.complaints.recordsCount').replace('{count}', String(filteredComplaints.length))}
          </span>
        </div>
      </Panel>

      {/* Complaints Table */}
      <Panel>
        <DataTable
          columns={columns}
          data={filteredComplaints}
          keyExtractor={(c) => c.id}
          caption={t('portals.authority.complaints.title')}
          emptyMessage={t('common.empty')}
        />
      </Panel>

      {/* Read-Only Invariant & Correlation Disclosures */}
      <Panel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: 'var(--color-text-secondary)' }}>
            <Info size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
            <span style={{ fontSize: '0.8125rem' }}>
              {t('portals.authority.complaints.readOnlyNotice')}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: 'var(--color-text-secondary)' }}>
            <ShieldAlert size={16} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
            <span style={{ fontSize: '0.8125rem' }}>
              {t('portals.authority.complaints.correlationNotice')}
            </span>
          </div>
        </div>
      </Panel>
    </div>
  );
};
