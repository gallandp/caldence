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
 * The longest reload() waits for the new worker to activate before reloading the page itself.
 * Reloading before it activates would load the old version again.
 */
export const RELOAD_FALLBACK_MS = 5000;

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
  let registration: ServiceWorkerRegistration | undefined;
  let reloading = false;
  /** Set once the user chose Reload and the save is done. */
  let saved = false;

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

  /** Resolves once `sw` is activated or replaced, or after RELOAD_FALLBACK_MS. */
  function activated(sw: ServiceWorker | null | undefined): Promise<void> {
    if (!sw) return Promise.resolve();
    return new Promise((resolve) => {
      sw.addEventListener('statechange', () => {
        if (sw.state === 'activated' || sw.state === 'redundant') resolve();
      });
      env.later(RELOAD_FALLBACK_MS, resolve);
    });
  }

  function watch(reg: ServiceWorkerRegistration | undefined) {
    registration = reg;
    if (!reg) return;
    const check = () => {
      if (!env.online()) return;
      reg.update().catch(() => {
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
        if (saved) reloadOnce();
        else void save().then(reloadOnce);
      },
      onRegisteredSW: (_url, registration) => watch(registration),
    });
  } catch {
    // No service worker support: the app works as before.
  }
  return {
    needRefresh: readonly(needRefresh),
    offlineReady: readonly(offlineReady),
    /**
     * Saves, activates the new worker and reloads. The page reloads itself instead of relying
     * on controllerchange: an uncontrolled page (after a hard reload) never gets one (#181).
     */
    async reload() {
      await save();
      saved = true;
      const waiting = registration?.waiting;
      try {
        await updateSW?.(true);
      } catch {
        // The reload below still brings the new version once the worker activates.
      }
      await activated(waiting);
      reloadOnce();
    },
    dismiss() {
      needRefresh.set(false);
      offlineReady.set(false);
    },
  };
}

export const update = createUpdate(registerSW, () => autosave.flush());
