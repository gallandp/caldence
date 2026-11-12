import { describe, expect, it } from 'vitest';
import { initials, inkOn } from '../../src/ui/avatar';

describe('initials', () => {
  it('takes the first character of up to two words', () => {
    expect(initials('Team Alpha')).toBe('TA');
    expect(initials('  sam  ')).toBe('S');
    expect(initials('Ana Lu Kim')).toBe('AL');
    expect(initials('')).toBe('');
  });
  it('keeps characters outside the basic plane whole', () => {
    expect(initials('😀 Kim')).toBe('😀K');
    expect(initials('𠮷野 Taro')).toBe('𠮷T');
  });
});

describe('inkOn', () => {
  it('chooses the more readable text colour', () => {
    expect(inkOn('#000000')).toBe('#ffffff');
    expect(inkOn('#ffffff')).toBe('#0f1426');
  });
});
