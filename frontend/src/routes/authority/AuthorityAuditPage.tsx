import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { apiClient } from '../../api/client';
import { Panel } from '../../components/ui/Panel';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { formatDate, formatTime } from '../../i18n/formatters';
import type { AuditEventRow } from '../../types/operations';
import {
  FileCheck2,
  RotateCcw,
  Search,
  Filter,
  Eye,
  X,
  Database,
  Download
} from 'lucide-react';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';

export const AuthorityAuditPage: React.FC = () => {
  const { t, locale } = useTranslation();
  const { role, session } = useAuth();

  const isAuthorityOrAdmin =
    role === 'AUTHORITY' ||
    role === 'ADMIN' ||
    session?.role === 'AUTHORITY' ||
    session?.role === 'ADMIN';

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [events, setEvents] = useState<AuditEventRow[]>([]);

  // Filter and search states
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Export states
  const [exportDataset, setExportDataset] = useState<'audit-events' | 'operational-verification' | 'anomalies' | 'payments-reconciliation' | 'configuration-summary'>('audit-events');
  const [exportFormat, setExportFormat] = useState<'ndjson' | 'csv'>('ndjson');
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);
  const [exportErrorMsg, setExportErrorMsg] = useState<string | null>(null);

  // Selected event for state diff inspection drawer / modal
  const [selectedEvent, setSelectedEvent] = useState<AuditEventRow | null>(null);

  const diffModalRef = useModalFocusTrap({
    isOpen: !!selectedEvent,
    onClose: () => setSelectedEvent(null)
  });

  const fetchAuditEvents = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await apiClient.get<{ events: AuditEventRow[]; data_classification: string }>(
        '/api/v1/audit/events?limit=100'
      );
      setEvents(res.events || []);
    } catch (err: any) {
      setError(err.message || t('errors.networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportSuccessMsg(null);
    setExportErrorMsg(null);
    try {
      const token = apiClient.getToken();
      const res = await fetch(`/api/v1/audit/export/${exportDataset}?format=${exportFormat}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Export failed with status ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportDataset}_export.${exportFormat === 'ndjson' ? 'ndjson' : 'csv'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setExportSuccessMsg(t('portals.authority.audit.exportSuccess'));
    } catch (err: any) {
      setExportErrorMsg(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    fetchAuditEvents();
  }, []);

  useEffect(() => {
    if (!selectedEvent) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedEvent(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEvent]);

  // Distinct entity names for filter dropdown
  const entityOptions = useMemo(() => {
    const set = new Set<string>();
    events.forEach(e => {
      if (e.entity_name) set.add(e.entity_name);
    });
    return Array.from(set).sort();
  }, [events]);

  // Distinct roles for filter dropdown
  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    events.forEach(e => {
      if (e.actor_role) set.add(e.actor_role);
    });
    return Array.from(set).sort();
  }, [events]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const matchesEntity = entityFilter === 'ALL' || e.entity_name === entityFilter;
      const matchesRole = roleFilter === 'ALL' || e.actor_role === roleFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        e.id.toLowerCase().includes(q) ||
        e.actor_id.toLowerCase().includes(q) ||
        e.actor_role.toLowerCase().includes(q) ||
        e.action_type.toLowerCase().includes(q) ||
        e.entity_name.toLowerCase().includes(q) ||
        e.entity_id.toLowerCase().includes(q);

      return matchesEntity && matchesRole && matchesSearch;
    });
  }, [events, entityFilter, roleFilter, searchQuery]);

  // Safe JSON pretty printer
  const formatJson = (raw: string | null): string => {
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  };

  const columns: Column<AuditEventRow>[] = [
    {
      key: 'created_at',
      title: t('portals.authority.audit.timestamp'),
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono, monospace)' }}>
          {formatDate(row.created_at, locale)} {formatTime(row.created_at, locale)}
        </span>
      )
    },
    {
      key: 'id',
      title: t('portals.authority.audit.eventId'),
      render: (row) => (
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.75rem',
            color: 'var(--color-text-secondary)'
          }}
          title={row.id}
        >
          {row.id.substring(0, 8)}...
        </span>
      )
    },
    {
      key: 'actor',
      title: t('portals.authority.audit.actor'),
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{row.actor_id}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            {row.actor_role}
          </span>
        </div>
      )
    },
    {
      key: 'action_type',
      title: t('portals.authority.audit.actionType'),
      render: (row) => (
        <span
          style={{
            display: 'inline-block',
            padding: '0.2rem 0.5rem',
            borderRadius: '4px',
            backgroundColor: 'var(--color-bg-secondary)',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: 600
          }}
        >
          {row.action_type}
        </span>
      )
    },
    {
      key: 'entity',
      title: t('portals.authority.audit.entity'),
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{row.entity_name}</span>
          <span
            style={{
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--color-text-secondary)'
            }}
          >
            {row.entity_id}
          </span>
        </div>
      )
    },
    {
      key: 'ip_address',
      title: t('portals.authority.audit.ipAddress'),
      render: (row) => (
        <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono, monospace)' }}>
          {row.ip_address}
        </span>
      )
    },
    {
      key: 'actions',
      title: t('common.actions'),
      align: 'right',
      render: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectedEvent(row)}
          ariaLabel={`${t('portals.authority.audit.inspectDiff')}: ${row.id}`}
        >
          <Eye size={14} style={{ marginRight: '0.25rem' }} />
          {t('portals.authority.audit.inspectDiff')}
        </Button>
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header & Title */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <FileCheck2 size={24} style={{ color: 'var(--color-primary)' }} />
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
              {t('portals.authority.audit.title')}
            </h1>
          </div>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            {t('portals.authority.audit.subtitle')}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAuditEvents(true)}
            disabled={refreshing || loading}
          >
            <RotateCcw
              size={14}
              style={{
                marginRight: '0.25rem',
                animation: refreshing ? 'spin 1s linear infinite' : 'none'
              }}
            />
            {refreshing ? t('common.loading') : t('common.refresh')}
          </Button>
        </div>
      </div>

      {/* Relational Append-Only Disclaimer Banner */}
      <div
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.875rem'
        }}
      >
        <Database
          size={20}
          style={{ color: 'var(--color-primary)', marginTop: '0.125rem', flexShrink: 0 }}
        />
        <div style={{ fontSize: '0.8125rem', lineHeight: '1.45' }}>
          <strong style={{ display: 'block', marginBottom: '0.25rem' }}>
            Append-Only Relational Audit Trail Architecture
          </strong>
          <span style={{ color: 'var(--color-text-secondary)' }}>
            {t('portals.authority.audit.appendOnlyNotice')}
          </span>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <Alert variant="error">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => fetchAuditEvents(true)}>
              {t('common.retry')}
            </Button>
          </div>
        </Alert>
      )}

      {/* RBAC Notice if user is non-AUTHORITY/ADMIN */}
      {!isAuthorityOrAdmin && (
        <Alert variant="warning">
          <span>
            Access notice: Detailed audit inspection is restricted to AUTHORITY and ADMIN roles by backend access control policies.
          </span>
        </Alert>
      )}

      {/* Administrative Compliance & Audit Export Panel */}
      {isAuthorityOrAdmin && (
        <Panel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Download size={18} style={{ color: 'var(--color-primary)' }} />
                  {t('portals.authority.audit.exportTitle')}
                </h2>
                <p style={{ margin: '0.25rem 0 0 0', color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>
                  {t('portals.authority.audit.exportSubtitle')}
                </p>
              </div>
            </div>

            <div
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                padding: '0.75rem 1rem',
                fontSize: '0.8125rem',
                color: 'var(--color-text-secondary)',
                lineHeight: '1.4'
              }}
            >
              {t('portals.authority.audit.exportNotice')}
            </div>

            {exportSuccessMsg && (
              <Alert variant="success">
                <span>{exportSuccessMsg}</span>
              </Alert>
            )}

            {exportErrorMsg && (
              <Alert variant="error">
                <span>{exportErrorMsg}</span>
              </Alert>
            )}

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1rem',
                alignItems: 'flex-end'
              }}
            >
              {/* Dataset Selection */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '240px' }}>
                <label
                  htmlFor="audit-export-dataset"
                  style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}
                >
                  {t('portals.authority.audit.exportDataset')}:
                </label>
                <select
                  id="audit-export-dataset"
                  value={exportDataset}
                  onChange={(e) => setExportDataset(e.target.value as any)}
                  style={{
                    padding: '0.45rem 0.65rem',
                    fontSize: '0.8125rem',
                    borderRadius: '4px',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-primary)',
                    color: 'var(--color-text-primary)'
                  }}
                >
                  <option value="audit-events">{t('portals.authority.audit.datasetAudit')}</option>
                  <option value="operational-verification">{t('portals.authority.audit.datasetVerification')}</option>
                  <option value="anomalies">{t('portals.authority.audit.datasetAnomalies')}</option>
                  <option value="payments-reconciliation">{t('portals.authority.audit.datasetPayments')}</option>
                  <option value="configuration-summary">{t('portals.authority.audit.datasetConfig')}</option>
                </select>
              </div>

              {/* Format Selection */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '180px' }}>
                <label
                  htmlFor="audit-export-format"
                  style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}
                >
                  {t('portals.authority.audit.exportFormat')}:
                </label>
                <select
                  id="audit-export-format"
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as any)}
                  style={{
                    padding: '0.45rem 0.65rem',
                    fontSize: '0.8125rem',
                    borderRadius: '4px',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-primary)',
                    color: 'var(--color-text-primary)'
                  }}
                >
                  <option value="ndjson">NDJSON (.ndjson)</option>
                  <option value="csv">RFC 4180 CSV (.csv)</option>
                </select>
              </div>

              {/* Download Action */}
              <Button
                variant="primary"
                size="md"
                onClick={handleExport}
                disabled={exporting}
                ariaLabel={t('portals.authority.audit.exportAction')}
              >
                <Download size={16} style={{ marginRight: '0.35rem' }} />
                {exporting ? t('common.loading') : t('portals.authority.audit.exportAction')}
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {/* Filter and Search Controls */}
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            {/* Entity Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Filter size={14} style={{ color: 'var(--color-text-secondary)' }} />
              <label
                htmlFor="audit-entity-filter"
                style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}
              >
                {t('portals.authority.audit.filterEntity')}:
              </label>
              <select
                id="audit-entity-filter"
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
                style={{
                  padding: '0.35rem 0.6rem',
                  fontSize: '0.8125rem',
                  borderRadius: '4px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-bg-primary)',
                  color: 'var(--color-text-primary)'
                }}
              >
                <option value="ALL">{t('portals.authority.audit.allEntities')}</option>
                {entityOptions.map((ent) => (
                  <option key={ent} value={ent}>
                    {ent}
                  </option>
                ))}
              </select>
            </div>

            {/* Role Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <label
                htmlFor="audit-role-filter"
                style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}
              >
                {t('portals.authority.audit.filterActorRole')}:
              </label>
              <select
                id="audit-role-filter"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{
                  padding: '0.35rem 0.6rem',
                  fontSize: '0.8125rem',
                  borderRadius: '4px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-bg-primary)',
                  color: 'var(--color-text-primary)'
                }}
              >
                <option value="ALL">{t('portals.authority.audit.allRoles')}</option>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Search Box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', minWidth: '260px' }}>
            <Search size={14} style={{ color: 'var(--color-text-secondary)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('portals.authority.audit.searchPlaceholder')}
              aria-label={t('portals.authority.audit.searchPlaceholder')}
              style={{
                flex: 1,
                padding: '0.35rem 0.6rem',
                fontSize: '0.8125rem',
                borderRadius: '4px',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-primary)',
                color: 'var(--color-text-primary)'
              }}
            />
            {searchQuery && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery('')}
                ariaLabel={t('common.clear')}
              >
                <X size={12} />
              </Button>
            )}
          </div>
        </div>
      </Panel>

      {/* Main Journal Data Table */}
      <Panel
        title={t('portals.authority.audit.recordsCount', { count: filteredEvents.length })}
      >
        {loading && !refreshing ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
            <LoadingSpinner size="lg" />
          </div>
        ) : filteredEvents.length === 0 ? (
          <div
            style={{
              padding: '2.5rem 1rem',
              textAlign: 'center',
              color: 'var(--color-text-secondary)',
              fontSize: '0.875rem'
            }}
          >
            No audit records match the selected filters.
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredEvents}
            keyExtractor={(row) => row.id}
          />
        )}
      </Panel>

      {/* Before/After State Inspection Modal Drawer */}
      {selectedEvent && (
        <div
          ref={diffModalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-diff-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedEvent(null);
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              width: '100%',
              maxWidth: '850px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1rem 1.25rem',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <h3 id="audit-diff-title" style={{ margin: 0, fontSize: '1.125rem' }}>
                  {t('portals.authority.audit.drawerTitle', { id: selectedEvent.id.substring(0, 12) + '...' })}
                </h3>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-secondary)',
                    marginTop: '0.25rem',
                    display: 'flex',
                    gap: '0.75rem',
                    flexWrap: 'wrap'
                  }}
                >
                  <span>
                    <strong>Action:</strong> {selectedEvent.action_type}
                  </span>
                  <span>
                    <strong>Entity:</strong> {selectedEvent.entity_name} ({selectedEvent.entity_id})
                  </span>
                  <span>
                    <strong>Actor:</strong> {selectedEvent.actor_id} [{selectedEvent.actor_role}]
                  </span>
                  <span>
                    <strong>IP:</strong> {selectedEvent.ip_address}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedEvent(null)}
                ariaLabel={t('common.close')}
              >
                <X size={16} />
              </Button>
            </div>

            {/* Modal Content - Side-by-side State Inspection */}
            <div
              style={{
                padding: '1.25rem',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: '1rem'
                }}
              >
                {/* Before State */}
                <div
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      padding: '0.5rem 0.75rem',
                      backgroundColor: 'var(--color-bg-secondary)',
                      borderBottom: '1px solid var(--color-border)',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)'
                    }}
                  >
                    {t('portals.authority.audit.beforeState')}
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      padding: '0.75rem',
                      backgroundColor: 'var(--color-bg-tertiary, #0d1117)',
                      color: 'var(--color-text-code, #e6edf3)',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-mono, monospace)',
                      maxHeight: '300px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all'
                    }}
                  >
                    {selectedEvent.before_state
                      ? formatJson(selectedEvent.before_state)
                      : t('portals.authority.audit.noState')}
                  </pre>
                </div>

                {/* After State */}
                <div
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      padding: '0.5rem 0.75rem',
                      backgroundColor: 'var(--color-bg-secondary)',
                      borderBottom: '1px solid var(--color-border)',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)'
                    }}
                  >
                    {t('portals.authority.audit.afterState')}
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      padding: '0.75rem',
                      backgroundColor: 'var(--color-bg-tertiary, #0d1117)',
                      color: 'var(--color-text-code, #e6edf3)',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-mono, monospace)',
                      maxHeight: '300px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all'
                    }}
                  >
                    {selectedEvent.after_state
                      ? formatJson(selectedEvent.after_state)
                      : t('portals.authority.audit.noState')}
                  </pre>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '0.75rem 1.25rem',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'flex-end',
                backgroundColor: 'var(--color-bg-secondary)'
              }}
            >
              <Button variant="outline" size="sm" onClick={() => setSelectedEvent(null)}>
                {t('common.close')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
