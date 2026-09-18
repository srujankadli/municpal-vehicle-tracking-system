import React, { type ReactNode } from 'react';

export interface PanelProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
}

export function Panel({ title, subtitle, actions, children, style }: PanelProps) {
  return (
    <section
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: 'var(--space-4)',
        overflow: 'hidden',
        ...style
      }}
    >
      {(title || subtitle || actions) && (
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--color-border-subtle)',
            backgroundColor: 'var(--color-surface-subtle)',
            flexWrap: 'wrap',
            gap: 'var(--space-2)'
          }}
        >
          <div>
            {title && (
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>{actions}</div>}
        </header>
      )}
      <div style={{ padding: 'var(--space-4)' }}>{children}</div>
    </section>
  );
}
