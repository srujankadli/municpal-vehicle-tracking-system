import React from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';
import { SUPPORTED_LOCALES, type SupportedLocale } from '../../i18n/types';

export function LanguageSelector() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <Globe size={16} aria-hidden="true" style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
      <label htmlFor="language-select" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', border: 0 }}>
        {t('a11y.languageSelectorLabel')}
      </label>
      <select
        id="language-select"
        value={locale}
        onChange={(e) => setLocale(e.target.value as SupportedLocale)}
        aria-label={t('a11y.languageSelectorLabel')}
        style={{
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-1) var(--space-2)',
          fontSize: 'var(--text-sm)',
          fontFamily: 'inherit',
          cursor: 'pointer'
        }}
      >
        {SUPPORTED_LOCALES.map((loc) => (
          <option key={loc.code} value={loc.code}>
            {loc.nativeLabel} ({loc.label})
          </option>
        ))}
      </select>
    </div>
  );
}
