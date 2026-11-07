import { describe, expect, it } from 'vitest';
import { contrastOk, contrastRatio } from '../../src/core/colour';

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });
  it('is 1 for identical colours and symmetric', () => {
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
    expect(contrastRatio('#2563eb', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#2563eb'),
      10,
    );
  });
  it('accepts #rgb and any case', () => {
    expect(contrastRatio('#FFF', '#000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#AbC', '#aabbcc')).toBeCloseTo(1, 5);
  });
  it('throws on invalid input', () => {
    for (const bad of ['', 'red', '#12', '#12345', '#ggg', '123456', '#1234567'])
      expect(() => contrastRatio(bad, '#fff'), bad).toThrow();
  });
});

describe('contrastOk', () => {
  it('rejects yellow on white', () => {
    expect(contrastOk('#ffff00')).toBe(false);
  });
  it('accepts blue on white', () => {
    expect(contrastOk('#2563eb')).toBe(true);
  });
  it('uses a custom background', () => {
    expect(contrastOk('#ffff00', '#000000')).toBe(true);
  });
});
