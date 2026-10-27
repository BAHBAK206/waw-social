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
