import { describe, expect, it } from 'vitest';
import { slug } from '../../src/core/slug';

describe('slug', () => {
  it('lowercases and joins words with dashes', () => {
    expect(slug('My Team 2')).toBe('my-team-2');
  });
  it('transliterates German umlauts and sharp s', () => {
    expect(slug('Größe Ärger Übung')).toBe('groesse-aerger-uebung');
  });
  it('strips accents and trims dashes', () => {
    expect(slug('  Café — Crème!  ')).toBe('cafe-creme');
  });
  it('falls back to caldence when nothing is left', () => {
    expect(slug('')).toBe('caldence');
    expect(slug('日本語 ???')).toBe('caldence');
  });
});

describe('slug edge cases', () => {
  it('handles a name made only of umlauts and symbols', () => {
    expect(slug('Ä')).toBe('ae');
    expect(slug('---')).toBe('caldence');
    expect(slug('   ')).toBe('caldence');
  });
  it('uses a combining-mark range written as escapes', () => {
    expect(slug('Zoë Müller')).toBe('zoe-mueller');
  });
});
