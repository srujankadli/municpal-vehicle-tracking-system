import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { AppHeader } from './AppHeader';
import { DemoBanner } from './DemoBanner';
import { LayoutDashboard, Truck, Home } from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { t } = useTranslation();
  const { isAuthenticated, role } = useAuth();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-bg)',
      }}
    >
      <DemoBanner isVisible={true} />
      <AppHeader />

      {isAuthenticated && (
        <nav
          aria-label={t('a11y.mainNavLabel')}
          style={{
            backgroundColor: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
            padding: '0 1.5rem',
            display: 'flex',
            gap: '0.5rem',
            overflowX: 'auto',
          }}
        >
          {role && ['AUTHORITY', 'SUPERVISOR', 'WARD_OFFICER', 'ADMIN'].includes(role) && (
            <NavLink
              to="/authority"
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                textDecoration: 'none',
                transition: 'all var(--transition-fast)',
              })}
            >
              <LayoutDashboard size={16} aria-hidden="true" />
              <span>{t('shell.portalAuthority')}</span>
            </NavLink>
          )}

          {role && ['WORKER', 'DRIVER', 'SUPERVISOR', 'ADMIN'].includes(role) && (
            <NavLink
              to="/worker"
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                textDecoration: 'none',
                transition: 'all var(--transition-fast)',
              })}
            >
              <Truck size={16} aria-hidden="true" />
              <span>{t('shell.portalWorker')}</span>
            </NavLink>
          )}

          {role && ['CITIZEN', 'ADMIN'].includes(role) && (
            <NavLink
              to="/citizen"
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                textDecoration: 'none',
                transition: 'all var(--transition-fast)',
              })}
            >
              <Home size={16} aria-hidden="true" />
              <span>{t('shell.portalCitizen')}</span>
            </NavLink>
          )}
        </nav>
      )}

      <main
        style={{
          flex: 1,
          padding: '1.5rem',
          maxWidth: '1400px',
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        <Outlet />
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          padding: '1rem 1.5rem',
          textAlign: 'center',
          fontSize: '0.75rem',
          color: 'var(--color-text-muted)',
        }}
      >
        <p style={{ margin: 0 }}>
          {t('common.appTitle')} &mdash; {t('common.appSubtitle')} &bull; Phase 2.1 Civic Frontend Foundation
        </p>
      </footer>
    </div>
  );
};
