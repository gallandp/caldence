import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CSP,
  CSP_META,
  injectCspMeta,
  NOT_FOUND_STYLE_HASH,
  SECURITY_HEADERS,
} from '../../security-headers';

const read = (p: string) => readFileSync(p, 'utf8');

describe('security headers (security #42)', () => {
  it('the policy loads nothing from other hosts and forbids framing', () => {
    expect(CSP).toContain("default-src 'none'");
    expect(CSP).toContain("script-src 'self'");
    expect(CSP).toContain("frame-ancestors 'none'");
    expect(CSP).not.toMatch(/https?:|\*|'unsafe-eval'/);
    expect(CSP).not.toContain("'unsafe-inline'");
  });

  it('the meta policy is the header policy without frame-ancestors', () => {
    expect(CSP_META).not.toContain('frame-ancestors');
    expect(`${CSP_META}; frame-ancestors 'none'`).toBe(CSP);
  });

  it.each(['public/.htaccess', 'public/web.config'])('%s sends every header', (file) => {
    const text = read(file);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(text, name).toContain(name);
      expect(text, name).toContain(value);
    }
  });

  it('nginx.conf sends every header in every location that serves the app', () => {
    const text = read('deploy/nginx.conf');
    // add_header in a location replaces the server's, so each app location repeats them.
    const blocks = [...text.matchAll(/location [^{]*caldence[^{]*\{([^}]*)\}/g)].map((m) => m[1]!);
    const serving = blocks.filter((b) => !b.includes('deny all'));
    expect(serving.length).toBeGreaterThanOrEqual(3);
    for (const b of serving)
      for (const [name, value] of Object.entries(SECURITY_HEADERS))
        expect(b, name).toContain(`add_header ${name} "${value}" always;`);
  });

  it('the build puts the meta policy first in the head of index.html', () => {
    const html = injectCspMeta(read('index.html'));
    const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP_META}" />`;
    expect(html).toContain(meta);
    expect(html.indexOf(meta)).toBeLessThan(html.indexOf('<script'));
    expect(html.indexOf(meta)).toBeGreaterThan(html.indexOf('<meta charset'));
  });

  it('allows exactly the styles of 404.html (#151)', () => {
    const blocks = [...read('public/404.html').matchAll(/<style>([^]*?)<\/style>/g)];
    expect(blocks).toHaveLength(1);
    const hash = createHash('sha256').update(blocks[0]![1]!).digest('base64');
    expect(NOT_FOUND_STYLE_HASH).toBe(`'sha256-${hash}'`);
    expect(CSP).toContain(`style-src 'self' ${NOT_FOUND_STYLE_HASH};`);
  });
});
