import React from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import {
  LayoutDashboard,
  Truck,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  CreditCard,
  FileCheck2
} from 'lucide-react';

export const AuthorityLayout: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();

  const navItems = [
    {
      to: '/authority/operations',
      label: 'Operations Center',
      icon: <LayoutDashboard size={16} aria-hidden="true" />,
      active: location.pathname.startsWith('/authority/operations') || location.pathname === '/authority'
    },
    {
      to: '/authority/fleet',
      label: 'Fleet Status',
      icon: <Truck size={16} aria-hidden="true" />,
      active: location.pathname.startsWith('/authority/fleet')
    },
    {
      to: '/authority/routes',
      label: 'Routes & Corridors',
      icon: <MapPin size={16} aria-hidden="true" />,
      active: location.pathname.startsWith('/authority/routes')
    },
    {
      to: '/authority/verification',
      label: 'Service Verification',
      icon: <CheckCircle2 size={16} aria-hidden="true" />,
      active: location.pathname.startsWith('/authority/verification')
    },
    {
      to: '/authority/anomalies',
      label: 'Anomalies & Exceptions',
      icon: <AlertTriangle size={16} aria-hidden="true" />,
      active: location.pathname.startsWith('/authority/anomalies')
    },
    {
      to: '/authority/complaints',
      label: 'Citizen Grievances',
      icon: <MessageSquare size={16} aria-hidden="true" />,
      active: location.pathname.startsWith('/authority/complaints')
    },
    {
      to: '/authority/reconciliation',
      label: 'Payments & Settlement',
      icon: <CreditCard size={16} aria-hidden="true" />,
      active: location.pathname.startsWith('/authority/reconciliation')
    },
    {
      to: '/authority/audit',
      label: 'Audit Trail',
      icon: <FileCheck2 size={16} aria-hidden="true" />,
      active: location.pathname.startsWith('/authority/audit')
    }
  ];

  const { user } = useAuth();
  const isFinanceAuditor = user?.role === 'AUTHORITY' || user?.role === 'ADMIN';

  const visibleNavItems = navItems.filter((item) => {
    if (item.to === '/authority/reconciliation' || item.to === '/authority/audit') {
      return isFinanceAuditor;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Sub-navigation bar for Authority Portal */}
      <nav
        aria-label="Authority Portal Navigation"
        style={{
          display: 'flex',
          gap: '0.25rem',
          borderBottom: '1px solid var(--color-border)',
          overflowX: 'auto',
          paddingBottom: '2px',
        }}
      >
        {visibleNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => {
              const active = isActive || item.active;
              return {
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.5rem 0.875rem',
                fontSize: '0.8125rem',
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                transition: 'all var(--transition-fast)',
              };
            }}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.future && (
              <span
                style={{
                  fontSize: '0.625rem',
                  padding: '1px 4px',
                  borderRadius: '2px',
                  backgroundColor: 'var(--color-surface-subtle)',
                  color: 'var(--color-text-muted)',
                }}
              >
                P2.3+
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Authority Content Area */}
      <div>
        <Outlet />
      </div>
    </div>
  );
};

export const AuthorityPlaceholder: React.FC<{ sectionName: string; phase: string }> = ({
  sectionName,
  phase,
}) => {
  return (
    <div
      style={{
        padding: '3rem 2rem',
        textAlign: 'center',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
        {sectionName} &mdash; Scheduled for {phase}
      </h3>
      <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
        In strict compliance with the project boundary rules, this dedicated operational sub-module is reserved for upcoming implementation phases.
      </p>
    </div>
  );
};
