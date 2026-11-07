import { CURRENT_SCHEMA } from './model';

/** Migration `n` upgrades a workspace from schema `n` to `n + 1`. Schema 1 is the first, so none yet. */
export const MIGRATIONS: Record<number, (w: unknown) => unknown> = {};

export type MigrateResult =
  { ok: true; value: unknown } | { ok: false; key: 'error.schema.newer' | 'error.schema.unknown' };

export function migrate(input: unknown): MigrateResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, key: 'error.schema.unknown' };
  }
  const version = (input as Record<string, unknown>).schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, key: 'error.schema.unknown' };
  }
  if (version > CURRENT_SCHEMA) return { ok: false, key: 'error.schema.newer' };

  let value: unknown = structuredClone(input);
  for (let v = version; v < CURRENT_SCHEMA; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, key: 'error.schema.unknown' };
    value = step(value);
    (value as Record<string, unknown>).schemaVersion = v + 1;
  }
  return { ok: true, value };
}
