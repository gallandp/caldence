import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import {
  createUpdate,
  FLUSH_TIMEOUT_MS,
  UPDATE_CHECK_MS,
  type RegisterOptions,
  type UpdateEnv,
} from '../../src/ui/state/update';

function fakeEnv() {
  const timers: { ms: number; fn: () => void }[] = [];
  const visible: (() => void)[] = [];
  const state = { online: true };
  const reloadPage = vi.fn();
  const env: UpdateEnv = {
    every: (ms, fn) => void timers.push({ ms, fn }),
    onVisible: (fn) => void visible.push(fn),
    online: () => state.online,
    reloadPage,
  };
  return { env, timers, visible, state, reloadPage };
}

function setup(beforeReload: () => void | Promise<void> = () => {}) {
  const calls: string[] = [];
  let handlers: RegisterOptions = {};
  const updateSW = vi.fn(async () => {
    calls.push('updateSW');
  });
  const register = vi.fn((options?: typeof handlers) => {
    handlers = options ?? {};
    return updateSW;
  });
  const before = vi.fn(() => {
    calls.push('before');
    return beforeReload();
  });
  const fake = fakeEnv();
  const update = createUpdate(register, before, fake.env);
  return { update, handlers: () => handlers, updateSW, calls, before, register, ...fake };
}

function fakeRegistration() {
  const update = vi.fn(async () => {});
  return { registration: { update } as unknown as ServiceWorkerRegistration, update };
}

describe('update service', () => {
  it('needRefresh is false until the worker reports an update', () => {
    const { update, handlers: h } = setup();
    const handlers = h();
    expect(get(update.needRefresh)).toBe(false);
    expect(get(update.offlineReady)).toBe(false);
    handlers.onNeedRefresh!();
    expect(get(update.needRefresh)).toBe(true);
  });

  it('offlineReady turns true when the worker reports it', () => {
    const { update, handlers: h } = setup();
    const handlers = h();
    handlers.onOfflineReady!();
    expect(get(update.offlineReady)).toBe(true);
  });

  it('reload runs beforeReload before updateSW(true)', async () => {
    const { update, updateSW, calls } = setup();
    await update.reload();
    expect(calls).toEqual(['before', 'updateSW']);
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('reload still updates when beforeReload throws', async () => {
    const { update, updateSW } = setup(() => {
      throw new Error('boom');
    });
    await update.reload();
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('dismiss clears both flags', () => {
    const { update, handlers: h } = setup();
    const handlers = h();
    handlers.onNeedRefresh!();
    handlers.onOfflineReady!();
    update.dismiss();
    expect(get(update.needRefresh)).toBe(false);
    expect(get(update.offlineReady)).toBe(false);
  });

  it('a throwing register leaves the flags false', async () => {
    const update = createUpdate(
      () => {
        throw new Error('no service worker');
      },
      vi.fn(),
      fakeEnv().env,
    );
    expect(get(update.needRefresh)).toBe(false);
    expect(get(update.offlineReady)).toBe(false);
    await expect(update.reload()).resolves.toBeUndefined();
  });

  it('reload awaits an async beforeReload before updateSW(true)', async () => {
    const s = setup(async () => {
      await new Promise((r) => setTimeout(r, 5));
      s.calls.push('saved');
    });
    await s.update.reload();
    expect(s.calls).toEqual(['before', 'saved', 'updateSW']);
  });

  it('reload waits for the save to finish first', async () => {
    let finish!: () => void;
    const s = setup(() => new Promise<void>((r) => (finish = r)));
    const done = s.update.reload();
    await Promise.resolve();
    await Promise.resolve();
    expect(s.updateSW).not.toHaveBeenCalled();
    finish();
    await done;
    expect(s.calls).toEqual(['before', 'updateSW']);
  });

  it('reload still updates when beforeReload rejects', async () => {
    const { update, updateSW } = setup(() => Promise.reject(new Error('boom')));
    await update.reload();
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('reload still updates when the save hangs', async () => {
    vi.useFakeTimers();
    try {
      const { update, updateSW } = setup(() => new Promise<void>(() => {}));
      const done = update.reload();
      await vi.advanceTimersByTimeAsync(FLUSH_TIMEOUT_MS);
      await done;
      expect(updateSW).toHaveBeenCalledWith(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a reload caused by another tab saves first, then reloads the page', async () => {
    let finish!: () => void;
    const s = setup(() => new Promise<void>((r) => (finish = r)));
    s.handlers().onNeedReload!();
    await Promise.resolve();
    expect(s.before).toHaveBeenCalledOnce();
    expect(s.reloadPage).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(s.reloadPage).toHaveBeenCalledOnce());
  });

  it('checks for a new version every hour and when the page becomes visible', () => {
    const s = setup();
    const { registration, update } = fakeRegistration();
    s.handlers().onRegisteredSW!('sw.js', registration);
    expect(s.timers.map((t) => t.ms)).toEqual([UPDATE_CHECK_MS]);
    expect(UPDATE_CHECK_MS).toBe(60 * 60 * 1000);
    s.timers[0]!.fn();
    expect(update).toHaveBeenCalledTimes(1);
    s.visible[0]!();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('skips the check while offline', () => {
    const s = setup();
    const { registration, update } = fakeRegistration();
    s.handlers().onRegisteredSW!('sw.js', registration);
    s.state.online = false;
    s.timers[0]!.fn();
    s.visible[0]!();
    expect(update).not.toHaveBeenCalled();
    s.state.online = true;
    s.visible[0]!();
    expect(update).toHaveBeenCalledOnce();
  });

  it('a failing check is ignored', async () => {
    const s = setup();
    const update = vi.fn(() => Promise.reject(new Error('offline')));
    s.handlers().onRegisteredSW!('sw.js', { update } as unknown as ServiceWorkerRegistration);
    expect(() => s.timers[0]!.fn()).not.toThrow();
    await Promise.resolve();
    expect(update).toHaveBeenCalledOnce();
  });

  it('no registration means no checks', () => {
    const s = setup();
    s.handlers().onRegisteredSW!('sw.js', undefined);
    expect(s.timers).toEqual([]);
    expect(s.visible).toEqual([]);
  });
});
