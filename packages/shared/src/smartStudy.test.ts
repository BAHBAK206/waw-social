import { describe, expect, it } from 'vitest';
import { buildStudyPack, definitionsIn, reviewAfterAnswer } from './smartStudy';

const NOW = Date.UTC(2026, 0, 10, 12);

describe('reviewAfterAnswer', () => {
  it('queues a missed question for tomorrow and counts the miss', () => {
    const r = reviewAfterAnswer(null, false, NOW)!;
    expect(r.misses).toBe(1);
    expect(r.dueAt).toBe(NOW + 86_400_000);
    expect(reviewAfterAnswer(r, false, NOW + 1000)!.misses).toBe(2);
  });
  it('ignores a right answer to a question that was never missed', () => {
    expect(reviewAfterAnswer(null, true, NOW)).toBeNull();
  });
  it('pushes the next review out after a right answer', () => {
    const missed = reviewAfterAnswer(null, false, NOW)!;
    const next = reviewAfterAnswer(missed, true, NOW + 86_400_000)!;
    expect(next.misses).toBe(1);
    expect(next.dueAt).toBeGreaterThan(NOW + 86_400_000);
  });
});

describe('study pack', () => {
  const text = `Photosynthesis
Photosynthesis is the process by which plants make food from light. Plants use chlorophyll to absorb light.
Chlorophyll is a green pigment found in the chloroplasts of plant cells.
Respiration
Respiration is the release of energy from food inside cells. Cells use oxygen during respiration.`;
  it('finds definitions in four languages', () => {
    expect(definitionsIn(text).map((d) => d.term)).toEqual(expect.arrayContaining(['Photosynthesis', 'Chlorophyll', 'Respiration']));
    expect(definitionsIn('الخلية هي وحدة البناء الأساسية في جميع الكائنات الحية.')[0]?.term).toBe('الخلية');
    expect(definitionsIn('La mitose est un processus de division des cellules du corps.')[0]?.term).toBe('mitose');
    expect(definitionsIn('El átomo es la unidad básica de la materia ordinaria.')[0]?.term).toBe('átomo');
  });
  it('builds key terms, mind map, flashcards and questions', () => {
    const pack = buildStudyPack(text);
    expect(pack.keyTerms.map((k) => k.term.toLowerCase())).toContain('photosynthesis');
    expect(pack.mindMap.branches.map((b) => b.title)).toEqual(['Photosynthesis', 'Respiration']);
    expect(pack.flashcards.length).toBeGreaterThanOrEqual(3);
    expect(pack.questions[0]!.answer).toBeTruthy();
  });
  it('copes with text without structure', () => {
    const pack = buildStudyPack('word '.repeat(30));
    expect(pack.flashcards).toEqual([]);
  });
});
