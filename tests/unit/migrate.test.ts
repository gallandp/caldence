import { afterEach, describe, expect, it } from 'vitest';
import { MIGRATIONS, migrate } from '../../src/core/migrate';
import { CURRENT_SCHEMA, emptyWorkspace } from '../../src/core/model';
import { loadWorkspace } from '../../src/core/validate';

describe('migrate', () => {
  afterEach(() => {
    delete MIGRATIONS[0];
  });

  it('passes a current workspace through unchanged', () => {
    const w = emptyWorkspace('2026-11-07');
    expect(migrate(w)).toEqual({ ok: true, value: w });
  });

  it('migration 1 adds only a UUID v4 id', () => {
    const old: Record<string, unknown> = { ...emptyWorkspace('2026-11-07'), schemaVersion: 1 };
    delete old.id;
    delete old.customRegions;
    const value = MIGRATIONS[1]!(old) as Record<string, unknown>;
    expect(value.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(value).toEqual({ ...old, schemaVersion: 1, id: value.id });
  });

  it('migrates schema 2 to 3 by adding only an empty customRegions list', () => {
    const old: Record<string, unknown> = { ...emptyWorkspace('2026-11-07'), schemaVersion: 2 };
    delete old.customRegions;
    const r = migrate(old);
    expect(r).toEqual({ ok: true, value: { ...old, schemaVersion: 3, customRegions: [] } });
  });

  it('migrates schema 1 all the way to 3', () => {
    const old: Record<string, unknown> = { ...emptyWorkspace('2026-11-07'), schemaVersion: 1 };
    delete old.id;
    delete old.customRegions;
    const r = migrate(old);
    const value = (r as { value: Record<string, unknown> }).value;
    expect(value).toEqual({ ...old, schemaVersion: 3, id: value.id, customRegions: [] });
  });

  it('loads a schema 2 file', () => {
    const old: Record<string, unknown> = { ...emptyWorkspace('2026-11-07'), schemaVersion: 2 };
    delete old.customRegions;
    const r = loadWorkspace(JSON.stringify(old));
    expect(r.ok).toBe(true);
    expect(r.ok && r.value).toEqual({ ...old, schemaVersion: 3, customRegions: [] });
  });

  it('rejects a schema 4 file as newer', () => {
    expect(migrate({ schemaVersion: 4 })).toEqual({ ok: false, key: 'error.schema.newer' });
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
