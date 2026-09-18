import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/i18n/locales/en.js';
import { hi } from '../src/i18n/locales/hi.js';
import {
  formatCurrency,
  formatPercent,
  formatDate,
  formatTime,
  formatNumber,
} from '../src/i18n/formatters.js';

describe('Phase 2.1 - Multilingual / i18n Architecture Tests', () => {
  it('1. Baseline English dictionary contains all required top-level domain sections', () => {
    const requiredSections = ['common', 'shell', 'status', 'a11y', 'errors', 'portals'];
    for (const sec of requiredSections) {
      assert.ok(sec in en, `English dictionary missing top-level section: ${sec}`);
    }
  });

  it('2. Hindi demonstration dictionary mirrors all keys in English baseline without missing keys', () => {
    function getKeys(obj: any, prefix = ''): string[] {
      return Object.keys(obj).reduce((res: string[], el) => {
        if (Array.isArray(obj[el])) {
          return res;
        } else if (typeof obj[el] === 'object' && obj[el] !== null) {
          return [...res, ...getKeys(obj[el], prefix + el + '.')];
        }
        return [...res, prefix + el];
      }, []);
    }

    const enKeys = getKeys(en);
    const hiKeys = new Set(getKeys(hi));

    for (const key of enKeys) {
      assert.ok(hiKeys.has(key), `Hindi dictionary missing required translation key: ${key}`);
    }
  });

  it('3. Canonical domain statuses are translated at presentation layer only while canonical tokens remain neutral', () => {
    // English verification statuses
    assert.equal(en.status.verification.EXPECTED, 'Scheduled / Expected');
    assert.equal(en.status.verification.OBSERVED, 'Observed in Vicinity');
    assert.equal(en.status.verification.EVIDENCE_AVAILABLE, 'Evidence Logged');
    assert.equal(en.status.verification.VERIFIED, 'Verified Collected');
    assert.equal(en.status.verification.NOT_VERIFIED, 'Not Verified');
    assert.equal(en.status.verification.EXCEPTION, 'Approved Exception');
    assert.equal(en.status.verification.DISPUTED, 'Disputed by Citizen');

    // Hindi verification statuses in Devanagari
    assert.equal(hi.status.verification.EXPECTED, 'निर्धारित / अपेक्षित');
    assert.equal(hi.status.verification.OBSERVED, 'समीप में देखा गया');
    assert.equal(hi.status.verification.EVIDENCE_AVAILABLE, 'साक्ष्य दर्ज');
    assert.equal(hi.status.verification.VERIFIED, 'सत्यापित एकत्र');
    assert.equal(hi.status.verification.NOT_VERIFIED, 'असत्यापित');
    assert.equal(hi.status.verification.EXCEPTION, 'स्वीकृत अपवाद');
    assert.equal(hi.status.verification.DISPUTED, 'नागरिक द्वारा विवादित');

    // Payment statuses
    assert.equal(en.status.payment.SUCCESSFUL, 'Payment Successful');
    assert.equal(en.status.payment.FAILED, 'Payment Failed');
    assert.equal(hi.status.payment.SUCCESSFUL, 'भुगतान सफल');
    assert.equal(hi.status.payment.FAILED, 'भुगतान विफल');
  });

  it('4. Currency formatter converts integer paise to INR ₹ formatting', () => {
    const enFormatted = formatCurrency(125000, 'en');
    // ₹1,250.00
    assert.ok(enFormatted.includes('1,250'), `Formatted currency should contain 1,250: ${enFormatted}`);

    const hiFormatted = formatCurrency(125000, 'hi');
    assert.ok(hiFormatted.includes('1,250') || hiFormatted.includes('१,२५०'), `Hindi formatted currency contains correct digits: ${hiFormatted}`);
  });

  it('5. Percentage and tabular number formatters work across locales', () => {
    const enPct = formatPercent(94.56, 'en', 1);
    assert.ok(enPct.includes('94.6') || enPct.includes('95'), `Formatted percent: ${enPct}`);

    const enNum = formatNumber(1024500, 'en');
    assert.ok(enNum.includes('1,024,500') || enNum.includes('10,24,500'), `Formatted number: ${enNum}`);
  });

  it('6. Date/Time formatters produce valid localized representations', () => {
    const sampleIso = '2026-09-14T10:30:00.000Z';
    const enDate = formatDate(sampleIso, 'en');
    assert.ok(enDate.length > 5, `Date string should be non-empty: ${enDate}`);

    const enTime = formatTime(sampleIso, 'en');
    assert.ok(enTime.length > 3, `Time string should be non-empty: ${enTime}`);
  });

  it('7. Accessibility labels exist for screen readers across both languages', () => {
    assert.ok(en.a11y.languageSelectorLabel.length > 0);
    assert.ok(hi.a11y.languageSelectorLabel.length > 0);
    assert.ok(en.a11y.themeSelectorLabel.length > 0);
    assert.ok(hi.a11y.themeSelectorLabel.length > 0);
  });
});
