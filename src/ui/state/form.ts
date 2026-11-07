import type { ValidationError } from '../../core/validate';

/** Maps validation errors under `prefix` to `{ relativePath: i18nKey }` (first error per field wins). */
export function fieldErrors(errors: ValidationError[], prefix: string): Record<string, string> {
  const start = prefix === '' ? '' : prefix + '.';
  const out: Record<string, string> = {};
  for (const e of errors) {
    if (!e.path.startsWith(start)) continue;
    const rel = e.path.slice(start.length);
    if (rel !== '' && !(rel in out)) out[rel] = e.key;
  }
  return out;
}
