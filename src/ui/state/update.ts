import { readonly, writable, type Readable } from 'svelte/store';
import { registerSW } from 'virtual:pwa-register';
import { autosave } from './autosave';

export type RegisterFn = (options?: {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
}) => (reloadPage?: boolean) => Promise<void>;

export interface UpdateService {
  needRefresh: Readable<boolean>;
  offlineReady: Readable<boolean>;
  reload(): Promise<void>;
  dismiss(): void;
}

/** Wraps the service worker registration. A new version is applied only on reload(). */
export function createUpdate(register: RegisterFn, beforeReload: () => void): UpdateService {
  const needRefresh = writable(false);
  const offlineReady = writable(false);
  let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;
  try {
    updateSW = register({
      onNeedRefresh: () => needRefresh.set(true),
      onOfflineReady: () => offlineReady.set(true),
    });
  } catch {
    // No service worker support: the app works as before.
  }
  return {
    needRefresh: readonly(needRefresh),
    offlineReady: readonly(offlineReady),
    async reload() {
      try {
        beforeReload();
      } catch {
        // A failing flush must not block the update; autosave already holds earlier state.
      }
      await updateSW?.(true);
    },
    dismiss() {
      needRefresh.set(false);
      offlineReady.set(false);
    },
  };
}

export const update = createUpdate(registerSW, () => autosave.flushNow());
