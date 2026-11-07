import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import { detectLocale, formatDisplayDate, formatNumber, t } from '../../src/i18n';

function walk(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : [];
  });
}

describe('catalogues', () => {
  it('have identical key sets', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('contain every error key used in src/core', () => {
    const keys = new Set<string>();
    for (const f of walk('src/core', '.ts')) {
      for (const m of readFileSync(f, 'utf8').matchAll(/'(error\.[a-z.]+)'/g)) keys.add(m[1]!);
    }
    expect(keys.size).toBeGreaterThan(5);
    for (const k of keys) {
      expect(de, k).toHaveProperty([k]);
      expect(en, k).toHaveProperty([k]);
    }
  });

  it('use the same placeholders in both languages', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(de) as (keyof typeof de)[]) expect(ph(de[k]), k).toEqual(ph(en[k]));
  });
});

describe('t', () => {
  it('translates', () => {
    expect(t('de', 'app.name')).toBe('Caldence');
    expect(t('de', 'app.version', { version: '0.1.0' })).toBe('Version 0.1.0');
  });
  it('returns the key when missing', () => {
    expect(t('en', 'no.such.key')).toBe('no.such.key');
  });
  it('leaves a missing param placeholder in place', () => {
    expect(t('en', 'app.version')).toBe('Version {version}');
  });
});

describe('formatting', () => {
  it('formats dates without day shift', () => {
    expect(formatDisplayDate('de', '2027-01-07', 'short')).toBe('07.01.2027');
    expect(formatDisplayDate('en', '2027-01-07', 'short')).toBe('01/07/2027');
    expect(formatDisplayDate('de', '2027-01-07', 'long')).toContain('Januar');
  });
  it('formats numbers', () => {
    expect(formatNumber('de', 12.06, 2)).toBe('12,06');
    expect(formatNumber('en', 12.06, 2)).toBe('12.06');
  });
});

describe('detectLocale', () => {
  it('prefers settings', () => {
    expect(detectLocale({ locale: 'en' } as never, ['de-DE'])).toBe('en');
  });
  it('uses the first supported browser language', () => {
    expect(detectLocale(undefined, ['de-DE'])).toBe('de');
    expect(detectLocale(undefined, ['fr-FR', 'en-GB', 'de'])).toBe('en');
  });
  it('defaults to en', () => {
    expect(detectLocale(undefined, ['fr'])).toBe('en');
    expect(detectLocale(undefined, [])).toBe('en');
  });
});

describe('svelte markup', () => {
  // Strip <script>/<style> blocks, HTML comments and {...} expressions (one nesting level);
  // any remaining text node containing a letter is literal user-visible text.
  it('has no literal text outside $t(...)', () => {
    for (const f of walk('src', '.svelte')) {
      const markup = readFileSync(f, 'utf8')
        .replace(/<script[\s\S]*?<\/script>/g, '')
        .replace(/<style[\s\S]*?<\/style>/g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
      const texts = markup
        .split(/<[^>]*>/)
        .map((s) => s.trim())
        .filter((s) => /\p{L}/u.test(s));
      expect(texts, f).toEqual([]);
    }
  });
});
