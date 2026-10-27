import { describe, expect, it } from 'vitest';
import { detectTextLanguage, LAB_LANGUAGES, LAB_SET_IDS, PRONUNCIATION_SETS, scorePronunciation } from '../src/pronunciation';

describe('pronunciation scoring', () => {
  it('gives a perfect score for an exact match, ignoring case, punctuation and Arabic diacritics', () => {
    expect(scorePronunciation('Good morning, teacher!', 'good morning teacher').score).toBe(100);
    expect(scorePronunciation('قَلَم وكَلْب', 'قلم وكلب').score).toBe(100);
    expect(scorePronunciation('إلى اللقاء غدًا', 'الى اللقاء غدا').score).toBe(100);
  });
  it('marks the missing words and lowers the score', () => {
    const r = scorePronunciation('The cell is the basic unit of life', 'the cell is the unit of life');
    expect(r.words.find((w) => w.word === 'basic')?.ok).toBe(false);
    expect(r.words.filter((w) => w.ok).length).toBe(7);
    expect(r.score).toBeGreaterThan(70);
    expect(r.score).toBeLessThan(100);
  });
  it('accepts close recognitions of long words', () => {
    expect(scorePronunciation('photosynthesis', 'photosynthesys').words[0]!.ok).toBe(true);
  });
  it('scores silence or a different sentence low', () => {
    expect(scorePronunciation('I study every day', '').score).toBe(0);
    expect(scorePronunciation('I study every day', 'banana phone').score).toBeLessThan(30);
  });
  it('detects the language of a text for read-aloud', () => {
    expect(detectTextLanguage('ما هو التمثيل الضوئي؟')).toBe('ar');
    expect(detectTextLanguage('What is the speed of light in a vacuum?')).toBe('en');
    expect(detectTextLanguage('Pourquoi la photosynthèse est-elle importante pour les plantes ?')).toBe('fr');
    expect(detectTextLanguage('¿Por qué la célula es la unidad básica de la vida?')).toBe('es');
    expect(detectTextLanguage('42', 'fr')).toBe('fr');
  });
  it('has every practice set for every language', () => {
    for (const l of LAB_LANGUAGES) for (const s of LAB_SET_IDS) expect(PRONUNCIATION_SETS[l][s].length).toBeGreaterThanOrEqual(4);
  });
});
