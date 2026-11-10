import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA, emptyWorkspace, type Workspace } from '../../src/core/model';
import type { Region } from '../../src/core/regions';
import { loadWorkspace, validate } from '../../src/core/validate';

const fixture = (): Workspace =>
  JSON.parse(readFileSync('tests/fixtures/valid-workspace.json', 'utf8')) as Workspace;

const sample = (): Region =>
  JSON.parse(readFileSync('tests/fixtures/regions/de-by-sample.json', 'utf8')) as Region;

function errorsOf(w: unknown): { path: string; key: string }[] {
  const r = validate(w);
  if (r.ok) throw new Error('expected validation to fail');
  return r.errors;
}

describe('emptyWorkspace', () => {
  it('has the documented defaults and validates', () => {
    const w = emptyWorkspace('2026-11-07');
    expect(w.settings.horizon).toEqual({ from: '2026-11-07', to: '2027-11-07' });
    expect(w.settings.thresholds).toEqual({ warnFactor: 1.5, maxFte: 0.6 });
    expect(validate(w).ok).toBe(true);
  });
});

describe('validate', () => {
  it('accepts the full fixture', () => {
    expect(validate(fixture()).ok).toBe(true);
  });

  it('reports missing teams at path teams', () => {
    const w: Record<string, unknown> = { ...emptyWorkspace('2026-11-07') };
    delete w.teams;
    expect(errorsOf(w)).toContainEqual({ path: 'teams', key: 'error.required' });
  });

  it('rejects non-object input', () => {
    expect(errorsOf(null)).toEqual([{ path: '', key: 'error.type' }]);
  });

  it('rejects a share outside (0, 1]', () => {
    const w = fixture();
    w.teams[0]!.events[0]!.participants[0]!.share = 1.5;
    expect(errorsOf(w)).toContainEqual({
      path: 'teams.0.events.0.participants.0.share',
      key: 'error.share.range',
    });
  });

  it('requires a non-empty workspace id', () => {
    const w: Record<string, unknown> = { ...fixture() };
    delete w.id;
    expect(errorsOf(w)).toContainEqual({ path: 'id', key: 'error.required' });
    expect(errorsOf({ ...w, id: '' })).toContainEqual({ path: 'id', key: 'error.type' });
  });

  it('accepts a settings.region that resolves nowhere', () => {
    const w = fixture();
    w.settings.region = 'xx-nowhere';
    expect(validate(w).ok).toBe(true);
    const loaded = loadWorkspace(
      JSON.stringify({ ...w, schemaVersion: 2, customRegions: undefined }),
    );
    expect(loaded.ok && loaded.value.settings.region).toBe('xx-nowhere');
  });

  it('accepts a settings.region that names an imported region', () => {
    const w = fixture();
    w.customRegions = [sample()];
    w.settings.region = 'de-by-sample';
    expect(validate(w).ok).toBe(true);
  });

  it('rejects imported regions with a built-in or duplicate id, or a bad shape', () => {
    const w = fixture();
    w.customRegions = [sample(), { ...sample(), id: 'de-sn' }, sample(), { id: 'x' } as never];
    const errors = errorsOf(w);
    expect(errors).toContainEqual({ path: 'customRegions.1.id', key: 'error.region.builtin' });
    expect(errors).toContainEqual({ path: 'customRegions.2.id', key: 'error.region.duplicate' });
    expect(errors).toContainEqual({ path: 'customRegions.3.name', key: 'error.required' });
  });

  it('requires customRegions', () => {
    const w: Record<string, unknown> = { ...fixture() };
    delete w.customRegions;
    expect(errorsOf(w)).toContainEqual({ path: 'customRegions', key: 'error.required' });
  });

  it('accepts any non-empty timezone name, known to this browser or not', () => {
    for (const tz of ['Europe/Berlin', 'Australia/Sydney', 'UTC', 'Foo/Bar', 'Mitteleuropa']) {
      expect(validate({ ...fixture(), settings: { ...fixture().settings, timezone: tz } }).ok).toBe(
        true,
      );
    }
    const empty = fixture();
    empty.settings.timezone = '  ';
    expect(errorsOf(empty)).toContainEqual({ path: 'settings.timezone', key: 'error.type' });
  });

  describe('weekdays rule', () => {
    const withDays = (weekdays: unknown): Workspace => {
      const w = fixture();
      w.teams[0]!.events[0]!.rule = { type: 'weekdays', weekdays } as never;
      return w;
    };
    const path = 'teams.0.events.0.rule.weekdays';

    it('accepts a unique list in 1-7', () => {
      expect(validate(withDays([1, 4])).ok).toBe(true);
    });
    it('rejects an empty list as required', () => {
      expect(errorsOf(withDays([]))).toContainEqual({ path, key: 'error.required' });
    });
    it.each([[[1, 1]], [[0, 2]], [[8]], [[1.5]]])('rejects %j as invalid', (days) => {
      expect(errorsOf(withDays(days))).toContainEqual({ path, key: 'error.enum.invalid' });
    });
    it('rejects a missing or non-array list', () => {
      expect(errorsOf(withDays(undefined))).toContainEqual({ path, key: 'error.required' });
      expect(errorsOf(withDays('1'))).toContainEqual({ path, key: 'error.type' });
    });
  });

  describe('cadence-day rule', () => {
    const withDay = (day: number): Workspace => {
      const w = fixture();
      const t = w.teams[0]!;
      t.cadence.lengthWeeks = 2;
      t.events[0]!.rule = { type: 'cadence-day', day };
      return w;
    };
    const path = 'teams.0.events.0.rule.day';

    it('accepts day 0 (the cadence start)', () => {
      expect(validate(withDay(0)).ok).toBe(true);
    });

    it('rejects day 14 in a 2-week cadence', () => {
      expect(validate(withDay(13)).ok).toBe(true);
      expect(errorsOf(withDay(14))).toContainEqual({ path, key: 'error.number.invalid' });
    });

    it('rejects day -1', () => {
      expect(errorsOf(withDay(-1))).toContainEqual({ path, key: 'error.number.invalid' });
    });
  });

  it('rejects horizon.to before horizon.from', () => {
    const w = emptyWorkspace('2026-11-07');
    w.settings.horizon.to = '2026-11-06';
    expect(errorsOf(w)).toContainEqual({ path: 'settings.horizon.to', key: 'error.horizon.order' });
  });

  it('rejects invalid dates', () => {
    const w = emptyWorkspace('2026-11-07');
    w.settings.horizon.from = '2026-02-30';
    expect(errorsOf(w)).toContainEqual({
      path: 'settings.horizon.from',
      key: 'error.date.invalid',
    });
  });

  it('rejects an unknown categoryId', () => {
    const w = fixture();
    w.teams[0]!.events[0]!.categoryId = 'nope';
    expect(errorsOf(w)).toContainEqual({
      path: 'teams.0.events.0.categoryId',
      key: 'error.ref.unknown',
    });
  });

  it('rejects unknown participant, member and milestone references', () => {
    const w = fixture();
    const t = w.teams[0]!;
    t.events[0]!.participants[0]!.roleId = 'x';
    t.members[0]!.personId = 'y';
    t.members[0]!.roleId = 'z';
    (t.events[0]!.rule as { milestoneId: string }).milestoneId = 'missing';
    const errs = errorsOf(w);
    expect(errs).toContainEqual({
      path: 'teams.0.events.0.participants.0.roleId',
      key: 'error.ref.unknown',
    });
    expect(errs).toContainEqual({ path: 'teams.0.members.0.personId', key: 'error.ref.unknown' });
    expect(errs).toContainEqual({ path: 'teams.0.members.0.roleId', key: 'error.ref.unknown' });
    expect(errs).toContainEqual({
      path: 'teams.0.events.0.rule.milestoneId',
      key: 'error.ref.unknown',
    });
  });

  it('rejects an unknown cycleId', () => {
    const w = fixture();
    (w.teams[0]!.events[0]!.rule as { cycleId: string }).cycleId = 'nope';
    expect(errorsOf(w)).toContainEqual({
      path: 'teams.0.events.0.rule.cycleId',
      key: 'error.ref.unknown',
    });
  });

  it('rejects duplicate ids', () => {
    const w = fixture();
    w.roles.push({ ...w.roles[0]! });
    expect(errorsOf(w)).toContainEqual({ path: 'roles.1.id', key: 'error.id.duplicate' });
  });

  it('rejects a duplicate team member (person, role) pair', () => {
    const w = fixture();
    const member = w.teams[0]!.members[0]!;
    w.teams[0]!.members.push({ ...member });
    const last = w.teams[0]!.members.length - 1;
    expect(errorsOf(w)).toContainEqual({
      path: `teams.0.members.${last}`,
      key: 'error.id.duplicate',
    });
  });

  it('rejects bad colours, weekdays, durations and times', () => {
    const w = fixture();
    w.roles[0]!.colour = 'blue';
    const ev = w.teams[0]!.events[0]!;
    ev.rule = { type: 'weekly', weekday: 8 };
    ev.duration = 0;
    ev.time = '25:00';
    const errs = errorsOf(w);
    expect(errs).toContainEqual({ path: 'roles.0.colour', key: 'error.colour.invalid' });
    expect(errs).toContainEqual({
      path: 'teams.0.events.0.rule.weekday',
      key: 'error.weekday.range',
    });
    expect(errs).toContainEqual({ path: 'teams.0.events.0.duration', key: 'error.number.invalid' });
    expect(errs).toContainEqual({ path: 'teams.0.events.0.time', key: 'error.time.invalid' });
  });

  it('reports an empty workdays list with its own key', () => {
    const w = emptyWorkspace('2026-11-07');
    w.settings.workdays = [];
    expect(errorsOf(w)).toContainEqual({ path: 'settings.workdays', key: 'error.workdays.empty' });
  });

  it('rejects newer and unknown schema versions', () => {
    const w = emptyWorkspace('2026-11-07');
    expect(errorsOf({ ...w, schemaVersion: CURRENT_SCHEMA + 1 })).toContainEqual({
      path: 'schemaVersion',
      key: 'error.schema.newer',
    });
    expect(errorsOf({ ...w, schemaVersion: 0 })).toContainEqual({
      path: 'schemaVersion',
      key: 'error.schema.unknown',
    });
  });

  it('returns all errors, not only the first', () => {
    const w = emptyWorkspace('2026-11-07');
    w.settings.horizon.to = '2020-01-01';
    w.settings.locale = 'fr' as 'de';
    w.roles.push({ id: 'a', name: 'A', colour: 'x' });
    expect(errorsOf(w).length).toBeGreaterThanOrEqual(3);
  });

  it('never mutates its input', () => {
    const w = fixture();
    w.teams[0]!.events[0]!.participants[0]!.share = 5;
    const copy = structuredClone(w);
    validate(w);
    expect(w).toEqual(copy);
  });
});

describe('loadWorkspace', () => {
  it('loads valid JSON text', () => {
    expect(loadWorkspace(JSON.stringify(fixture())).ok).toBe(true);
  });

  it('loads a 0.3.0-style workspace whose timezone this browser does not know', () => {
    const w = fixture();
    w.settings.timezone = 'Mitteleuropa';
    const r = loadWorkspace(JSON.stringify(w));
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.settings.timezone).toBe('Mitteleuropa');
  });

  it('reports a template file with a specific message', () => {
    const text = readFileSync('src/data/templates/scrum.en.json', 'utf8');
    expect(loadWorkspace(text)).toEqual({
      ok: false,
      errors: [{ path: 'kind', key: 'file.error.isTemplate' }],
    });
  });

  it('reports invalid JSON', () => {
    expect(loadWorkspace('{nope')).toEqual({
      ok: false,
      errors: [{ path: '', key: 'error.file.json' }],
    });
  });

  it('reports a newer schema from text', () => {
    const text = JSON.stringify({
      ...emptyWorkspace('2026-11-07'),
      schemaVersion: CURRENT_SCHEMA + 1,
    });
    expect(loadWorkspace(text)).toEqual({
      ok: false,
      errors: [{ path: 'schemaVersion', key: 'error.schema.newer' }],
    });
  });

  it('reports a missing schemaVersion as unknown', () => {
    expect(loadWorkspace('{}')).toEqual({
      ok: false,
      errors: [{ path: 'schemaVersion', key: 'error.schema.unknown' }],
    });
  });
});

describe('ids (security #39)', () => {
  const bad = ['a\r\nb', 'a b', 'ä', 'a;b', 'a:b', 'a"b', 'x'.repeat(65)];

  it.each(bad)('rejects the workspace id %j', (id) => {
    const w = fixture();
    w.id = id;
    expect(errorsOf(w)).toContainEqual({ path: 'id', key: 'error.id.invalid' });
  });

  it.each(bad)('rejects the list ids %j', (id) => {
    const w = fixture();
    w.roles[0]!.id = id;
    w.people[0]!.id = id;
    w.categories[0]!.id = id;
    const t = w.teams[0]!;
    t.cycles[0]!.milestones[0]!.id = id;
    t.cycles[0]!.id = id;
    t.events[0]!.id = id;
    t.id = id;
    const errors = errorsOf(w);
    for (const path of [
      'roles.0.id',
      'people.0.id',
      'categories.0.id',
      'teams.0.id',
      'teams.0.cycles.0.id',
      'teams.0.cycles.0.milestones.0.id',
      'teams.0.events.0.id',
    ])
      expect(errors).toContainEqual({ path, key: 'error.id.invalid' });
  });

  it('accepts UUIDs, generated ids and template ids', () => {
    for (const id of [
      '0b8f5c1e-6d3a-4e2b-9a47-5c1d2e3f4a60',
      'e12',
      'ev-flow-review',
      'a.b_C-9',
      'x'.repeat(64),
    ]) {
      const w = fixture();
      w.id = id;
      w.roles[0]!.id = id;
      w.teams[0]!.members[0]!.roleId = id;
      w.teams[0]!.events[0]!.participants[0]!.roleId = id;
      expect(validate(w).ok, id).toBe(true);
    }
  });
});
