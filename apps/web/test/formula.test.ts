import { describe, expect, it } from 'vitest';
import { colIndex, colName, createEvaluator, formatValue } from '../src/pages/workspace/formula';

const calc = (cells: Record<string, string>, ref: string) => formatValue(createEvaluator(cells).get(ref));

describe('spreadsheet formulas', () => {
  it('converts column names both ways', () => {
    expect([0, 25, 26, 27, 701, 702].map(colName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
    expect(['A', 'Z', 'AA', 'ZZ', 'AAA'].map(colIndex)).toEqual([0, 25, 26, 701, 702]);
  });
  it('evaluates arithmetic with precedence and references', () => {
    const cells = { A1: '2', A2: '3', B1: '=A1+A2*4', B2: '=(A1+A2)*4', B3: '=2^3^2', B4: '=-A1+10%' };
    expect(calc(cells, 'B1')).toBe('14');
    expect(calc(cells, 'B2')).toBe('20');
    expect(calc(cells, 'B3')).toBe('512');
    expect(calc(cells, 'B4')).toBe('-1.9');
  });
  it('supports ranges and functions', () => {
    const cells = {
      A1: '1',
      A2: '2',
      A3: '3',
      A4: 'text',
      B1: '=SUM(A1:A4)',
      B2: '=AVERAGE(A1:A3)',
      B3: '=MAX(A1:A3,10)',
      B4: '=COUNT(A1:A4)',
      B5: '=ROUND(A1/3,2)',
      B6: '=IF(A1<A2,"yes","no")',
    };
    expect(['B1', 'B2', 'B3', 'B4', 'B5', 'B6'].map((r) => calc(cells, r))).toEqual(['6', '2', '10', '3', '0.33', 'yes']);
  });
  it('reports errors instead of throwing', () => {
    const cells = { A1: '=1/0', A2: '=B1', B1: '=A2', A3: '=NOPE(1)', A4: '=1+', A5: '=A1+1', A6: '="x"+1' };
    expect(calc(cells, 'A1')).toBe('#DIV/0!');
    expect(calc(cells, 'A2')).toBe('#CYCLE!');
    expect(calc(cells, 'A3')).toBe('#NAME?');
    expect(calc(cells, 'A4')).toBe('#PARSE!');
    expect(calc(cells, 'A5')).toBe('#DIV/0!');
    expect(calc(cells, 'A6')).toBe('#VALUE!');
  });
  it('never executes code from cells', () => {
    const cells = { A1: '=constructor.constructor("return 1")()', A2: '=alert(1)', A3: '=window' };
    expect(calc(cells, 'A1')).toMatch(/^#/);
    expect(calc(cells, 'A2')).toMatch(/^#/);
    expect(calc(cells, 'A3')).toMatch(/^#/);
  });
  it('guards huge ranges', () => {
    expect(calc({ A1: '=SUM(A1:ZZ99999)' }, 'B1')).toBe('');
    expect(calc({ B1: '=SUM(A1:ZZ99999)' }, 'B1')).toBe('#REF!');
  });
});
