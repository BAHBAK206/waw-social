import { expect, it } from 'vitest';
import { contrast } from '../src';
it('contrast math is correct', () => {
  expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 0);
  expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 1);
});
