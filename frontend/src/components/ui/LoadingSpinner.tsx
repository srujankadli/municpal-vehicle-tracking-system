import React from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

export interface LoadingSpinnerProps {
  label?: string;
  size?: number;
}

export function LoadingSpinner({ label, size = 20 }: LoadingSpinnerProps) {
  const { t } = useTranslation();
  const displayLabel = label || t('common.loading');

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        color: 'var(--color-text-muted)',
        fontSize: 'var(--text-sm)'
      }}
    >
      <Loader2
        size={size}
        style={{
          animation: 'spin 1s linear infinite'
        }}
        aria-hidden="true"
      />
      <span>{displayLabel}</span>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
