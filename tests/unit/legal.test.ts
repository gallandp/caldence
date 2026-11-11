import { describe, expect, it } from 'vitest';
import { hasLegalPage } from '../../src/ui/state/legal';

const base = 'https://example.com/apps/caldence/';

function fake(status: number, type: string, body = '<h1>Impressum</h1>') {
  const calls: string[] = [];
  const fn = (async (url: URL) => {
    calls.push(url.toString());
    return new Response(body, { status, headers: { 'content-type': type } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('hasLegalPage', () => {
  it('finds a page next to the app', async () => {
    const { fn, calls } = fake(200, 'text/html; charset=utf-8');
    expect(await hasLegalPage('imprint', base, fn)).toBe(true);
    expect(calls).toEqual(['https://example.com/apps/caldence/imprint.html']);
  });

  it('ignores a missing page', async () => {
    expect(await hasLegalPage('privacy', base, fake(404, 'text/html').fn)).toBe(false);
  });

  it('ignores a server that answers with the app itself', async () => {
    const app = '<!doctype html><body><div id="app"></div></body>';
    expect(await hasLegalPage('imprint', base, fake(200, 'text/html', app).fn)).toBe(false);
  });

  it('ignores other content types', async () => {
    expect(await hasLegalPage('imprint', base, fake(200, 'text/plain').fn)).toBe(false);
  });

  it('is false when offline', async () => {
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await hasLegalPage('imprint', base, offline)).toBe(false);
  });
});
