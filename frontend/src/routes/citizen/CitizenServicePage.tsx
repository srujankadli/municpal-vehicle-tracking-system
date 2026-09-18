import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { apiClient, ApiClientError } from '../../api/client';
import type { CitizenHousehold, CitizenRoute, ServiceSynthesis } from '../../types/citizen';
import { Panel } from '../../components/ui/Panel';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  Calendar,
  CheckCircle2,
  AlertTriangle,
  FileSearch,
  Eye,
  ScanLine,
  Info,
  ShieldCheck,
  MessageSquareWarning
} from 'lucide-react';

export const CitizenServicePage: React.FC = () => {
  const { t, formatDate } = useTranslation();
  const { session } = useAuth();
  const navigate = useNavigate();

  const [serviceDate, setServiceDate] = useState('2026-09-14');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [household, setHousehold] = useState<CitizenHousehold | null>(null);
  const [route, setRoute] = useState<CitizenRoute | null>(null);
  const [synthesis, setSynthesis] = useState<ServiceSynthesis | null>(null);

  const householdId = session?.householdId;

  const loadServiceStatus = useCallback(async () => {
    if (!householdId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Fetch household info
      const houseRes = await apiClient.get<{ household: CitizenHousehold }>(
        `/master/households/${householdId}`
      );
      setHousehold(houseRes.household);

      // 2. Fetch routes to match assigned route
      try {
        const routesRes = await apiClient.get<{ routes: CitizenRoute[] }>('/master/routes');
        const matchedRoute = routesRes.routes.find(r => r.id === houseRes.household.route_id);
        if (matchedRoute) {
          setRoute(matchedRoute);
        }
      } catch {
        // Non-fatal
      }

      // 3. Query verification status for this household on the service date
      try {
        // Query status from operations endpoint
        const statusRes = await apiClient.get<{ synthesis: ServiceSynthesis }>(
          `/operations/runs/run-demo-01/households/${householdId}/status`
        );
        setSynthesis(statusRes.synthesis);
      } catch (err: any) {
        // If run not active or not found
        setSynthesis({
          householdId,
          status: 'EXPECTED',
          evidenceCount: 0,
          hasPhysicalScan: false,
          hasProximityObservation: false,
          hasResidentComplaint: false,
          hasApprovedException: false,
          disclosureStatement: t('portals.citizen.noScheduleNotice')
        });
      }
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError(t('errors.networkError'));
      }
    } finally {
      setLoading(false);
    }
  }, [householdId, serviceDate, t]);

  useEffect(() => {
    loadServiceStatus();
  }, [loadServiceStatus]);

  if (!householdId) {
    return (
      <Panel title={t('portals.citizen.serviceTitle')}>
        <EmptyState
          title={t('portals.citizen.unassignedHousehold')}
          description={t('portals.citizen.placeholderText')}
        />
      </Panel>
    );
  }

  if (loading) {
    return <LoadingSpinner text={t('common.loading')} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header and Date Control */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          padding: '1rem 1.25rem',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {t('portals.citizen.serviceTitle')}
          </h3>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            {t('portals.citizen.serviceSubtitle')}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label htmlFor="service-date-select" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            <Calendar size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
            {t('portals.citizen.serviceDate')}:
          </label>
          <input
            id="service-date-select"
            type="date"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
            style={{
              padding: '0.375rem 0.625rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-primary)',
              fontSize: '0.8125rem',
            }}
          />
        </div>
      </div>

      {error && <Alert type="danger" message={error} />}

      {/* Verification State Panel */}
      <Panel title={t('portals.citizen.verificationState')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Main Status Display */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '1rem 1.25rem',
              backgroundColor: 'var(--color-surface-subtle)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                {t('portals.citizen.serviceDate')}: {formatDate(serviceDate)}
              </span>
              <div style={{ marginTop: '0.375rem' }}>
                <StatusBadge
                  category="verification"
                  status={synthesis?.status || 'EXPECTED'}
                />
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => navigate('/citizen/complaints')}
              style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }}
            >
              <MessageSquareWarning size={14} aria-hidden="true" />
              <span>{t('portals.citizen.reportGrievance')}</span>
            </Button>
          </div>

          {/* Epistemological Disclosure & Audit Guarantee Alert */}
          {synthesis?.status === 'OBSERVED' && (
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid var(--color-info)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                gap: '0.75rem',
              }}
            >
              <Eye size={20} color="var(--color-info)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>
                  {t('portals.citizen.epistemicNotice')}:
                </strong>
                <p style={{ margin: 0, lineHeight: 1.5 }}>
                  {t('portals.citizen.proximityNotice')}
                </p>
                {synthesis.disclosureStatement && (
                  <p style={{ margin: '0.5rem 0 0', fontStyle: 'italic', color: 'var(--color-text-muted)' }}>
                    &ldquo;{synthesis.disclosureStatement}&rdquo;
                  </p>
                )}
              </div>
            </div>
          )}

          {synthesis?.status === 'VERIFIED' && (
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid var(--color-success)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                gap: '0.75rem',
              }}
            >
              <CheckCircle2 size={20} color="var(--color-success)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>
                  {t('status.verification.VERIFIED')}:
                </strong>
                <p style={{ margin: 0, lineHeight: 1.5 }}>
                  {t('portals.citizen.verifiedNotice')}
                </p>
              </div>
            </div>
          )}

          {synthesis?.status === 'DISPUTED' && (
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid var(--color-danger)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                gap: '0.75rem',
              }}
            >
              <AlertTriangle size={20} color="var(--color-danger)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>
                  {t('status.verification.DISPUTED')}:
                </strong>
                <p style={{ margin: 0, lineHeight: 1.5 }}>
                  {t('portals.citizen.disputedNotice')}
                </p>
              </div>
            </div>
          )}

          {/* Evidence Corroboration Table */}
          <div>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>
              {t('portals.citizen.evidenceDetails')}
            </h4>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '0.75rem',
              }}
            >
              <div
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                    {t('portals.citizen.doorstepScan')}
                  </span>
                  <ScanLine size={16} color="var(--color-text-muted)" aria-hidden="true" />
                </div>
                <div style={{ marginTop: '0.375rem', fontWeight: 600, fontSize: '0.875rem' }}>
                  {synthesis?.hasPhysicalScan ? (
                    <span style={{ color: 'var(--color-success)' }}>Recorded</span>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>None</span>
                  )}
                </div>
              </div>

              <div
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                    {t('portals.citizen.corridorProximity')}
                  </span>
                  <Eye size={16} color="var(--color-text-muted)" aria-hidden="true" />
                </div>
                <div style={{ marginTop: '0.375rem', fontWeight: 600, fontSize: '0.875rem' }}>
                  {synthesis?.hasProximityObservation ? (
                    <span style={{ color: 'var(--color-info)' }}>Detected in Corridor</span>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>None</span>
                  )}
                </div>
              </div>

              <div
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                    {t('portals.citizen.registeredComplaints')}
                  </span>
                  <MessageSquareWarning size={16} color="var(--color-text-muted)" aria-hidden="true" />
                </div>
                <div style={{ marginTop: '0.375rem', fontWeight: 600, fontSize: '0.875rem' }}>
                  {synthesis?.hasResidentComplaint ? (
                    <span style={{ color: 'var(--color-danger)' }}>Formal Grievance Filed</span>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>None Filed</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
};
