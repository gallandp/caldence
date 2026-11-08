// Stand-in for the virtual module of vite-plugin-pwa in unit tests: no service worker.
export function registerSW(): () => Promise<void> {
  return async () => {};
}
