import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { language, loadLanguage, setLanguage } from '../../src/ui/state/language';

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
  };
}

describe('language', () => {
  it('follows the file for nothing, junk or blocked storage', () => {
    expect(loadLanguage(memory())).toBeUndefined();
    expect(loadLanguage(memory({ 'caldence.locale': 'fr' }))).toBeUndefined();
    expect(
      loadLanguage({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBeUndefined();
  });

  it('loads a saved choice', () => {
    expect(loadLanguage(memory({ 'caldence.locale': 'de' }))).toBe('de');
  });

  it('remembers the choice per browser', () => {
    const storage = memory();
    setLanguage('en', storage);
    expect(storage.data['caldence.locale']).toBe('en');
    expect(get(language)).toBe('en');
  });

  it('still switches when storage is blocked', () => {
    setLanguage('de', {
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(get(language)).toBe('de');
  });
});
