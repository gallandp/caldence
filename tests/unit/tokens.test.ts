import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../src/core/colour';

const css = readFileSync('src/ui/tokens.css', 'utf8');

// Tokens are written as `--name: light-dark(#light, #dark);` or as a single colour for both schemes.
function tokens(scheme: 0 | 1): Record<string, string> {
  return Object.fromEntries(
    [
      ...css.matchAll(
        /--([\w-]+):\s*(?:light-dark\((#[0-9a-f]{3,6}),\s*(#[0-9a-f]{3,6})\)|(#[0-9a-f]{3,6}))\s*;/gi,
      ),
    ].map((m) => [m[1]!, (m[4] ?? m[2 + scheme])!]),
  );
}

const light = tokens(0);
const dark = tokens(1);

for (const [name, t] of [
  ['light', light],
  ['dark', dark],
] as const) {
  describe(`tokens (${name})`, () => {
    it('text colours reach 4.5:1 on bg and surface', () => {
      for (const fg of ['text', 'text-muted', 'danger', 'accent-text', 'warn'])
        for (const bg of ['bg', 'surface', 'surface-2'])
          expect(contrastRatio(t[fg]!, t[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    });
    it('text on tinted fills reaches 4.5:1', () => {
      expect(contrastRatio(t['on-accent']!, t['accent']!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['accent-text']!, t['accent-soft']!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['warn']!, t['warn-soft']!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['danger']!, t['danger-soft']!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['ok']!, t['ok-soft']!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['side-text']!, t['side-bg']!)).toBeGreaterThanOrEqual(4.5);
    });
    // --border is decorative only; control outlines use --border-strong.
    it('focus, accent and control borders reach 3:1 on bg and surface', () => {
      for (const fg of ['focus', 'accent', 'border-strong'])
        for (const bg of ['bg', 'surface'])
          expect(contrastRatio(t[fg]!, t[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
    });
  });
}
