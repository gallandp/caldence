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
    expect(MIGRATIONS[2]!(old)).toEqual({ ...old, customRegions: [] });
  });

  it('migrates schema 3 to 4 by splitting weekly hours evenly over the teams', () => {
    const team = (id: string, members: string[]) => ({
      id,
      name: id,
      cadence: { kind: 'sprint', lengthWeeks: 2, start: '2026-11-09' },
      members: members.map((m) => ({ personId: m.slice(0, 2), roleId: m.slice(3) || 'r1' })),
      assumptions: {},
      cycles: [],
      events: [],
    });
    const old = {
      ...emptyWorkspace('2026-11-07'),
      schemaVersion: 3,
      roles: [
        { id: 'r1', name: 'Dev', colour: '#2563eb' },
        { id: 'r2', name: 'PO', colour: '#7c3aed' },
      ],
      people: [
        { id: 'p1', name: 'Alex', hoursPerWeek: 40 },
        { id: 'p2', name: 'Sam', hoursPerWeek: 30 },
        { id: 'p3', name: 'Kim', hoursPerWeek: 20 },
      ],
      teams: [team('a', ['p1', 'p2', 'p2:r2']), team('b', ['p1']), team('c', ['p1'])],
    };
    const r = loadWorkspace(JSON.stringify(old));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.schemaVersion).toBe(4);
    // Sam has two roles in one team: one team, all hours. Kim is in no team and stays, without hours.
    expect(r.value.people).toEqual([
      { id: 'p1', name: 'Alex' },
      { id: 'p2', name: 'Sam' },
      { id: 'p3', name: 'Kim' },
    ]);
    expect(r.value.teams.map((t) => ({ ...t.memberHours }))).toEqual([
      { p1: 13.33, p2: 30 },
      { p1: 13.33 },
      { p1: 13.33 },
    ]);
  });

  it('migrates schema 1 all the way to the current schema', () => {
    const old: Record<string, unknown> = { ...emptyWorkspace('2026-11-07'), schemaVersion: 1 };
    delete old.id;
    delete old.customRegions;
    const r = migrate(old);
    const value = (r as { value: Record<string, unknown> }).value;
    expect(value).toEqual({
      ...old,
      schemaVersion: CURRENT_SCHEMA,
      id: value.id,
      customRegions: [],
    });
  });

  it('loads a schema 2 file', () => {
    const old: Record<string, unknown> = { ...emptyWorkspace('2026-11-07'), schemaVersion: 2 };
    delete old.customRegions;
    const r = loadWorkspace(JSON.stringify(old));
    expect(r.ok).toBe(true);
    expect(r.ok && r.value).toEqual({ ...old, schemaVersion: CURRENT_SCHEMA, customRegions: [] });
  });

  it('rejects a schema 5 file as newer', () => {
    expect(migrate({ schemaVersion: 5 })).toEqual({ ok: false, key: 'error.schema.newer' });
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
