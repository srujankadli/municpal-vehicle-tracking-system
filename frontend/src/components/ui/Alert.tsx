import React, { type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

export interface AlertProps {
  type?: 'info' | 'warning' | 'danger' | 'error' | 'success';
  variant?: 'info' | 'warning' | 'danger' | 'error' | 'success';
  title?: string;
  message?: ReactNode;
  children?: ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export function Alert({ type, variant, title, message, children, style, className }: AlertProps) {
  const { t } = useTranslation();

  const rawType = variant || type || 'info';
  const effectiveType = rawType === 'error' ? 'danger' : rawType;

  let icon = <Info size={18} aria-hidden="true" />;
  let color = 'var(--color-info)';
  let bg = 'var(--color-info-bg)';
  let border = 'var(--color-info-border)';

  switch (effectiveType) {
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

  const content = children ?? message;

  return (
    <div
      role={effectiveType === 'danger' || effectiveType === 'warning' ? 'alert' : 'status'}
      aria-live="polite"
      className={`alert alert-${effectiveType} ${className || ''}`.trim()}
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
        <div style={{ color: 'var(--color-text-secondary)', wordBreak: 'break-word' }}>{content}</div>
      </div>
    </div>
  );
}
