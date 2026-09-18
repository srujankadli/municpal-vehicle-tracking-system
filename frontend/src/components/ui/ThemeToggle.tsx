import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../../design-system/ThemeProvider';
import { useTranslation } from '../../i18n/I18nContext';
import type { ThemeMode } from '../../design-system/theme';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  const themeOptions: { mode: ThemeMode; icon: React.ReactNode; labelKey: string }[] = [
    { mode: 'light', icon: <Sun size={15} aria-hidden="true" />, labelKey: 'common.light' },
    { mode: 'dark', icon: <Moon size={15} aria-hidden="true" />, labelKey: 'common.dark' },
    { mode: 'system', icon: <Monitor size={15} aria-hidden="true" />, labelKey: 'common.system' }
  ];

  return (
    <div
      role="group"
      aria-label={t('a11y.themeSelectorLabel')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        backgroundColor: 'var(--color-surface-subtle)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-sm)',
        padding: '2px'
      }}
    >
      {themeOptions.map((opt) => {
        const isActive = theme === opt.mode;
        return (
          <button
            key={opt.mode}
            type="button"
            onClick={() => setTheme(opt.mode)}
            aria-pressed={isActive}
            title={t(opt.labelKey)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              backgroundColor: isActive ? 'var(--color-surface)' : 'transparent',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              border: isActive ? '1px solid var(--color-border)' : '1px solid transparent',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-1) var(--space-2)',
              fontSize: 'var(--text-xs)',
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              transition: 'background-color 0.15s ease'
            }}
          >
            {opt.icon}
            <span>{t(opt.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
