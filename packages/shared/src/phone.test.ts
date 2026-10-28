import { describe, expect, it } from 'vitest';
import { normalizePhone } from './schemas/users';

describe('phone numbers', () => {
  it('normalizes local and international forms', () => {
    expect(normalizePhone('010 0123 4567')).toBe('+201001234567');
    expect(normalizePhone('+20 100-123-4567')).toBe('+201001234567');
    expect(normalizePhone('00966501234567')).toBe('+966501234567');
    expect(normalizePhone('201001234567')).toBe('+201001234567');
    expect(normalizePhone('12')).toBeNull();
    expect(normalizePhone('hello')).toBeNull();
  });
});
