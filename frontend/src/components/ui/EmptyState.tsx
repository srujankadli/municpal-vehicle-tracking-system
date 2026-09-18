import React, { type ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-10) var(--space-4)',
        textAlign: 'center',
        backgroundColor: 'var(--color-surface)',
        border: '1px dashed var(--color-border)',
        borderRadius: 'var(--radius-md)',
        margin: 'var(--space-4) 0'
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          padding: 'var(--space-3)',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--color-surface-subtle)',
          color: 'var(--color-text-muted)',
          marginBottom: 'var(--space-3)'
        }}
        aria-hidden="true"
      >
        {icon || <Inbox size={28} />}
      </div>
      <h4 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 'var(--space-1)' }}>
        {title || t('common.empty')}
      </h4>
      {description && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', maxWidth: '420px', marginBottom: action ? 'var(--space-4)' : 0 }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 'var(--space-3)' }}>{action}</div>}
    </div>
  );
}
