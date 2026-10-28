import type { Translator } from '@qubedu/i18n';

export function relativeTime(ms: number, tr: Translator, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return tr.t('common.justNow');
  if (min < 60) return tr.t('common.minutesAgo', { count: min });
  const h = Math.floor(min / 60);
  if (h < 24) return tr.t('common.hoursAgo', { count: h });
  const d = Math.floor(h / 24);
  if (d < 7) return tr.t('common.daysAgo', { count: d });
  return formatDate(ms, tr);
}

export function formatDate(value: number | string | Date, tr: Translator, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  const d = typeof value === 'string' ? parseDay(value) : new Date(value);
  try {
    return new Intl.DateTimeFormat(tr.intl, opts).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

export function formatDateTime(ms: number, tr: Translator): string {
  return formatDate(ms, tr, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatTime(ms: number, tr: Translator): string {
  return formatDate(ms, tr, { timeStyle: 'short' });
}

/** "2026-10-27" → local Date at midnight (no timezone shift). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysUntil(day: string, from = new Date()): number {
  const a = parseDay(todayKey(from)).getTime();
  return Math.round((parseDay(day).getTime() - a) / 86_400_000);
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatNumber(n: number, tr: Translator, opts?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(tr.intl, opts).format(n);
  } catch {
    return String(n);
  }
}

export function compactNumber(n: number, tr: Translator): string {
  return formatNumber(n, tr, { notation: 'compact', maximumFractionDigits: 1 });
}

/** `datetime-local` input value ↔ epoch ms. */
export function toLocalInput(ms: number | null | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

export function greetingKey(date = new Date()): 'home.morning' | 'home.afternoon' | 'home.evening' {
  const h = date.getHours();
  if (h < 12) return 'home.morning';
  if (h < 18) return 'home.afternoon';
  return 'home.evening';
}

/** "in 3 hours" / "tomorrow" style text for a future (or past) timestamp, localized. */
export function relativeFuture(ms: number, tr: Translator, now = Date.now()): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    abs < 3_600_000
      ? [Math.round(diff / 60_000), 'minute']
      : abs < 86_400_000
        ? [Math.round(diff / 3_600_000), 'hour']
        : [Math.round(diff / 86_400_000), 'day'];
  try {
    return new Intl.RelativeTimeFormat(tr.intl, { numeric: 'auto' }).format(value, unit);
  } catch {
    return `${value} ${unit}`;
  }
}

/** A course price, e.g. "$15.00" / "15٫00 US$"; 0 is shown by the caller as "Free". */
export function formatPrice(cents: number, currency: string, tr: Translator): string {
  try {
    return new Intl.NumberFormat(tr.intl, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
