import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { emptyWorkspace } from '../../src/core/model';
import { createAutosave, idbStore, type KV } from '../../src/ui/state/autosave';

const ws = emptyWorkspace('2027-01-04');

function memory(): KV & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (k) => data.get(k),
    set: async (k, v) => void data.set(k, v),
  };
}

describe('autosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces and restores ws, fileName and dirty', async () => {
    const kv = memory();
    const a = createAutosave(kv, 500);
    a.schedule({ ws, fileName: 'x.json', dirty: false });
    a.schedule({ ws, fileName: 'x.json', dirty: true });
    expect(kv.data.size).toBe(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(kv.data.has('current')).toBe(true);
    const restored = await createAutosave(kv).restore();
    expect(restored).toEqual({ ws, fileName: 'x.json', dirty: true });
  });

  it('restores null when nothing or garbage is stored', async () => {
    const kv = memory();
    expect(await createAutosave(kv).restore()).toBeNull();
    kv.data.set('current', { ws: { schemaVersion: 1 }, fileName: null, dirty: true });
    expect(await createAutosave(kv).restore()).toBeNull();
  });

  it('flush writes immediately', async () => {
    const kv = memory();
    const a = createAutosave(kv, 500);
    a.schedule({ ws, fileName: null, dirty: true });
    await a.flush();
    expect(kv.data.has('current')).toBe(true);
  });

  it('is unavailable when get rejects', async () => {
    const a = createAutosave({
      get: () => Promise.reject(new Error('no')),
      set: async () => {},
    });
    expect(a.available).toBe(true);
    expect(await a.restore()).toBeNull();
    expect(a.available).toBe(false);
    expect(get(a.status)).toBe(false);
  });

  it('is unavailable when set rejects', async () => {
    const a = createAutosave({
      get: async () => undefined,
      set: () => Promise.reject(new Error('quota')),
    });
    a.schedule({ ws, fileName: null, dirty: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(a.available).toBe(false);
  });

  it('idbStore rejects without IndexedDB', async () => {
    const store = idbStore();
    await expect(store.get('current')).rejects.toThrow();
    await expect(store.set('current', 1)).rejects.toThrow();
  });
});
