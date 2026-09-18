import React, { type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

export interface AlertProps {
  type?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  children: ReactNode;
  style?: React.CSSProperties;
}

export function Alert({ type = 'info', title, children, style }: AlertProps) {
  const { t } = useTranslation();

  let icon = <Info size={18} aria-hidden="true" />;
  let color = 'var(--color-info)';
  let bg = 'var(--color-info-bg)';
  let border = 'var(--color-info-border)';

  switch (type) {
    case 'warning':
      icon = <AlertTriangle size={18} aria-hidden="true" />;
      color = 'var(--color-warning)';
      bg = 'var(--color-warning-bg)';
      border = 'var(--color-warning-border)';
      break;
    case 'danger':
      icon = <AlertCircle size={18} aria-hidden="true" />;
      color = 'var(--color-danger)';
      bg = 'var(--color-danger-bg)';
      border = 'var(--color-danger-border)';
      break;
    case 'success':
      icon = <CheckCircle2 size={18} aria-hidden="true" />;
      color = 'var(--color-success)';
      bg = 'var(--color-success-bg)';
      border = 'var(--color-success-border)';
      break;
  }

  return (
    <div
      role={type === 'danger' || type === 'warning' ? 'alert' : 'status'}
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${border}`,
        backgroundColor: bg,
        color: 'var(--color-text-primary)',
        fontSize: 'var(--text-sm)',
        marginBottom: 'var(--space-4)',
        ...style
      }}
    >
      <span style={{ color, display: 'inline-flex', flexShrink: 0, marginTop: '2px' }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <strong style={{ display: 'block', color, marginBottom: '2px', fontWeight: 600 }}>
            {t('a11y.errorNotification')}{title}
          </strong>
        )}
        <div style={{ color: 'var(--color-text-secondary)', wordBreak: 'break-word' }}>{children}</div>
      </div>
    </div>
  );
}
