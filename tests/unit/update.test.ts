import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { createUpdate } from '../../src/ui/state/update';

function setup(beforeReload: () => void = () => {}) {
  const calls: string[] = [];
  let handlers: { onNeedRefresh?: () => void; onOfflineReady?: () => void } = {};
  const updateSW = vi.fn(async () => {
    calls.push('updateSW');
  });
  const register = vi.fn((options?: typeof handlers) => {
    handlers = options ?? {};
    return updateSW;
  });
  const before = vi.fn(() => {
    calls.push('before');
    beforeReload();
  });
  const update = createUpdate(register, before);
  return { update, handlers, updateSW, calls, before };
}

describe('update service', () => {
  it('needRefresh is false until the worker reports an update', () => {
    const { update, handlers } = setup();
    expect(get(update.needRefresh)).toBe(false);
    expect(get(update.offlineReady)).toBe(false);
    handlers.onNeedRefresh!();
    expect(get(update.needRefresh)).toBe(true);
  });

  it('offlineReady turns true when the worker reports it', () => {
    const { update, handlers } = setup();
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
    const { update, handlers } = setup();
    handlers.onNeedRefresh!();
    handlers.onOfflineReady!();
    update.dismiss();
    expect(get(update.needRefresh)).toBe(false);
    expect(get(update.offlineReady)).toBe(false);
  });

  it('a throwing register leaves the flags false', async () => {
    const update = createUpdate(() => {
      throw new Error('no service worker');
    }, vi.fn());
    expect(get(update.needRefresh)).toBe(false);
    expect(get(update.offlineReady)).toBe(false);
    await expect(update.reload()).resolves.toBeUndefined();
  });
});
