import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { loadRail, rail, setRail } from '../../src/ui/state/sidebar';

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
}

describe('sidebar rail', () => {
  it('is unfolded for nothing, junk or blocked storage', () => {
    expect(loadRail(memory())).toBe(false);
    expect(loadRail(memory({ 'caldence.sidebar': 'wide' }))).toBe(false);
    expect(
      loadRail({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe(false);
  });

  it('remembers the rail and forgets it when unfolded', () => {
    const store = memory();
    setRail(true, store);
    expect(get(rail)).toBe(true);
    expect(loadRail(store)).toBe(true);
    setRail(false, store);
    expect(get(rail)).toBe(false);
    expect(store.data).toEqual({});
  });

  it('still folds when storage is blocked', () => {
    const blocked = {
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    setRail(true, blocked);
    expect(get(rail)).toBe(true);
    setRail(false, blocked);
  });
});
