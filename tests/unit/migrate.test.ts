import { afterEach, describe, expect, it } from 'vitest';
import { MIGRATIONS, migrate } from '../../src/core/migrate';
import { CURRENT_SCHEMA, emptyWorkspace } from '../../src/core/model';

describe('migrate', () => {
  afterEach(() => {
    delete MIGRATIONS[0];
  });

  it('passes a current workspace through unchanged', () => {
    const w = emptyWorkspace('2026-11-07');
    expect(migrate(w)).toEqual({ ok: true, value: w });
  });

  it('migrates schema 1 to 2 by adding only a UUID v4 id', () => {
    const old: Record<string, unknown> = { ...emptyWorkspace('2026-11-07'), schemaVersion: 1 };
    delete old.id;
    const r = migrate(old);
    expect(r.ok).toBe(true);
    const value = (r as { value: Record<string, unknown> }).value;
    expect(value.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(value).toEqual({ ...old, schemaVersion: 2, id: value.id });
  });

  it('rejects a schema 3 file as newer', () => {
    expect(migrate({ schemaVersion: 3 })).toEqual({ ok: false, key: 'error.schema.newer' });
  });

  it('rejects newer schemas without touching the input', () => {
    const w = { ...emptyWorkspace('2026-11-07'), schemaVersion: CURRENT_SCHEMA + 1 };
    const copy = structuredClone(w);
    expect(migrate(w)).toEqual({ ok: false, key: 'error.schema.newer' });
    expect(w).toEqual(copy);
  });

  it.each([undefined, 0, -1, 1.5, '1', null])('reports unknown for schemaVersion %j', (v) => {
    expect(migrate({ schemaVersion: v })).toEqual({ ok: false, key: 'error.schema.unknown' });
  });

  it('reports unknown for non-objects', () => {
    expect(migrate(null)).toEqual({ ok: false, key: 'error.schema.unknown' });
    expect(migrate([])).toEqual({ ok: false, key: 'error.schema.unknown' });
  });

  it('reports unknown when a migration step is missing', () => {
    expect(migrate({ schemaVersion: 0 })).toEqual({ ok: false, key: 'error.schema.unknown' });
  });
});
