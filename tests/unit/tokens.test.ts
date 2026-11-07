import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../src/core/colour';

const css = readFileSync('src/ui/tokens.css', 'utf8');

function tokens(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{3,6})\s*;/gi)].map((m) => [m[1]!, m[2]!]),
  );
}

const darkStart = css.indexOf('prefers-color-scheme: dark');
const light = tokens(css.slice(0, darkStart));
const dark = { ...light, ...tokens(css.slice(darkStart)) };

for (const [name, t] of [
  ['light', light],
  ['dark', dark],
] as const) {
  describe(`tokens (${name})`, () => {
    it('text colours reach 4.5:1 on bg and surface', () => {
      for (const fg of ['text', 'text-muted', 'danger'])
        for (const bg of ['bg', 'surface'])
          expect(contrastRatio(t[fg]!, t[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    });
    it('focus, accent and border reach 3:1 on bg and surface', () => {
      for (const fg of ['focus', 'accent', 'border'])
        for (const bg of ['bg', 'surface'])
          expect(contrastRatio(t[fg]!, t[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
    });
  });
}
