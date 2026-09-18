import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { SupportedLocale, TranslationDictionary } from './types';
import { en } from './locales/en';
import { hi } from './locales/hi';
import { formatCurrency, formatPercent, formatDate, formatTime, formatNumber } from './formatters';

export const LOCALE_STORAGE_KEY = 'municipal_ui_locale';

const dictionaries: Record<SupportedLocale, TranslationDictionary> = {
  en,
  hi
};

interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (keyPath: string, params?: Record<string, string | number>) => string;
  formatCurrency: (paise: number) => string;
  formatPercent: (percentage: number, decimals?: number) => string;
  formatDate: (isoDate: string) => string;
  formatTime: (isoTimestamp: string) => string;
  formatNumber: (value: number) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getSavedLocale(): SupportedLocale {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'en' || saved === 'hi') {
      return saved;
    }
  } catch {
    // Ignore storage failure
  }
  return 'en';
}

function resolveKey(dict: Record<string, any>, path: string): string | undefined {
  const parts = path.split('.');
  let current: any = dict;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(getSavedLocale);

  useEffect(() => {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Ignore
    }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', locale);
    }
  }, [locale]);

  const setLocale = (newLocale: SupportedLocale) => {
    setLocaleState(newLocale);
  };

  const t = (keyPath: string, params?: Record<string, string | number>): string => {
    const currentDict = dictionaries[locale] || en;
    let template = resolveKey(currentDict, keyPath);

    // Fallback to English if missing in selected locale
    if (template === undefined && locale !== 'en') {
      template = resolveKey(en, keyPath);
    }

    // Ultimate fallback to the key path
    if (template === undefined) {
      return keyPath;
    }

    // Variable interpolation {param}
    if (params) {
      return Object.entries(params).reduce((acc, [k, v]) => {
        return acc.replaceAll(`{${k}}`, String(v));
      }, template);
    }

    return template;
  };

  return (
    <I18nContext.Provider
      value={{
        locale,
        setLocale,
        t,
        formatCurrency: (paise) => formatCurrency(paise, locale),
        formatPercent: (pct, dec) => formatPercent(pct, locale, dec),
        formatDate: (d) => formatDate(d, locale),
        formatTime: (d) => formatTime(d, locale),
        formatNumber: (n) => formatNumber(n, locale)
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return ctx;
}
