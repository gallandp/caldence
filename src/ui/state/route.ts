/**
 * The address of a place in the app (#401): `#/<view>[/<unit>[/<page>]]`. The route lives in the
 * hash because the app is static files on plain web hosting: a path like `/v2/team` would need a
 * server rewrite, the hash never reaches the server. Only ids go into it, never names.
 */
export interface Route {
  view: string;
  unit?: string;
  page?: string;
}

const seg = (s: string) => encodeURIComponent(s).replace(/%40/g, '@').replace(/%3A/gi, ':');

export function formatRoute(route: Route): string {
  const parts = [route.view];
  if (route.unit) parts.push(route.unit);
  if (route.unit && route.page) parts.push(route.page);
  return '#/' + parts.map(seg).join('/');
}

/** The route in `hash`, or undefined when it names no known view. Unit and page are not checked. */
export function parseRoute(hash: string, views: readonly string[]): Route | undefined {
  if (!hash.startsWith('#/')) return undefined;
  let parts: string[];
  try {
    parts = hash.slice(2).split('/').map(decodeURIComponent);
  } catch {
    return undefined;
  }
  const [view, unit, page] = parts;
  if (!view || !views.includes(view)) return undefined;
  return { view, unit: unit || undefined, page: page || undefined };
}
