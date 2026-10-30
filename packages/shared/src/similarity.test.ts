import { describe, expect, it } from 'vitest';
import { findSimilar, writingStats } from './similarity';

const essay =
  'Photosynthesis is the process in which green plants use sunlight water and carbon dioxide to make glucose and release oxygen into the air which animals then breathe to live and grow every day.';
const other =
  'Volcanoes form where tectonic plates meet and magma rises through cracks in the crust, building mountains over thousands of years while ash and lava change the land around them completely.';

describe('similarity check', () => {
  it('finds copied work, ignores the instructions and short answers', () => {
    const copied = `My answer: ${essay} That is all I know about it.`;
    const r = findSimilar([
      { id: 's1', text: essay },
      { id: 's2', text: copied },
      { id: 's3', text: other },
      { id: 's4', text: 'Too short to compare.' },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ a: 's1', b: 's2' });
    expect(r[0]!.score).toBeGreaterThan(0.9);
    expect(r[0]!.excerpt).toContain('green plants use sunlight');
    // Text everyone copies from the instructions doesn't count.
    expect(
      findSimilar(
        [
          { id: 's1', text: essay },
          { id: 's2', text: copied },
        ],
        { ignore: essay },
      ),
    ).toHaveLength(0);
  });

  it('compares Arabic text after normalising letter forms', () => {
    const a =
      'إن عملية البناء الضوئي هي العملية التي تقوم فيها النباتات الخضراء باستخدام ضوء الشمس والماء وثاني أكسيد الكربون لصنع الغذاء وإطلاق الأكسجين في الهواء الذي تتنفسه الكائنات الحية كل يوم';
    const b = a.replace(/إ/g, 'ا').replace(/ة/g, 'ه');
    expect(
      findSimilar([
        { id: 'x', text: a },
        { id: 'y', text: b },
      ])[0]?.score,
    ).toBe(1);
  });

  it('measures how much of a text comes from a source', () => {
    const r = findSimilar([{ id: 's1', text: `${essay} ${other}` }], { against: [{ id: 'book', text: essay }], threshold: 0.3 });
    expect(r[0]).toMatchObject({ a: 's1', b: 'book' });
    expect(r[0]!.score).toBeGreaterThan(0.4);
    expect(r[0]!.score).toBeLessThan(0.6);
  });

  it('counts words, sentences and paragraphs', () => {
    expect(writingStats('One two three. Four five!\n\nSix seven eight nine?')).toEqual({ words: 9, sentences: 3, paragraphs: 2, avgSentence: 3 });
  });
});
