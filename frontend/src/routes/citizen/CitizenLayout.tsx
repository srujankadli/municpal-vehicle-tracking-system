import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { Home, CalendarCheck, MessageSquareWarning, CreditCard, ShieldCheck } from 'lucide-react';

export const CitizenLayout: React.FC = () => {
  const { t } = useTranslation();
  const { session } = useAuth();
  const location = useLocation();

  const navItems = [
    {
      to: '/citizen',
      label: t('portals.citizen.navOverview'),
      icon: <Home size={16} aria-hidden="true" />,
      exact: true
    },
    {
      to: '/citizen/service',
      label: t('portals.citizen.navService'),
      icon: <CalendarCheck size={16} aria-hidden="true" />,
      exact: false
    },
    {
      to: '/citizen/complaints',
      label: t('portals.citizen.navComplaints'),
      icon: <MessageSquareWarning size={16} aria-hidden="true" />,
      exact: false
    },
    {
      to: '/citizen/payments',
      label: t('portals.citizen.navPayments'),
      icon: <CreditCard size={16} aria-hidden="true" />,
      exact: false
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Banner */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {t('portals.citizen.title')}
            </h2>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.6875rem',
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-surface-subtle)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              <ShieldCheck size={12} color="var(--color-primary)" />
              {t('shell.portalCitizen')}
            </span>
          </div>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {t('portals.citizen.subtitle')}
          </p>
        </div>

        {session?.householdId && (
          <div
            style={{
              padding: '0.375rem 0.75rem',
              backgroundColor: 'var(--color-surface-subtle)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8125rem',
              color: 'var(--color-text-secondary)',
            }}
          >
            <span style={{ fontWeight: 600 }}>{t('portals.citizen.serviceUid')}: </span>
            <code style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{session.householdId}</code>
          </div>
        )}
      </div>

      {/* Sub-navigation bar for Citizen Portal */}
      <nav
        aria-label={t('portals.citizen.title')}
        style={{
          display: 'flex',
          gap: '0.25rem',
          borderBottom: '1px solid var(--color-border)',
          overflowX: 'auto',
          paddingBottom: '2px',
        }}
      >
        {navItems.map((item) => {
          const isActive = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);

          return (
            <NavLink
              key={item.to}
              to={item.to}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.5rem 0.875rem',
                fontSize: '0.8125rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                transition: 'all var(--transition-fast)',
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Citizen Content Body */}
      <div>
        <Outlet />
      </div>
    </div>
  );
};
