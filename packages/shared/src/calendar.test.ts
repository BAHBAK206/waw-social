import { describe, expect, it } from 'vitest';
import { buildIcs, emailsIn } from './calendar';

describe('calendar feed', () => {
  it('writes timed and all-day events with escaping and folding', () => {
    const ics = buildIcs(
      'Qubedu — Sara',
      [
        { uid: 'a1', title: 'Lab report, part 2; due', start: Date.UTC(2026, 10, 3, 9, 0), description: 'Line one\nLine two' },
        { uid: 'e1', title: 'امتحان الفيزياء', day: '2026-11-10', location: 'Room 4' },
        { uid: 'long', title: 'x'.repeat(200), start: Date.UTC(2026, 10, 4) },
      ],
      Date.UTC(2026, 9, 28),
    );
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0')).toBe(true);
    expect(ics).toContain('DTSTART:20261103T090000Z');
    expect(ics).toContain('DTEND:20261103T100000Z');
    expect(ics).toContain('SUMMARY:Lab report\\, part 2\\; due');
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261110');
    expect(ics).toContain('DTEND;VALUE=DATE:20261111');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });
  it('finds emails in any CSV export', () => {
    const csv = 'Last Name,First Name,Email Address\nAli,Omar,Omar.Ali@School.edu\n"Sara","N",sara@x.io;sara@x.io\nno email here';
    expect(emailsIn(csv)).toEqual(['omar.ali@school.edu', 'sara@x.io']);
  });
});
