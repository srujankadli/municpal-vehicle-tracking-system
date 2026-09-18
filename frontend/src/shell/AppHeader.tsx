import React from 'react';
import { useTranslation } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { LanguageSelector } from '../components/ui/LanguageSelector';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { Building2, User, LogOut } from 'lucide-react';
import { Button } from '../components/ui/Button';

export const AppHeader: React.FC = () => {
  const { t } = useTranslation();
  const { session, isAuthenticated, logout } = useAuth();

  return (
    <header
      style={{
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '0.75rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div
          style={{
            width: '2.25rem',
            height: '2.25rem',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-hidden="true"
        >
          <Building2 size={20} />
        </div>
        <div>
          <h1
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {t('common.appTitle')}
          </h1>
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-text-secondary)',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {t('common.appSubtitle')}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <LanguageSelector />
        <ThemeToggle />

        {isAuthenticated && session && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              paddingLeft: '0.75rem',
              borderLeft: '1px solid var(--color-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <User size={16} style={{ color: 'var(--color-text-muted)' }} aria-hidden="true" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    lineHeight: 1.2,
                  }}
                >
                  {session.fullName || session.username}
                </span>
                <span
                  style={{
                    fontSize: '0.6875rem',
                    color: 'var(--color-text-muted)',
                    lineHeight: 1.2,
                  }}
                >
                  {session.role}
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              ariaLabel={t('common.logout')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
            >
              <LogOut size={14} aria-hidden="true" />
              <span>{t('common.logout')}</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
};
