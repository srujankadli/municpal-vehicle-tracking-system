import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n/I18nContext';
import { useAuth, UserRole } from '../auth/AuthContext';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { apiClient } from '../api/client';
import { ShieldCheck, LogIn, AlertOctagon, UserCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('commissioner');
  const [password, setPassword] = useState('commissioner_Pass123!');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const resp = await apiClient.post<{
        status: string;
        token: string;
        user: {
          id: string;
          username: string;
          role: UserRole;
          fullName: string;
          workerId?: string | null;
          householdId?: string | null;
        };
      }>('/api/v1/auth/login', { username, password });

      login(resp.token, resp.user);

      // Route based on role
      if (['AUTHORITY', 'SUPERVISOR', 'WARD_OFFICER', 'ADMIN'].includes(resp.user.role)) {
        navigate('/authority');
      } else if (['WORKER', 'DRIVER'].includes(resp.user.role)) {
        navigate('/worker');
      } else if (resp.user.role === 'CITIZEN') {
        navigate('/citizen');
      } else {
        navigate('/authority');
      }
    } catch (err: any) {
      setError(err.message || t('errors.networkError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '440px', margin: '3rem auto 0' }}>
      <Panel title={t('common.login')}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && <Alert type="error" message={error} />}

          <div>
            <label
              htmlFor="username"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                marginBottom: '0.375rem',
              }}
            >
              {t('common.username')}
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                marginBottom: '0.375rem',
              }}
            >
              {t('common.password')}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}
          >
            <LogIn size={16} aria-hidden="true" />
            <span>{loading ? t('common.loading') : t('common.submit')}</span>
          </Button>

          <div
            style={{
              borderTop: '1px solid var(--color-border)',
              paddingTop: '0.75rem',
              fontSize: '0.75rem',
              color: 'var(--color-text-muted)',
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>Demo Seed Credentials:</p>
            <p style={{ margin: '0.25rem 0 0' }}>Authority: <code>commissioner</code> / <code>commissioner_Pass123!</code> (Admin: <code>admin</code> / <code>admin_Pass123!</code>)</p>
            <p style={{ margin: '0.25rem 0 0' }}>Field Worker: <code>worker_suresh</code> / <code>worker_suresh_Pass123!</code></p>
            <p style={{ margin: '0.25rem 0 0' }}>Citizen: <code>citizen_priya</code> / <code>citizen_priya_Pass123!</code></p>
          </div>
        </form>
      </Panel>
    </div>
  );
};

export const AuthorityShell: React.FC = () => {
  const { t } = useTranslation();
  const { session } = useAuth();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
            {t('portals.authority.title')}
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>
            {t('portals.authority.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <StatusBadge category="verification" status="VERIFIED" />
          <StatusBadge category="verification" status="OBSERVED" />
          <StatusBadge category="verification" status="EXCEPTION" />
        </div>
      </div>

      <Alert
        type="info"
        message={`Phase 2.1 Boundary: Authority Portal Foundation Active. Authenticated as ${session?.fullName} (${session?.role}). Detailed operational metrics, GPS map tracking, and audit controls will be connected in Phase 2.2.`}
      />

      <Panel title="Operational Domain Statuses (Zero-Fabrication Showcase)">
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: '0 0 1rem' }}>
          In accordance with the Phase 2.1 design system contract, no artificial KPI numbers or synthetic chart data are rendered.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <StatusBadge category="verification" status="EXPECTED" />
          <StatusBadge category="verification" status="OBSERVED" />
          <StatusBadge category="verification" status="EVIDENCE_AVAILABLE" />
          <StatusBadge category="verification" status="VERIFIED" />
          <StatusBadge category="verification" status="NOT_VERIFIED" />
          <StatusBadge category="verification" status="EXCEPTION" />
          <StatusBadge category="verification" status="DISPUTED" />
        </div>
      </Panel>

      <Panel title="Audit & Anomalies Boundary">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <StatusBadge category="payment" status="RECORDED" />
          <StatusBadge category="payment" status="SUBMITTED" />
          <StatusBadge category="payment" status="SUCCESSFUL" />
          <StatusBadge category="payment" status="FAILED" />
          <StatusBadge category="payment" status="DISPUTED" />
        </div>
      </Panel>
    </div>
  );
};

export const WorkerShell: React.FC = () => {
  const { t } = useTranslation();
  const { session } = useAuth();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
          {t('portals.worker.title')}
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>
          {t('portals.worker.subtitle')}
        </p>
      </div>

      <Alert
        type="info"
        message={`Phase 2.1 Boundary: Field Worker Portal Foundation Active. Authenticated as ${session?.fullName} (Worker ID: ${session?.workerId || 'Assigned'}). Route execution actions will be connected in Phase 2.2.`}
      />

      <Panel title="Field Work Order Status">
        <EmptyState
          title="No Active Emergency Route"
          description="Your scheduled collection shift foundation is ready. Full live duty check-in, household scanning, and offline queueing will activate in Phase 2.2."
        />
      </Panel>
    </div>
  );
};

export const CitizenShell: React.FC = () => {
  const { t } = useTranslation();
  const { session } = useAuth();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
          {t('portals.citizen.title')}
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>
          {t('portals.citizen.subtitle')}
        </p>
      </div>

      <Alert
        type="info"
        message={`Phase 2.1 Boundary: Citizen Portal Foundation Active. Authenticated as ${session?.fullName} (Household ID: ${session?.householdId || 'Assigned'}). Service schedule lookup, fee verification, and complaint submission will activate in Phase 2.2.`}
      />

      <Panel title="Municipal Waste Service Record">
        <EmptyState
          title="Service Record History"
          description="Your household municipal waste service history, payment verification records, and complaint workflows will be connected to the Phase 1 backend in Phase 2.2."
        />
      </Panel>
    </div>
  );
};

export const ForbiddenPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: '500px', margin: '3rem auto 0' }}>
      <Panel>
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <AlertOctagon size={48} style={{ color: 'var(--color-danger)', margin: '0 auto 1rem' }} aria-hidden="true" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            {t('errors.forbidden')}
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: '0.5rem 0 1.5rem' }}>
            Your account role does not have authorization to access this municipal portal zone.
          </p>
          <Button variant="primary" onClick={() => navigate('/login')}>
            Return to Login
          </Button>
        </div>
      </Panel>
    </div>
  );
};
