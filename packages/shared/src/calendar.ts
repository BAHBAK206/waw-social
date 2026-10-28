/** iCalendar (RFC 5545) feed that Google Calendar, Apple Calendar and Outlook can subscribe to. */
export interface CalendarEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  /** Timed event (ms, UTC). */
  start?: number;
  end?: number;
  /** All-day event (YYYY-MM-DD). */
  day?: string;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const dayStamp = (day: string) => day.replace(/-/g, '');
const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');

/** Lines longer than 75 octets are folded (continuation lines start with a space). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = '';
      size = 0;
    }
    cur += ch;
    size += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

export function buildIcs(name: string, events: CalendarEvent[], now = Date.now()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Qubedu//Study calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@qubedu`, `DTSTAMP:${stamp(now)}`);
    if (e.day) lines.push(`DTSTART;VALUE=DATE:${dayStamp(e.day)}`, `DTEND;VALUE=DATE:${nextDay(e.day)}`);
    else if (e.start !== undefined) lines.push(`DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end ?? e.start + 3600_000)}`);
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Email addresses found anywhere in a CSV / spreadsheet export (Google Classroom, Excel, a plain list). */
export function emailsIn(text: string): string[] {
  const found = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
  return [...new Set(found.map((e) => e.toLowerCase()))];
}
