import React from 'react';
import { useTranslation } from '../i18n/I18nContext';
import { ShieldAlert } from 'lucide-react';

export interface DemoBannerProps {
  isVisible?: boolean;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({ isVisible = true }) => {
  const { t } = useTranslation();

  if (!isVisible) return null;

  return (
    <div
      role="region"
      aria-label={t('shell.demoBanner')}
      style={{
        backgroundColor: 'var(--color-demo-bg)',
        color: 'var(--color-demo-text)',
        borderBottom: '1px solid var(--color-demo-border)',
        padding: '0.5rem 1.25rem',
        fontSize: '0.8125rem',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        textAlign: 'center',
        letterSpacing: '0.01em',
      }}
      data-testid="demo-environment-banner"
    >
      <ShieldAlert size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span>{t('shell.demoBanner')}</span>
    </div>
  );
};
