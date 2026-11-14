import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MARKER,
  addErrorDocument,
  addHeadTags,
  apply,
  checkBase,
  headTags,
  robots,
  setHomeLink,
  sitemap,
} from '../../scripts/site-meta.mjs';

const BASE = 'https://caldence.de/';
const pub = (name: string) => new URL(`../../public/${name}`, import.meta.url);
const html = '<html><head><title>Caldence</title>\n  </head><body></body></html>';

describe('site metadata (#136)', () => {
  it('accepts only https base URLs ending in a slash', () => {
    expect(checkBase(BASE)).toBe(BASE);
    expect(checkBase('https://example.org/apps/caldence/')).toBeTruthy();
    for (const bad of [
      'http://caldence.de/',
      'https://caldence.de',
      'https://caldence.de/"><script>',
      'https://caldence.de/a b/',
    ])
      expect(() => checkBase(bad), bad).toThrow();
  });

  it('adds canonical, Open Graph image and JSON-LD before </head>', () => {
    const out = addHeadTags(html, BASE);
    expect(out).toContain('<link rel="canonical" href="https://caldence.de/" />');
    expect(out).toContain('content="https://caldence.de/social-preview.png"');
    expect(out.indexOf(MARKER)).toBeLessThan(out.indexOf('</head>'));
    const json = /<script type="application\/ld\+json">(.*)<\/script>/.exec(out)![1];
    const data = JSON.parse(json!);
    expect(data['@type']).toBe('SoftwareApplication');
    expect(data.url).toBe(BASE);
    expect(data.offers.price).toBe('0');
  });

  it('refuses to add the tags twice', () => {
    expect(() => addHeadTags(addHeadTags(html, BASE), BASE)).toThrow();
  });

  it('keeps "<" out of the JSON-LD block', () => {
    expect(headTags(BASE)).not.toMatch(/ld\+json">[^]*<(?!\/script>)/);
  });

  it('the release index.html names no domain of its own', () => {
    const index = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(index).not.toContain('caldence.de');
    expect(index).not.toContain('rel="canonical"');
    expect(index).toContain('name="description"');
  });
});

describe('robots.txt and sitemap.xml (#137)', () => {
  it('lists the start page in the sitemap', () => {
    expect(sitemap(BASE, '2026-11-14')).toContain(
      '<url><loc>https://caldence.de/</loc><lastmod>2026-11-14</lastmod></url>',
    );
  });

  it('writes robots.txt only for a site at the root of its host', () => {
    expect(robots(BASE)).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://caldence.de/sitemap.xml\n',
    );
    expect(robots('https://example.org/apps/caldence/')).toBeNull();
  });

  it('writes the files into the site folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'site-meta-'));
    writeFileSync(join(dir, 'index.html'), html);
    writeFileSync(join(dir, '.htaccess'), readFileSync(pub('.htaccess'), 'utf8'));
    writeFileSync(join(dir, '404.html'), readFileSync(pub('404.html'), 'utf8'));
    apply(dir, BASE, '2026-11-14');
    expect(readFileSync(join(dir, '.htaccess'), 'utf8')).toContain('ErrorDocument 404 /404.html');
    expect(readFileSync(join(dir, 'index.html'), 'utf8')).toContain(MARKER);
    expect(existsSync(join(dir, 'robots.txt'))).toBe(true);
    expect(readFileSync(join(dir, 'sitemap.xml'), 'utf8')).toContain('2026-11-14');
  });

  it('the release ships llms.txt and favicon.ico but no robots.txt or sitemap.xml', () => {
    expect(existsSync(pub('llms.txt'))).toBe(true);
    expect(readFileSync(pub('llms.txt'), 'utf8')).not.toContain('caldence.de');
    expect(existsSync(pub('favicon.ico'))).toBe(true);
    expect(existsSync(pub('robots.txt'))).toBe(false);
    expect(existsSync(pub('sitemap.xml'))).toBe(false);
  });
});

describe('404 page (#151)', () => {
  const page = readFileSync(pub('404.html'), 'utf8');

  it('adds the ErrorDocument for the path of the site, once', () => {
    expect(addErrorDocument('X\n', BASE)).toMatch(/\nErrorDocument 404 \/404\.html\n$/);
    expect(addErrorDocument('X', 'https://example.org/apps/caldence/')).toContain(
      'ErrorDocument 404 /apps/caldence/404.html',
    );
    expect(() => addErrorDocument(addErrorDocument('X', BASE), BASE)).toThrow();
  });

  it('points the home link at the path of the site', () => {
    expect(setHomeLink(page, BASE)).toContain('href="/" data-home');
    expect(setHomeLink(page, 'https://example.org/apps/caldence/')).toContain(
      'href="/apps/caldence/" data-home',
    );
  });

  it('the release .htaccess has no ErrorDocument, as only the deploy knows the path', () => {
    expect(readFileSync(pub('.htaccess'), 'utf8')).not.toContain('ErrorDocument');
  });

  it('the page is not indexed and loads nothing by relative path', () => {
    expect(page).toContain('<meta name="robots" content="noindex" />');
    expect(page).not.toMatch(/(src|href)="(?!\/"|https:)/);
  });
});
