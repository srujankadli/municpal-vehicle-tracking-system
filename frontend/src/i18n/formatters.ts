/**
 * Locale-Aware Numerical and Date/Time Formatters
 * Backed strictly by native browser Intl Web APIs
 */

export function formatCurrency(amountPaise: number, locale: string = 'en'): string {
  const rupees = amountPaise / 100;
  const targetLocale = locale === 'hi' ? 'hi-IN' : 'en-IN';
  try {
    return new Intl.NumberFormat(targetLocale, {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(rupees);
  } catch {
    return `₹${rupees.toFixed(2)}`;
  }
}

export function formatPercent(valuePercentage: number, locale: string = 'en', decimals: number = 2): string {
  const targetLocale = locale === 'hi' ? 'hi-IN' : 'en-IN';
  try {
    return new Intl.NumberFormat(targetLocale, {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(valuePercentage / 100);
  } catch {
    return `${valuePercentage.toFixed(decimals)}%`;
  }
}

export function formatDate(isoDateString: string, locale: string = 'en'): string {
  const targetLocale = locale === 'hi' ? 'hi-IN' : 'en-IN';
  try {
    const d = new Date(isoDateString);
    if (isNaN(d.getTime())) return isoDateString;
    return new Intl.DateTimeFormat(targetLocale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(d);
  } catch {
    return isoDateString;
  }
}

export function formatTime(isoTimestamp: string, locale: string = 'en'): string {
  const targetLocale = locale === 'hi' ? 'hi-IN' : 'en-IN';
  try {
    const d = new Date(isoTimestamp);
    if (isNaN(d.getTime())) return isoTimestamp;
    return new Intl.DateTimeFormat(targetLocale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(d);
  } catch {
    return isoTimestamp;
  }
}

export function formatNumber(value: number, locale: string = 'en'): string {
  const targetLocale = locale === 'hi' ? 'hi-IN' : 'en-IN';
  try {
    return new Intl.NumberFormat(targetLocale).format(value);
  } catch {
    return String(value);
  }
}
