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
