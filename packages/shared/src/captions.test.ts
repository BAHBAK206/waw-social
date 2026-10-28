import { describe, expect, it } from 'vitest';
import { cueAt, parseCaptions, searchCues, toVtt } from './captions';

const VTT = `WEBVTT

1
00:00:01.000 --> 00:00:04.500
<v Teacher>Plants make <i>glucose</i> from light.

00:00:05.000 --> 00:00:08.000 align:start
الكلوروفيل يمتصّ الضوء
`;
const SRT = `1\r\n00:00:01,000 --> 00:00:04,500\r\nFirst line\r\nsecond line\r\n\r\n2\r\n00:01:02,250 --> 00:01:05,000\r\nOxygen &amp; water\r\n`;

describe('captions', () => {
  it('reads WebVTT and SubRip', () => {
    expect(parseCaptions(VTT)).toEqual([
      { start: 1, end: 4.5, text: 'Plants make glucose from light.' },
      { start: 5, end: 8, text: 'الكلوروفيل يمتصّ الضوء' },
    ]);
    expect(parseCaptions(SRT)).toEqual([
      { start: 1, end: 4.5, text: 'First line second line' },
      { start: 62.25, end: 65, text: 'Oxygen & water' },
    ]);
    expect(parseCaptions('not captions')).toEqual([]);
  });
  it('writes WebVTT that reads back the same', () => {
    const cues = parseCaptions(SRT);
    expect(parseCaptions(toVtt(cues))).toEqual(cues);
    expect(toVtt(cues)).toContain('00:01:02.250 --> 00:01:05.000');
  });
  it('finds the cue at a time and searches text', () => {
    const cues = parseCaptions(VTT);
    expect(cueAt(cues, 2)).toBe(0);
    expect(cueAt(cues, 4.9)).toBe(-1);
    expect(cueAt(cues, 6)).toBe(1);
    expect(searchCues(cues, 'GLUCOSE light')).toEqual([0]);
    expect(searchCues(cues, 'يمتص')).toEqual([1]);
  });
});
