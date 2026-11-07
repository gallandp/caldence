import { writable, type Readable } from 'svelte/store';
import type { Workspace } from '../../core/model';
import { validate } from '../../core/validate';

export interface KV {
  get(k: string): Promise<unknown>;
  set(k: string, v: unknown): Promise<void>;
}

export interface AutosaveState {
  ws: Workspace;
  fileName: string | null;
  dirty: boolean;
}

export const AUTOSAVE_KEY = 'current';

/** IndexedDB-backed key-value store. Every call rejects when IndexedDB is unavailable. */
export function idbStore(dbName = 'caldence', storeName = 'autosave'): KV {
  let db: Promise<IDBDatabase> | undefined;
  function open(): Promise<IDBDatabase> {
    db ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      try {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(storeName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB error'));
        req.onblocked = () => reject(new Error('IndexedDB blocked'));
      } catch (error) {
        reject(error);
      }
    });
    db.catch(() => (db = undefined));
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
  };
}

export function createAutosave(kv: KV, debounceMs = 500) {
  const status = writable(true);
  let available = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: AutosaveState | undefined;

  function fail() {
    available = false;
    status.set(false);
  }

  async function restore(): Promise<AutosaveState | null> {
    let stored: unknown;
    try {
      stored = await kv.get(AUTOSAVE_KEY);
    } catch {
      fail();
      return null;
    }
    if (typeof stored !== 'object' || stored === null) return null;
    const s = stored as Partial<AutosaveState>;
    const checked = validate(s.ws);
    if (!checked.ok) return null;
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
    pending = undefined;
    if (!state) return;
    try {
      await kv.set(AUTOSAVE_KEY, state);
    } catch {
      fail();
    }
  }

  function schedule(state: AutosaveState): void {
    pending = state;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), debounceMs);
  }

  return {
    restore,
    schedule,
    flush,
    get available() {
      return available;
    },
    status: status as Readable<boolean>,
  };
}

export const autosave = createAutosave(idbStore());
