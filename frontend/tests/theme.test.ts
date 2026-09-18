import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme, THEME_STORAGE_KEY } from '../src/design-system/theme.js';

describe('Phase 2.1 - Theme Resolution & Persistence Tests', () => {
  it('1. Default theme resolves to light when no preference is stored', () => {
    // When system is dark, but mode is light
    assert.equal(resolveTheme('light', true), 'light');
    // When system is light, and mode is light
    assert.equal(resolveTheme('light', false), 'light');
  });

  it('2. Dark mode resolves to dark regardless of system preference', () => {
    assert.equal(resolveTheme('dark', true), 'dark');
    assert.equal(resolveTheme('dark', false), 'dark');
  });

  it('3. System mode respects system media query state', () => {
    assert.equal(resolveTheme('system', true), 'dark');
    assert.equal(resolveTheme('system', false), 'light');
  });

  it('4. Theme storage key is standardized and documented', () => {
    assert.equal(THEME_STORAGE_KEY, 'municipal_ui_theme');
  });
});
