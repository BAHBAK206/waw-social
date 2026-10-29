import type { Translator } from '@qubedu/i18n';

export function relativeTime(ms: number, tr: Translator, now = Date.now()): string {
  const min = Math.floor(Math.max(0, now - ms) / 60_000);
  if (min < 1) return tr.t('common.justNow');
  if (min < 60) return tr.t('common.minutesAgo', { count: min });
  const h = Math.floor(min / 60);
  if (h < 24) return tr.t('common.hoursAgo', { count: h });
  const d = Math.floor(h / 24);
  if (d < 7) return tr.t('common.daysAgo', { count: d });
  try {
    return new Intl.DateTimeFormat(tr.intl, { dateStyle: 'medium' }).format(new Date(ms));
  } catch {
    return new Date(ms).toDateString();
  }
}

export function formatTime(ms: number, tr: Translator): string {
  try {
    return new Intl.DateTimeFormat(tr.intl, { timeStyle: 'short' }).format(new Date(ms));
  } catch {
    return new Date(ms).toTimeString().slice(0, 5);
  }
}

export function compactNumber(n: number, tr: Translator): string {
  try {
    return new Intl.NumberFormat(tr.intl, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch {
    return String(n);
  }
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`;
}

/** Formats a "YYYY-MM-DD" day (or a timestamp) in the app language. */
export function formatDay(
  day: string | number,
  tr: Translator,
  opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' },
): string {
  const d = typeof day === 'number' ? new Date(day) : new Date(`${day}T12:00:00`);
  try {
    return new Intl.DateTimeFormat(tr.intl, opts).format(d);
  } catch {
    return typeof day === 'string' ? day : d.toISOString().slice(0, 10);
  }
}

/** A course price, e.g. "$15.00"; 0 is shown by the caller as "Free". */
export function formatPrice(cents: number, currency: string, tr: Translator): string {
  try {
    return new Intl.NumberFormat(tr.intl, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** A date such as "12 Mar 2026". */
export function formatDate(ms: number, tr: Translator): string {
  return formatDay(ms, tr, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A date and time such as "Thu, 12 Mar, 4:30 PM". */
export function formatDateTime(ms: number, tr: Translator): string {
  return `${formatDay(ms, tr)} ${formatTime(ms, tr)}`;
}
