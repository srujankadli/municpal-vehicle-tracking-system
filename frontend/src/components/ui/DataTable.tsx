import React, { type ReactNode } from 'react';
import { useTranslation } from '../../i18n/I18nContext';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  isNumeric?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  caption?: string;
  emptyMessage?: string;
}

export function DataTable<T>({ columns, data, keyExtractor, caption, emptyMessage }: DataTableProps<T>) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--space-8)',
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--text-sm)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--color-surface)'
        }}
      >
        {emptyMessage || t('common.empty')}
      </div>
    );
  }

  return (
    <div className="table-container">
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 'var(--text-sm)',
          textAlign: 'left'
        }}
      >
        {caption && (
          <caption style={{ padding: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textAlign: 'left' }}>
            {caption}
          </caption>
        )}
        <thead>
          <tr style={{ backgroundColor: 'var(--color-surface-subtle)', borderBottom: '1px solid var(--color-border)' }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  textAlign: col.isNumeric ? 'right' : 'left',
                  whiteSpace: 'nowrap'
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={keyExtractor(row)}
              style={{
                borderBottom: idx < data.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
                backgroundColor: 'transparent',
                transition: 'background-color 0.1s ease'
              }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    color: 'var(--color-text-primary)',
                    textAlign: col.isNumeric ? 'right' : 'left'
                  }}
                  className={col.isNumeric ? 'tabular-nums' : undefined}
                >
                  {col.render ? col.render(row) : (row as any)[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
