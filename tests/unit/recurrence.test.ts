import { describe, expect, it } from 'vitest';
import { effectiveDuration, occurrences } from '../../src/core/recurrence';
import {
  emptyWorkspace,
  type CalEvent,
  type Rule,
  type Settings,
  type Team,
} from '../../src/core/model';
import type { HolidayIndex } from '../../src/core/regions';

const noIndex = (): HolidayIndex => ({
  holidays: new Map(),
  schoolHolidays: new Map(),
  beyondKnown: false,
});

function event(rule: Rule, extra: Partial<CalEvent> = {}): CalEvent {
  return {
    id: 'e1',
    name: 'Event',
    categoryId: 'c',
    rule,
    time: '10:00',
    duration: 60,
    participants: [],
    preparation: 0,
    ...extra,
  };
}

function team(events: CalEvent[], extra: Partial<Team> = {}): Team {
  return {
    id: 't1',
    name: 'Team',
    cadence: { kind: 'sprint', lengthWeeks: 2, start: '2027-01-07' },
    members: [],
    memberHours: {},
    assumptions: {},
    cycles: [],
    events,
    ...extra,
  };
}

function settings(from: string, to: string, extra: Partial<Settings> = {}): Settings {
  return { ...emptyWorkspace('2027-01-01').settings, horizon: { from, to }, ...extra };
}

const dates = (t: Team, s: Settings, i = noIndex()) => occurrences(t, s, i).map((o) => o.date);

describe('occurrences', () => {
  it('cadence-day 0 repeats every sprint', () => {
    const d = dates(
      team([event({ type: 'cadence-day', day: 0 })]),
      settings('2027-01-01', '2027-02-28'),
    );
    expect(d).toEqual(['2027-01-07', '2027-01-21', '2027-02-04', '2027-02-18']);
  });

  it('weekdays [1..5] occurs Monday to Friday', () => {
    const d = dates(
      team([event({ type: 'weekdays', weekdays: [1, 2, 3, 4, 5] })], {
        cadence: { kind: 'sprint', lengthWeeks: 2, start: '2027-01-04' },
      }),
      settings('2027-01-04', '2027-01-10'),
    );
    expect(d).toEqual(['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08']);
  });

  it('cadence-day 13 first occurs on 2027-01-20', () => {
    const d = dates(
      team([event({ type: 'cadence-day', day: 13 })]),
      settings('2027-01-01', '2027-02-28'),
    );
    expect(d[0]).toBe('2027-01-20');
  });

  it('cadence-day outside the period yields nothing', () => {
    const t = team([event({ type: 'cadence-day', day: 14 })]);
    expect(dates(t, settings('2027-01-01', '2027-03-01'))).toEqual([]);
  });

  it('ignores dates before the cadence start', () => {
    const d = dates(
      team([event({ type: 'weekly', weekday: 1 })]),
      settings('2026-12-01', '2027-01-12'),
    );
    expect(d).toEqual(['2027-01-11']);
  });

  it('weekly Monday flags Easter Monday when holidays are skipped', () => {
    const index = noIndex();
    index.holidays.set('2027-03-29', { de: 'Ostermontag', en: 'Easter Monday' });
    const occ = occurrences(
      team([event({ type: 'weekly', weekday: 1 })]),
      settings('2027-03-22', '2027-04-05', { skipHolidays: true }),
      index,
    );
    expect(occ.map((o) => o.date)).toEqual(['2027-03-22', '2027-03-29', '2027-04-05']);
    expect(occ[1]?.skippedHoliday?.en).toBe('Easter Monday');
    expect(occ[0]?.skippedHoliday).toBeUndefined();
  });

  it('does not flag holidays when skipHolidays is off', () => {
    const index = noIndex();
    index.holidays.set('2027-03-29', { de: 'Ostermontag', en: 'Easter Monday' });
    const occ = occurrences(
      team([event({ type: 'weekly', weekday: 1 })]),
      settings('2027-03-29', '2027-03-29', { skipHolidays: false }),
      index,
    );
    expect(occ).toHaveLength(1);
    expect(occ[0]?.skippedHoliday).toBeUndefined();
  });

  it('every-n-weeks with n = 2 from anchor 2027-01-12', () => {
    const d = dates(
      team([event({ type: 'every-n-weeks', weekday: 2, n: 2, anchor: '2027-01-12' })]),
      settings('2027-01-01', '2027-02-05'),
    );
    expect(d).toEqual(['2027-01-12', '2027-01-26']);
  });

  it('monthly 5th Friday over Feb-Apr 2027 gives only 2027-04-30', () => {
    const d = dates(
      team([event({ type: 'monthly-nth-weekday', weekday: 5, nth: 5 })]),
      settings('2027-02-01', '2027-04-30'),
    );
    expect(d).toEqual(['2027-04-30']);
  });

  it('monthly last weekday works', () => {
    const d = dates(
      team([event({ type: 'monthly-nth-weekday', weekday: 5, nth: -1 })]),
      settings('2027-02-01', '2027-03-31'),
    );
    expect(d).toEqual(['2027-02-26', '2027-03-26']);
  });

  it('once inside and outside the horizon', () => {
    const rule: Rule = { type: 'once', date: '2027-05-05' };
    expect(dates(team([event(rule)]), settings('2027-01-01', '2027-06-01'))).toEqual([
      '2027-05-05',
    ]);
    expect(dates(team([event(rule)]), settings('2027-01-01', '2027-03-01'))).toEqual([]);
  });

  it('cycle-milestone with offset -1 gives the day before', () => {
    const t = team(
      [event({ type: 'cycle-milestone', cycleId: 'c1', milestoneId: 'm1', offsetDays: -1 })],
      {
        cycles: [
          {
            id: 'c1',
            name: 'Cycle',
            milestones: [{ id: 'm1', name: 'Release', date: '2027-03-10' }],
          },
        ],
      },
    );
    expect(dates(t, settings('2027-01-01', '2027-06-01'))).toEqual(['2027-03-09']);
  });

  it('cycle-milestone with unknown cycle or milestone yields nothing', () => {
    const t = team([
      event({ type: 'cycle-milestone', cycleId: 'x', milestoneId: 'y', offsetDays: 0 }),
    ]);
    expect(dates(t, settings('2027-01-01', '2027-06-01'))).toEqual([]);
  });

  it('horizon with to before from gives []', () => {
    const t = team([event({ type: 'weekly', weekday: 1 })]);
    expect(occurrences(t, settings('2027-03-01', '2027-02-01'), noIndex())).toEqual([]);
  });

  it('sorts by date then time and carries event data', () => {
    const t = team([
      event({ type: 'once', date: '2027-02-02' }, { id: 'late', time: '15:00', duration: 30 }),
      event({ type: 'once', date: '2027-02-02' }, { id: 'early', time: '09:00' }),
      event({ type: 'once', date: '2027-02-01' }, { id: 'first', time: '17:00' }),
    ]);
    const occ = occurrences(t, settings('2027-01-01', '2027-03-01'), noIndex());
    expect(occ.map((o) => o.eventId)).toEqual(['first', 'early', 'late']);
    expect(occ[2]).toMatchObject({ teamId: 't1', start: '15:00', duration: 30 });
  });
});

describe('effectiveDuration', () => {
  const scaled = event(
    { type: 'weekly', weekday: 1 },
    { scaling: { base: 30, perUnit: 10, assumption: 'items', grid: 15 } },
  );

  it('rounds up to the grid', () => {
    expect(effectiveDuration(scaled, team([], { assumptions: { items: 4 } }))).toBe(75);
    expect(effectiveDuration(scaled, team([], { assumptions: { items: 3 } }))).toBe(60);
    expect(effectiveDuration(scaled, team([], { assumptions: { items: 5 } }))).toBe(90);
  });

  it('treats a missing assumption as 0 and grid <= 0 as no rounding', () => {
    expect(effectiveDuration(scaled, team([]))).toBe(30);
    const ungrid = event(
      { type: 'weekly', weekday: 1 },
      { scaling: { base: 30, perUnit: 7, assumption: 'a', grid: 0 } },
    );
    expect(effectiveDuration(ungrid, team([], { assumptions: { a: 1 } }))).toBe(37);
  });

  it('uses the plain duration without scaling', () => {
    expect(
      effectiveDuration(event({ type: 'weekly', weekday: 1 }, { duration: 45 }), team([])),
    ).toBe(45);
  });
});

describe('effectiveDuration with an assumption that names an Object.prototype member (security #40)', () => {
  it.each(['constructor', 'toString', '__proto__'])('treats a missing %j as 0, not NaN', (name) => {
    const e = event(
      { type: 'weekly', weekday: 1 },
      { scaling: { base: 30, perUnit: 5, assumption: name, grid: 15 } },
    );
    expect(effectiveDuration(e, team([e]))).toBe(30);
  });
  it('uses an own assumption with such a name', () => {
    const e = event(
      { type: 'weekly', weekday: 1 },
      { scaling: { base: 30, perUnit: 5, assumption: 'constructor', grid: 15 } },
    );
    expect(effectiveDuration(e, team([e], { assumptions: JSON.parse('{"constructor": 3}') }))).toBe(
      45,
    );
  });
});
