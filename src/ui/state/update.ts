import { readonly, writable, type Readable } from 'svelte/store';
import { registerSW } from 'virtual:pwa-register';
import { autosave } from './autosave';

export interface RegisterOptions {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  /** Called when a new worker took control, also when another tab chose to reload. */
  onNeedReload?: () => void;
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
}

export type RegisterFn = (options?: RegisterOptions) => (reloadPage?: boolean) => Promise<void>;

/** The browser parts the update service uses, injectable for tests. */
export interface UpdateEnv {
  /** Runs `fn` every `ms` milliseconds. */
  every(ms: number, fn: () => void): void;
  /** Runs `fn` once after `ms` milliseconds. */
  later(ms: number, fn: () => void): void;
  /** Runs `fn` whenever the page becomes visible again. */
  onVisible(fn: () => void): void;
  online(): boolean;
  reloadPage(): void;
}

export interface UpdateService {
  needRefresh: Readable<boolean>;
  offlineReady: Readable<boolean>;
  reload(): Promise<void>;
  dismiss(): void;
}

/** How often an open tab asks the server for a new version. */
export const UPDATE_CHECK_MS = 60 * 60 * 1000;
/** A save that does not finish in this time must not block the reload. */
export const FLUSH_TIMEOUT_MS = 3000;
/**
 * How long reload() waits for the new worker to take control before reloading itself.
 * An uncontrolled page (after a hard reload) or a worker that is no longer waiting never does.
 */
export const RELOAD_FALLBACK_MS = 1500;

export const browserUpdateEnv: UpdateEnv = {
  every: (ms, fn) => void setInterval(fn, ms),
  later: (ms, fn) => void setTimeout(fn, ms),
  onVisible: (fn) =>
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fn();
    }),
  online: () => navigator.onLine !== false,
  reloadPage: () => window.location.reload(),
};

/** Wraps the service worker registration. A new version is applied only on reload(). */
export function createUpdate(
  register: RegisterFn,
  beforeReload: () => void | Promise<void>,
  env: UpdateEnv = browserUpdateEnv,
): UpdateService {
  const needRefresh = writable(false);
  const offlineReady = writable(false);
  let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;
  let reloading = false;

  function reloadOnce() {
    if (reloading) return;
    reloading = true;
    env.reloadPage();
  }

  /** Saves first; a failing or hanging save must not block the update (autosave holds earlier state). */
  async function save(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(beforeReload),
        new Promise<void>((resolve) => (timer = setTimeout(resolve, FLUSH_TIMEOUT_MS))),
      ]);
    } catch {
      // ignore: see above
    } finally {
      clearTimeout(timer);
    }
  }

  function watch(registration: ServiceWorkerRegistration | undefined) {
    if (!registration) return;
    const check = () => {
      if (!env.online()) return;
      registration.update().catch(() => {
        // Server not reachable: try again next time.
      });
    };
    env.every(UPDATE_CHECK_MS, check);
    env.onVisible(check);
  }

  try {
    updateSW = register({
      onNeedRefresh: () => needRefresh.set(true),
      onOfflineReady: () => offlineReady.set(true),
      onNeedReload: () => {
        void save().then(reloadOnce);
      },
      onRegisteredSW: (_url, registration) => watch(registration),
    });
  } catch {
    // No service worker support: the app works as before.
  }
  return {
    needRefresh: readonly(needRefresh),
    offlineReady: readonly(offlineReady),
    async reload() {
      await save();
      try {
        await updateSW?.(true);
      } catch {
        // The reload below still brings the new version.
      }
      env.later(RELOAD_FALLBACK_MS, reloadOnce);
    },
    dismiss() {
      needRefresh.set(false);
      offlineReady.set(false);
    },
  };
}

export const update = createUpdate(registerSW, () => autosave.flush());
