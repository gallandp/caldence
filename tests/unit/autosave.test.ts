import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { emptyWorkspace } from '../../src/core/model';
import { migrate } from '../../src/core/migrate';
import { createAutosave, idbStore, restoreWithTimeout, type KV } from '../../src/ui/state/autosave';

vi.mock('../../src/core/migrate', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/core/migrate')>();
  return { ...original, migrate: vi.fn(original.migrate) };
});

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

  it('an immediate schedule writes without advancing timers', () => {
    const kv = memory();
    createAutosave(kv, 500).schedule({ ws, fileName: 'x.json', dirty: false }, { immediate: true });
    expect(kv.data.has('current')).toBe(true);
  });

  it('flushNow starts the write synchronously with setNow, else falls back to set', async () => {
    const kv = memory();
    const now: [string, unknown][] = [];
    const a = createAutosave({ ...kv, setNow: (k, v) => void now.push([k, v]) }, 500);
    a.schedule({ ws, fileName: null, dirty: true });
    a.flushNow();
    expect(now).toHaveLength(1);
    expect(now[0]![0]).toBe('current');
    expect(kv.data.size).toBe(0);
    const b = createAutosave(
      {
        ...kv,
        setNow: () => {
          throw new Error('not open');
        },
      },
      500,
    );
    b.schedule({ ws, fileName: null, dirty: true });
    b.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(kv.data.has('current')).toBe(true);
  });

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

  it('migrates a stored workspace before validating it', async () => {
    const kv = memory();
    kv.data.set('current', {
      ws: { ...ws, schemaVersion: 0 },
      fileName: 'old.json',
      dirty: true,
    });
    vi.mocked(migrate).mockReturnValueOnce({ ok: true, value: ws });
    expect(await createAutosave(kv).restore()).toEqual({ ws, fileName: 'old.json', dirty: true });
    expect(migrate).toHaveBeenCalled();
    expect(kv.data.has('current.bak')).toBe(false);
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

  it('copies unreadable stored data to current.bak before overwriting it', async () => {
    const kv = memory();
    const newer = { ws: { ...ws, schemaVersion: 99 }, fileName: null, dirty: true };
    kv.data.set('current', newer);
    const a = createAutosave(kv, 500);
    expect(await a.restore()).toBeNull();
    expect(kv.data.get('current.bak')).toBe(newer);
    a.schedule({ ws, fileName: null, dirty: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(kv.data.get('current.bak')).toBe(newer);
    expect(kv.data.get('current')).not.toBe(newer);
  });

  it('never writes after the stored data could not be read', async () => {
    const set = vi.fn(async () => {});
    const a = createAutosave({ get: () => Promise.reject(new Error('no')), set });
    await a.restore();
    a.schedule({ ws, fileName: null, dirty: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(set).not.toHaveBeenCalled();
  });

  it('retries after a failed write and becomes available again on success', async () => {
    let fail = true;
    const a = createAutosave({
      get: async () => undefined,
      set: async () => {
        if (fail) throw new Error('quota');
      },
    });
    a.schedule({ ws, fileName: null, dirty: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(get(a.status)).toBe(false);
    fail = false;
    a.schedule({ ws, fileName: null, dirty: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(get(a.status)).toBe(true);
    expect(a.available).toBe(true);
  });

  it('disable stops writes and reports unavailable', async () => {
    const set = vi.fn(async () => {});
    const a = createAutosave({ get: async () => undefined, set });
    a.disable();
    a.schedule({ ws, fileName: null, dirty: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(set).not.toHaveBeenCalled();
    expect(get(a.status)).toBe(false);
  });

  it('idbStore rejects without IndexedDB', async () => {
    const store = idbStore();
    await expect(store.get('current')).rejects.toThrow();
    await expect(store.set('current', 1)).rejects.toThrow();
  });
});

describe('restoreWithTimeout', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps autosave enabled after a fast restore, even once the timeout has passed', async () => {
    vi.useFakeTimers();
    const service = { restore: vi.fn(async () => null), disable: vi.fn() };
    await expect(restoreWithTimeout(service, 3000)).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(service.disable).not.toHaveBeenCalled();
  });

  it('disables autosave when restore hangs', async () => {
    vi.useFakeTimers();
    const service = { restore: vi.fn(() => new Promise<never>(() => {})), disable: vi.fn() };
    const pending = restoreWithTimeout(service, 3000);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(pending).resolves.toBeNull();
    expect(service.disable).toHaveBeenCalledTimes(1);
  });

  it('disables autosave when restore throws', async () => {
    const service = {
      restore: vi.fn(async () => Promise.reject(new Error('x'))),
      disable: vi.fn(),
    };
    await expect(restoreWithTimeout(service, 3000)).resolves.toBeNull();
    expect(service.disable).toHaveBeenCalledTimes(1);
  });
});
