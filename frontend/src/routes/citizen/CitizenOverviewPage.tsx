import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { apiClient, ApiClientError } from '../../api/client';
import type { CitizenHousehold, CitizenRoute, ServiceSynthesis, PaymentObligation, CitizenComplaint } from '../../types/citizen';
import { Panel } from '../../components/ui/Panel';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import {
  MapPin,
  CalendarCheck,
  CreditCard,
  MessageSquareWarning,
  ArrowRight,
  Database,
  Building,
  UserCheck
} from 'lucide-react';

export const CitizenOverviewPage: React.FC = () => {
  const { t, formatCurrency } = useTranslation();
  const { session } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [household, setHousehold] = useState<CitizenHousehold | null>(null);
  const [route, setRoute] = useState<CitizenRoute | null>(null);
  const [synthesis, setSynthesis] = useState<ServiceSynthesis | null>(null);
  const [obligations, setObligations] = useState<PaymentObligation[]>([]);
  const [complaints, setComplaints] = useState<CitizenComplaint[]>([]);

  const householdId = session?.householdId;

  const loadData = useCallback(async () => {
    if (!householdId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Fetch household record (Anti-IDOR protected)
      const houseRes = await apiClient.get<{ household: CitizenHousehold; data_classification: string }>(
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
        // Route info optional
      }

      // 3. Fetch today's service status dynamically via the citizen endpoint
      try {
        const statusRes = await apiClient.get<{
          synthesis: ServiceSynthesis;
          route?: { id: string; name: string };
          assignment?: any;
          run?: any;
        }>('/operations/citizen/service-status');

        if (statusRes?.synthesis) {
          setSynthesis(statusRes.synthesis);
        }
      } catch {
        // Status fetch non-fatal
      }

      // 4. Fetch obligations
      try {
        const obRes = await apiClient.get<{ obligations: PaymentObligation[] }>(
          `/finance/obligations/${householdId}`
        );
        setObligations(obRes.obligations || []);
      } catch {
        // Non-fatal
      }

      // 5. Fetch complaints (Backend automatically filters by household for CITIZEN role)
      try {
        const compRes = await apiClient.get<{ complaints: CitizenComplaint[] }>('/complaints');
        setComplaints(compRes.complaints || []);
      } catch {
        // Non-fatal
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
  }, [householdId, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!householdId) {
    return (
      <Panel title={t('portals.citizen.householdDetails')}>
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

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Alert type="danger" message={error} />
        <Button variant="outline" onClick={loadData}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  const totalDuesPaise = obligations.reduce((sum, o) => sum + (o.is_active ? o.amount_paise : 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Overview Top Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Card 1: Today's Service */}
        <div
          style={{
            padding: '1.25rem',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                {t('portals.citizen.todayStatus')}
              </span>
              <CalendarCheck size={18} color="var(--color-primary)" aria-hidden="true" />
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <StatusBadge
                category="verification"
                status={synthesis?.status || 'EXPECTED'}
              />
            </div>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              {synthesis?.disclosureStatement || t('portals.citizen.serviceSubtitle')}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate('/citizen/service')}
            style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem', alignSelf: 'flex-start' }}
          >
            <span>{t('portals.citizen.viewService')}</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Button>
        </div>

        {/* Card 2: Outstanding Dues */}
        <div
          style={{
            padding: '1.25rem',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                {t('portals.citizen.pendingDues')}
              </span>
              <CreditCard size={18} color="var(--color-primary)" aria-hidden="true" />
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              <span
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: totalDuesPaise > 0 ? 'var(--color-text-primary)' : 'var(--color-success)',
                }}
              >
                {formatCurrency(totalDuesPaise)}
              </span>
            </div>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              {obligations.length} {t('portals.citizen.obligationsTitle')}
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => navigate('/citizen/payments')}
            style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem', alignSelf: 'flex-start' }}
          >
            <span>{t('portals.citizen.payDues')}</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Button>
        </div>

        {/* Card 3: Complaints / Grievances */}
        <div
          style={{
            padding: '1.25rem',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                {t('portals.citizen.registeredComplaints')}
              </span>
              <MessageSquareWarning size={18} color="var(--color-warning)" aria-hidden="true" />
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              <span
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--color-text-primary)',
                }}
              >
                {complaints.length}
              </span>
            </div>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              {t('portals.citizen.complaintsSubtitle')}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate('/citizen/complaints')}
            style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem', alignSelf: 'flex-start' }}
          >
            <span>{t('portals.citizen.reportGrievance')}</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Household & Service Identity Panel */}
      {household && (
        <Panel title={t('portals.citizen.householdDetails')}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1.25rem',
            }}
          >
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                {t('portals.citizen.serviceUid')}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <Building size={16} color="var(--color-primary)" aria-hidden="true" />
                <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>
                  {household.service_uid}
                </span>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                {t('portals.citizen.residentName')}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <UserCheck size={16} color="var(--color-primary)" aria-hidden="true" />
                <span style={{ fontWeight: 500, fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>
                  {household.resident_name}
                </span>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                {t('portals.citizen.maskedPhone')}
              </span>
              <div style={{ marginTop: '0.25rem', fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>
                {household.phone_masked}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                {t('portals.citizen.assignedRoute')}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <MapPin size={16} color="var(--color-primary)" aria-hidden="true" />
                <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>
                  {route ? `${route.code} — ${route.name}` : household.route_id}
                </span>
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                {t('portals.citizen.address')}
              </span>
              <div style={{ marginTop: '0.25rem', fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>
                {household.address_line}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* Epistemic Transparency / Provenance Statement */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem 1rem',
          backgroundColor: 'var(--color-surface-subtle)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.75rem',
          color: 'var(--color-text-muted)',
        }}
      >
        <Database size={14} aria-hidden="true" />
        <span>
          <strong>{t('portals.citizen.epistemicNotice')}: </strong>
          {t('portals.citizen.proximityNotice')}
        </span>
      </div>
    </div>
  );
};
