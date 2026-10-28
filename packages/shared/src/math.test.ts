import { describe, expect, it } from 'vitest';
import { hasMath, latexToText, mathToPlain, splitMath } from './math';

describe('math in text', () => {
  it('finds inline and display formulas but leaves prices alone', () => {
    expect(splitMath('Solve $x^2 = 4$ then $$\\frac{a}{b}$$ ok')).toEqual([
      { kind: 'text', value: 'Solve ' },
      { kind: 'math', value: 'x^2 = 4', display: false },
      { kind: 'text', value: ' then ' },
      { kind: 'math', value: '\\frac{a}{b}', display: true },
      { kind: 'text', value: ' ok' },
    ]);
    expect(hasMath('It costs $5 and $10 today')).toBe(false);
    expect(hasMath('Pay $5, or $ 10')).toBe(false);
    expect(splitMath('Price \\$5 and \\(a+b\\)')).toEqual([
      { kind: 'text', value: 'Price $5 and ' },
      { kind: 'math', value: 'a+b', display: false },
    ]);
    expect(hasMath('unclosed $x+1')).toBe(false);
  });

  it('turns formulas into readable text', () => {
    expect(latexToText('x^2 + y^{10}')).toBe('x² + y¹⁰');
    expect(latexToText('\\frac{1}{2}')).toBe('1/2');
    expect(latexToText('\\frac{a+b}{c}')).toBe('(a+b)/c');
    expect(latexToText('\\sqrt{x+1}')).toBe('√(x+1)');
    expect(latexToText('\\sqrt[3]{8}')).toBe('³√8');
    expect(latexToText('H_2O')).toBe('H₂O');
    expect(latexToText('\\alpha \\le \\pi \\times 2')).toBe('α ≤ π × 2');
    expect(latexToText('x^{y+z}')).toBe('x^(y+z)');
    expect(mathToPlain('Area = $\\pi r^2$')).toBe('Area = π r²');
  });
});
