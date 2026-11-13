import { describe, expect, it } from 'vitest';
import { capacity, fte, loadPerWeek, warnings, weeklyBaseLoad } from '../../src/core/load';
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
    memberHours: {},
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
    { id: 'p1', name: 'Pat' },
    { id: 'p2', name: 'Sam' },
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

  it('counts recurring meetings as regular load, one-offs and milestones not', () => {
    const t = team([
      event({ type: 'weekly', weekday: 2 }),
      event({ type: 'once', date: '2027-01-13' }, { id: 'e2', duration: 120 }),
    ]);
    const weeks = loadPerWeek(workspace([t]), noIndex());
    expect(at(weeks, 1).byPerson.p1).toBeCloseTo(3);
    expect(at(weeks, 1).regularByPerson.p1).toBeCloseTo(1);
    expect(at(weeks, 0).regularByPerson.p1).toBeCloseTo(1);
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
  /** `regular` is the part of p1's hours from recurring meetings. */
  const week = (monday: string, p1: number, p2 = 0, regular = 0) => ({
    monday,
    byPerson: { p1, p2 },
    regularByPerson: { p1: regular, p2: 0 },
    byTeamRole: {},
    byTeamPerson: {},
  });

  it('flags a week above warnFactor x average as above-usual', () => {
    const ws = workspace([]);
    ws.settings.thresholds = { warnFactor: 1.5, maxFte: 10 };
    const weeks = [week('2027-01-04', 1), week('2027-01-11', 1), week('2027-01-18', 7)];
    expect(warnings(weeks, ws)).toEqual([
      { monday: '2027-01-18', personId: 'p1', kind: 'above-usual' },
    ]);
  });

  it('does not flag a peak of recurring meetings that comes back with the cadence', () => {
    const ws = workspace([]);
    ws.settings.thresholds = { warnFactor: 1.5, maxFte: 10 };
    const weeks = [week('2027-01-04', 7, 0, 7), week('2027-01-11', 1, 0, 1)];
    weeks.push(week('2027-01-18', 7, 0, 7), week('2027-01-25', 1, 0, 1));
    expect(warnings(weeks, ws)).toEqual([]);
  });

  it('flags a one-off meeting on top of a recurring peak', () => {
    const ws = workspace([]);
    ws.settings.thresholds = { warnFactor: 1.5, maxFte: 10 };
    // Usual load of week 3 is its 4 recurring hours (the average is 3); 7 > 1.5 x 4.
    const weeks = [week('2027-01-04', 1, 0, 1), week('2027-01-11', 1, 0, 1)];
    weeks.push(week('2027-01-18', 7, 0, 4));
    expect(warnings(weeks, ws)).toEqual([
      { monday: '2027-01-18', personId: 'p1', kind: 'above-usual' },
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

describe('hours per team', () => {
  // Pat: 20 h in Alpha, 18 h in Beta; 12 h of meetings a week, all in Alpha.
  function twoTeams(): Workspace {
    const alpha = team([event({ type: 'weekly', weekday: 1 }, { duration: 720 })], {
      id: 'alpha',
      memberHours: { p1: 20 },
    });
    const beta = team([], { id: 'beta', memberHours: { p1: 18 } });
    const ws = workspace([alpha, beta], '2027-01-04', '2027-01-10');
    ws.settings.thresholds = { warnFactor: 100, maxFte: 0.5 };
    return ws;
  }

  it('capacity is the team entry, the sum over teams, or the default', () => {
    const ws = twoTeams();
    expect(capacity(ws, 'p1', 'alpha')).toBe(20);
    expect(capacity(ws, 'p1')).toBe(38);
    expect(capacity(ws, 'p2')).toBe(ws.settings.hoursPerWeek);
    ws.teams[1]!.memberHours = {};
    expect(capacity(ws, 'p1')).toBe(20 + ws.settings.hoursPerWeek);
  });

  it('counts hours per team and checks FTE against the filter', () => {
    const ws = twoTeams();
    const weeks = loadPerWeek(ws, noIndex());
    expect(at(weeks, 0).byTeamPerson['alpha']?.['p1']).toBe(12);
    expect(at(weeks, 0).byTeamPerson['beta']).toBeUndefined();
    // 12 / 20 = 0.6 in Alpha is above 0.5; 12 / 38 over both teams is not.
    expect(warnings(weeks, ws, { teamId: 'alpha' })).toEqual([
      { monday: '2027-01-04', personId: 'p1', kind: 'above-fte' },
    ]);
    expect(warnings(weeks, ws, { personId: 'p1' })).toEqual([]);
    expect(warnings(weeks, ws, { teamId: 'beta' })).toEqual([]);
  });

  it('flags meetings in a team where the person has 0 hours', () => {
    const ws = twoTeams();
    ws.teams[0]!.memberHours = { p1: 0 };
    expect(warnings(loadPerWeek(ws, noIndex()), ws, { teamId: 'alpha' })).toEqual([
      { monday: '2027-01-04', personId: 'p1', kind: 'above-fte' },
    ]);
  });
});

describe('ids that name Object.prototype members (security #40)', () => {
  const hostile = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'];

  it.each(hostile)(
    'weeklyBaseLoad keeps role and category %j apart from Object.prototype',
    (id) => {
      const t = team([
        event(
          { type: 'weekly', weekday: 1 },
          { categoryId: id, participants: [{ roleId: id, share: 1 }] },
        ),
      ]);
      const before = Object.getOwnPropertyNames(Object.prototype).length;
      const { byRole, byCategory } = weeklyBaseLoad(t);
      expect(Object.getOwnPropertyNames(Object.prototype).length).toBe(before);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(Object.getOwnPropertyDescriptor(byRole, id)?.value).toBe(1);
      expect(Object.getOwnPropertyDescriptor(byCategory[id] as object, id)?.value).toBe(1);
    },
  );

  it('weeklyBaseLoad does not write onto Object.prototype (#40 reproduction)', () => {
    const t = team([
      event(
        { type: 'weekly', weekday: 1 },
        { categoryId: '__proto__', participants: [{ roleId: 'polluted', share: 1 }] },
      ),
    ]);
    weeklyBaseLoad(t);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it.each(hostile)('loadPerWeek counts team, role and person %j as plain keys', (id) => {
    const t = team(
      [event({ type: 'weekly', weekday: 1 }, { participants: [{ roleId: id, share: 1 }] })],
      {
        id,
        members: [{ personId: id, roleId: id }],
      },
    );
    const ws = workspace([t]);
    ws.people = [{ id, name: 'X' }];
    const weeks = loadPerWeek(ws, noIndex());
    const w = at(weeks, 0);
    expect(Object.getOwnPropertyDescriptor(w.byPerson, id)?.value).toBe(1);
    expect(Object.getOwnPropertyDescriptor(w.byTeamRole[id] as object, id)?.value).toBe(1);
    expect(warnings(weeks, ws).every((x) => x.personId === id)).toBe(true);
  });
});
