import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MARKER, addHeadTags, checkBase, headTags } from '../../scripts/site-meta.mjs';

const BASE = 'https://caldence.de/';
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
