// The operator's imprint and privacy page live next to the app on the webspace, never in the
// release. A link is shown only when the page is there.

export const LEGAL_PAGES = ['imprint', 'privacy'] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

// Marks the app's own index.html, which some servers send for any missing page.
const APP_MARKER = '<div id="app">';

/** True when `./<page>.html` exists and is not the app itself. Never throws. */
export async function hasLegalPage(
  page: LegalPage,
  base: string = document.baseURI,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  try {
    // Not in the precache, and no-store, so a removed page disappears on the next start.
    const res = await fetchFn(new URL(`${page}.html`, base), { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) return false;
    return !(await res.text()).includes(APP_MARKER);
  } catch {
    // Offline or blocked: no link.
    return false;
  }
}
