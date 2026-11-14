/**
 * Security headers of a deployment (security #42). The same values are written out in
 * public/.htaccess, public/web.config and deploy/nginx.conf; a unit test keeps them in step.
 *
 * The build loads nothing from other hosts and has no inline scripts or styles: Svelte sets dynamic
 * styles through the CSSOM (`element.style`), which style-src does not restrict. The one exception is
 * the <style> block of public/404.html (#151), allowed by its hash because that page is served at any
 * path depth and so cannot load a stylesheet by relative path. A unit test checks the hash.
 */
export const NOT_FOUND_STYLE_HASH = "'sha256-bqsP52oChAEYqhWNUPAmSI86lrPc69gQtmQXWlP+YO4='";

const DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  `style-src 'self' ${NOT_FOUND_STYLE_HASH}`,
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
];

/** For the `<meta>` tag, which browsers ignore frame-ancestors in. */
export const CSP_META = DIRECTIVES.join('; ');
export const CSP = `${CSP_META}; frame-ancestors 'none'`;

export const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy':
    'accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=()',
} as const;

/**
 * Adds the policy as a `<meta>` tag right after the charset, so it also applies on hosts that send
 * no headers. Only for the build: the dev server needs inline scripts and a websocket.
 */
export function injectCspMeta(html: string): string {
  return html.replace(
    /(<meta charset="[^"]*" \/>)/i,
    `$1\n    <meta http-equiv="Content-Security-Policy" content="${CSP_META}" />`,
  );
}
