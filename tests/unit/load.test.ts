import { describe, expect, it } from 'vitest';
import { fte, loadPerWeek, warnings, weeklyBaseLoad } from '../../src/core/load';
import {
  emptyWorkspace,
  type CalEvent,
  type Rule,
  type Team,
  type Workspace,
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
    categoryId: 'c1',
    rule,
    time: '10:00',
    duration: 60,
    participants: [{ roleId: 'r1', share: 1 }],
    preparation: 0,
    ...extra,
  };
}

function team(events: CalEvent[], extra: Partial<Team> = {}): Team {
  return {
    id: 't1',
    name: 'Team',
    cadence: { kind: 'sprint', lengthWeeks: 2, start: '2027-01-04' },
    members: [{ personId: 'p1', roleId: 'r1' }],
    assumptions: {},
    cycles: [],
    events,
    ...extra,
  };
}

function workspace(teams: Team[], from = '2027-01-04', to = '2027-01-24'): Workspace {
  const ws = emptyWorkspace('2027-01-04');
  ws.settings.horizon = { from, to };
  ws.settings.skipHolidays = true;
  ws.people = [
    { id: 'p1', name: 'Pat', hoursPerWeek: 40 },
    { id: 'p2', name: 'Sam', hoursPerWeek: 40 },
  ];
  ws.teams = teams;
  return ws;
}

function at<T>(list: T[], i: number): T {
  const item = list[i];
  if (item === undefined) throw new Error(`missing index ${i}`);
  return item;
}

describe('weeklyBaseLoad', () => {
  it('weekdays 15 min on five days is 1.25 h/week', () => {
    const load = weeklyBaseLoad(
      team([event({ type: 'weekdays', weekdays: [1, 2, 3, 4, 5] }, { duration: 15 })]),
    );
    expect(load.byRole.r1).toBeCloseTo(1.25);
  });

  it('weekly 60 min with preparation 0.5 is 1.5 h/week', () => {
    const load = weeklyBaseLoad(
      team([event({ type: 'weekly', weekday: 1 }, { preparation: 0.5 })]),
    );
    expect(load.byRole.r1).toBeCloseTo(1.5);
    expect(load.byCategory.c1?.r1).toBeCloseTo(1.5);
  });

  it('every 2 weeks, share 0.5, is 0.25 h/week', () => {
    const load = weeklyBaseLoad(
      team([
        event(
          { type: 'every-n-weeks', weekday: 1, n: 2, anchor: '2027-01-04' },
          { participants: [{ roleId: 'r1', share: 0.5 }] },
        ),
      ]),
    );
    expect(load.byRole.r1).toBeCloseTo(0.25);
  });

  it('cadence-day in a 2-week sprint, 120 min, is 1.0 h/week', () => {
    const load = weeklyBaseLoad(team([event({ type: 'cadence-day', day: 0 }, { duration: 120 })]));
    expect(load.byRole.r1).toBeCloseTo(1);
  });

  it('monthly nth weekday is 12/52 per week', () => {
    const load = weeklyBaseLoad(team([event({ type: 'monthly-nth-weekday', weekday: 1, nth: 1 })]));
    expect(load.byRole.r1).toBeCloseTo(12 / 52);
  });

  it('once and cycle-milestone events add nothing', () => {
    const load = weeklyBaseLoad(
      team([
        event({ type: 'once', date: '2027-01-05' }),
        event({ type: 'cycle-milestone', cycleId: 'x', milestoneId: 'y', offsetDays: 0 }),
      ]),
    );
    expect(load.byRole).toEqual({});
    expect(load.byCategory).toEqual({});
  });

  it('uses the scaled effective duration', () => {
    const load = weeklyBaseLoad(
      team(
        [
          event(
            { type: 'weekly', weekday: 1 },
            { scaling: { base: 30, perUnit: 10, assumption: 'size', grid: 15 } },
          ),
        ],
        { assumptions: { size: 4 } },
      ),
    );
    expect(load.byRole.r1).toBeCloseTo(75 / 60);
  });
});

describe('loadPerWeek', () => {
  it('lists every Monday of the horizon, including zero-load weeks', () => {
    const ws = workspace([team([event({ type: 'once', date: '2027-01-12' })])]);
    const weeks = loadPerWeek(ws, noIndex());
    expect(weeks.map((w) => w.monday)).toEqual(['2027-01-04', '2027-01-11', '2027-01-18']);
    expect(at(weeks, 0).byPerson.p1).toBe(0);
    expect(at(weeks, 1).byPerson.p1).toBeCloseTo(1);
    expect(at(weeks, 2).byPerson.p1).toBe(0);
    expect(at(weeks, 1).byTeamRole.t1?.r1).toBeCloseTo(1);
  });

  it('starts at the Monday of a mid-week horizon start', () => {
    const ws = workspace([], '2027-01-06', '2027-01-13');
    expect(loadPerWeek(ws, noIndex()).map((w) => w.monday)).toEqual(['2027-01-04', '2027-01-11']);
  });

  it('sums a person across two teams', () => {
    const a = team([event({ type: 'weekly', weekday: 2 })]);
    const b = team([event({ type: 'weekly', weekday: 3 }, { duration: 120 })], { id: 't2' });
    const weeks = loadPerWeek(workspace([a, b]), noIndex());
    expect(at(weeks, 0).byPerson.p1).toBeCloseTo(3);
    expect(at(weeks, 0).byTeamRole.t2?.r1).toBeCloseTo(2);
  });

  it('gives nothing to a person whose role is not a participant', () => {
    const t = team([event({ type: 'weekly', weekday: 2 })], {
      members: [
        { personId: 'p1', roleId: 'r1' },
        { personId: 'p2', roleId: 'r2' },
      ],
    });
    const weeks = loadPerWeek(workspace([t]), noIndex());
    expect(at(weeks, 0).byPerson.p1).toBeCloseTo(1);
    expect(at(weeks, 0).byPerson.p2).toBe(0);
  });

  it('counts a skipped holiday occurrence as 0', () => {
    const index = noIndex();
    index.holidays.set('2027-01-05', { de: 'Test', en: 'Test' });
    const ws = workspace([team([event({ type: 'weekly', weekday: 2 })])]);
    const weeks = loadPerWeek(ws, index);
    expect(at(weeks, 0).byPerson.p1).toBe(0);
    expect(at(weeks, 1).byPerson.p1).toBeCloseTo(1);
  });
});

describe('fte', () => {
  it('divides hours by contract hours', () => {
    expect(fte(19, 38)).toBe(0.5);
  });
  it('returns 0 when hoursPerWeek is 0 or less', () => {
    expect(fte(5, 0)).toBe(0);
    expect(fte(5, -3)).toBe(0);
  });
});

describe('warnings', () => {
  const week = (monday: string, p1: number, p2 = 0) => ({
    monday,
    byPerson: { p1, p2 },
    byTeamRole: {},
  });

  it('flags a week above warnFactor x average as above-average', () => {
    const ws = workspace([]);
    ws.settings.thresholds = { warnFactor: 1.5, maxFte: 10 };
    const weeks = [week('2027-01-04', 1), week('2027-01-11', 1), week('2027-01-18', 7)];
    expect(warnings(weeks, ws)).toEqual([
      { monday: '2027-01-18', personId: 'p1', kind: 'above-average' },
    ]);
  });

  it('does not flag people with an average of 0', () => {
    const ws = workspace([]);
    expect(warnings([week('2027-01-04', 0), week('2027-01-11', 0)], ws)).toEqual([]);
  });

  it('flags above-fte and sorts by monday then person', () => {
    const ws = workspace([]);
    ws.settings.thresholds = { warnFactor: 100, maxFte: 0.5 };
    const weeks = [week('2027-01-04', 21, 21), week('2027-01-11', 10, 25)];
    expect(warnings(weeks, ws)).toEqual([
      { monday: '2027-01-04', personId: 'p1', kind: 'above-fte' },
      { monday: '2027-01-04', personId: 'p2', kind: 'above-fte' },
      { monday: '2027-01-11', personId: 'p2', kind: 'above-fte' },
    ]);
  });
});
