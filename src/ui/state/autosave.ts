import { writable, type Readable } from 'svelte/store';
import type { Workspace } from '../../core/model';
import { migrate } from '../../core/migrate';
import { validate } from '../../core/validate';

export interface KV {
  get(k: string): Promise<unknown>;
  set(k: string, v: unknown): Promise<void>;
  /** Starts the write synchronously (for page hide); throws when the store is not ready yet. */
  setNow?(k: string, v: unknown): void;
}

export interface AutosaveState {
  ws: Workspace;
  fileName: string | null;
  dirty: boolean;
}

export const AUTOSAVE_KEY = 'current';
export const BACKUP_KEY = 'current.bak';

/** IndexedDB-backed key-value store. Every call rejects when IndexedDB is unavailable. */
export function idbStore(dbName = 'caldence', storeName = 'autosave'): KV {
  let db: Promise<IDBDatabase> | undefined;
  let opened: IDBDatabase | undefined;
  function open(): Promise<IDBDatabase> {
    db ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      try {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(storeName);
        req.onsuccess = () => {
          opened = req.result;
          resolve(req.result);
        };
        req.onerror = () => reject(req.error ?? new Error('IndexedDB error'));
        req.onblocked = () => reject(new Error('IndexedDB blocked'));
      } catch (error) {
        reject(error);
      }
    });
    db.catch(() => {
      db = undefined;
      opened = undefined;
    });
    return db;
  }
  async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
    const database = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = database.transaction(storeName, mode);
      const req = fn(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB error'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB aborted'));
    });
  }
  return {
    get: (k) => run('readonly', (s) => s.get(k)),
    set: async (k, v) => {
      await run('readwrite', (s) => s.put(v, k));
    },
    setNow: (k, v) => {
      if (!opened) throw new Error('IndexedDB not open');
      opened.transaction(storeName, 'readwrite').objectStore(storeName).put(v, k);
    },
  };
}

export function createAutosave(kv: KV, debounceMs = 500) {
  const status = writable(true);
  let available = true;
  // Set when the stored data could not be read: writing then could destroy it.
  let blocked = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: AutosaveState | undefined;

  function fail() {
    available = false;
    status.set(false);
  }

  /** Turns autosave off for good (e.g. restore timed out). */
  function disable() {
    blocked = true;
    clearTimeout(timer);
    pending = undefined;
    fail();
  }

  async function restore(): Promise<AutosaveState | null> {
    let stored: unknown;
    try {
      stored = await kv.get(AUTOSAVE_KEY);
    } catch {
      disable();
      return null;
    }
    if (stored === undefined || stored === null) return null;
    const s = stored as Partial<AutosaveState>;
    const migrated = typeof stored === 'object' ? migrate(s.ws) : undefined;
    const checked = migrated?.ok ? validate(migrated.value) : undefined;
    if (!checked?.ok) {
      // Keep what we could not load before the next write replaces it (best effort).
      try {
        await kv.set(BACKUP_KEY, stored);
      } catch {
        /* ignore */
      }
      return null;
    }
    return {
      ws: checked.value,
      fileName: typeof s.fileName === 'string' ? s.fileName : null,
      dirty: s.dirty === true,
    };
  }

  async function flush(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    const state = pending;
    if (!state) return;
    try {
      await kv.set(AUTOSAVE_KEY, state);
      // Kept pending until stored, so a page hide during the write can still repeat it.
      if (pending === state) pending = undefined;
      if (!available) {
        available = true;
        status.set(true);
      }
    } catch {
      fail();
    }
  }

  function schedule(state: AutosaveState, opts?: { immediate?: boolean }): void {
    if (blocked) return;
    pending = state;
    clearTimeout(timer);
    if (opts?.immediate) void flush();
    else timer = setTimeout(() => void flush(), debounceMs);
  }

  /** For page hide: starts the write without awaiting anything first. */
  function flushNow(): void {
    clearTimeout(timer);
    timer = undefined;
    const state = pending;
    if (!state) return;
    if (kv.setNow) {
      try {
        kv.setNow(AUTOSAVE_KEY, state);
        pending = undefined;
        return;
      } catch {
        /* store not open: fall back to the async write */
      }
    }
    void flush();
  }

  return {
    restore,
    schedule,
    flush,
    flushNow,
    disable,
    get available() {
      return available;
    },
    status: status as Readable<boolean>,
  };
}

export const autosave = createAutosave(idbStore());

/**
 * Restore, but give up after `ms` so the app never hangs on "Loading…".
 * Only a lost race (or an exception) disables autosave; the timer is always cleared.
 */
export async function restoreWithTimeout(
  service: Pick<ReturnType<typeof createAutosave>, 'restore' | 'disable'>,
  ms = 3000,
): Promise<AutosaveState | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  try {
    const result = await Promise.race([service.restore(), timeout]);
    if (result === 'timeout') {
      service.disable();
      return null;
    }
    return result;
  } catch {
    service.disable();
    return null;
  } finally {
    clearTimeout(timer);
  }
}
