import React from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { formatPercent, formatCurrency } from '../../i18n/formatters';
import type { MetricResult } from '../../types/operations';
import { TrendingUp, AlertCircle, ShieldCheck, HelpCircle } from 'lucide-react';

export interface MetricCardProps {
  title: string;
  metric?: MetricResult | null;
  description: string;
  caveat: string;
  loading?: boolean;
  error?: string | null;
  isCurrency?: boolean;
  unit?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  metric,
  description,
  caveat,
  loading = false,
  error = null,
  isCurrency = false,
  unit,
}) => {
  const { locale } = useTranslation();

  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h3
          style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {title}
        </h3>
        <div
          title={metric?.data_classification ? `Provenance: ${metric.data_classification}` : 'Municipal Derived Metric'}
          style={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-surface-subtle)',
            color: 'var(--color-text-muted)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          DERIVED
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        {loading ? (
          <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
            &mdash;
          </span>
        ) : error ? (
          <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-danger)' }}>
            Unavailable
          </span>
        ) : metric ? (
          <>
            <span
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {isCurrency
                ? formatCurrency(metric.numerator, locale)
                : `${metric.value_percentage.toFixed(2)}%`}
            </span>
            {metric.denominator > 0 && !isCurrency && (
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                ({metric.numerator} / {metric.denominator} {unit || 'units'})
              </span>
            )}
          </>
        ) : (
          <span style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
            N/A
          </span>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: '0.625rem' }}>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
          <strong>What it measures:</strong> {description}
        </p>
        <p
          style={{
            margin: '0.25rem 0 0',
            fontSize: '0.6875rem',
            color: 'var(--color-text-muted)',
            lineHeight: 1.3,
            fontStyle: 'italic',
          }}
        >
          <strong>Limitation:</strong> {caveat}
        </p>
      </div>
    </div>
  );
};
