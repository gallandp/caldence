import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { applyTheme, loadTheme, setTheme, theme } from '../../src/ui/state/theme';

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
}

describe('theme', () => {
  it('defaults to system for nothing, junk or blocked storage', () => {
    expect(loadTheme(memory())).toBe('system');
    expect(loadTheme(memory({ 'caldence.theme': 'blue' }))).toBe('system');
    expect(
      loadTheme({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe('system');
    expect(loadTheme()).toBe('system');
  });

  it('loads a saved choice', () => {
    expect(loadTheme(memory({ 'caldence.theme': 'dark' }))).toBe('dark');
  });

  it('sets data-theme only for an explicit choice', () => {
    const root = { dataset: {} as DOMStringMap } as HTMLElement;
    applyTheme('light', root);
    expect(root.dataset.theme).toBe('light');
    applyTheme('system', root);
    expect(root.dataset.theme).toBeUndefined();
  });

  it('remembers light and dark, and forgets on system', () => {
    const store = memory();
    const root = { dataset: {} as DOMStringMap } as HTMLElement;
    setTheme('dark', store, root);
    expect(store.data['caldence.theme']).toBe('dark');
    expect(get(theme)).toBe('dark');
    expect(root.dataset.theme).toBe('dark');
    setTheme('system', store, root);
    expect(store.data['caldence.theme']).toBeUndefined();
    expect(root.dataset.theme).toBeUndefined();
  });

  it('still switches when storage throws', () => {
    const broken = {
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => setTheme('light', broken, { dataset: {} } as HTMLElement)).not.toThrow();
    expect(get(theme)).toBe('light');
  });
});
