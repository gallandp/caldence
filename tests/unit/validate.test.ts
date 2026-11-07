import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA, emptyWorkspace, type Workspace } from '../../src/core/model';
import { loadWorkspace, validate } from '../../src/core/validate';

const fixture = (): Workspace =>
  JSON.parse(readFileSync('tests/fixtures/valid-workspace.json', 'utf8')) as Workspace;

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
