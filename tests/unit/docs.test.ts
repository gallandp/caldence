import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadTemplate } from '../../src/core/template';
import { validateRegion } from '../../src/core/regions';
import { loadWorkspace } from '../../src/core/validate';

/** The first fenced json block of a doc, so the documented examples cannot go stale. */
function firstJson(file: string): string {
  const text = readFileSync(new URL(`../../docs/${file}`, import.meta.url), 'utf8');
  const m = /```json\n([\s\S]*?)\n```/.exec(text);
  if (!m) throw new Error(`no json block in ${file}`);
  return m[1];
}

describe('documented examples', () => {
  it('workspace-format.md loads as a workspace', () => {
    expect(loadWorkspace(firstJson('workspace-format.md')).ok).toBe(true);
  });
  it('template-format.md loads as a template', () => {
    expect(loadTemplate(firstJson('template-format.md')).ok).toBe(true);
  });
  it('region-format.md validates as a region', () => {
    expect(validateRegion(JSON.parse(firstJson('region-format.md'))).ok).toBe(true);
  });
});
