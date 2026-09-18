/**
 * Theme Engine for Urban Civic Design System
 * Supports LIGHT (default), DARK (Urban Night Operations), and SYSTEM
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'municipal_ui_theme';

export function getSystemPreference(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(mode: ThemeMode, systemDark?: boolean): ResolvedTheme {
  if (mode === 'system') {
    if (systemDark !== undefined) {
      return systemDark ? 'dark' : 'light';
    }
    return getSystemPreference();
  }
  return mode;
}

export function getSavedTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }
  return 'light'; // Default is always LIGHT
}

export function applyThemeToDocument(theme: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(theme);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved);
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) {
      meta.setAttribute('content', resolved);
    }
  }
  return resolved;
}
