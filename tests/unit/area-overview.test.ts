import { describe, expect, it } from 'vitest';
import {
  areaMeetingHours,
  compareCadences,
  segments,
  areaOnlyLoad,
  areaOnlyPeople,
  stepReasons,
  teamLoad,
  zeroHourMembers,
} from '../../src/core/areaOverview';
import { areaHints, capacity, loadPerWeek, overMax, warnings } from '../../src/core/load';
import {
  emptyWorkspace,
  type Area,
  type Cadence,
  type Team,
  type Workspace,
} from '../../src/core/model';
import type { HolidayIndex } from '../../src/core/regions';
import example from '../../src/data/examples/example.caldence.json';
import { areaWorkspace } from '../e2e/area-fixture';

const noIndex = (): HolidayIndex => ({
  holidays: new Map(),
  schoolHolidays: new Map(),
  beyondKnown: false,
});

const sprint = (lengthWeeks: number, start = '2027-01-04'): Cadence => ({
  kind: 'sprint',
  lengthWeeks,
  start,
});

function team(id: string, cadence: Cadence, extra: Partial<Team> = {}): Team {
  return {
    id,
    name: id,
    cadence,
    members: [],
    memberHours: {},
    assumptions: {},
    cycles: [],
    events: [],
    ...extra,
  };
}

function area(teamIds: string[], cadence?: Cadence): Area {
  return {
    id: 'a1',
    name: 'Payments',
    teamIds,
    ...(cadence ? { cadence } : {}),
    members: [],
    memberHours: {},
    cycles: [],
    events: [],
  };
}

function workspace(teams: Team[]) {
  const ws = emptyWorkspace('2027-01-04');
  ws.settings.horizon = { from: '2027-01-04', to: '2027-03-28' };
  ws.teams = teams;
  return ws;
}

describe('segments', () => {
  it('draws whole periods over the window', () => {
    const s = segments(sprint(2), '2027-01-04', 6);
    expect(s.map((x) => [x.number, x.fromWeek, x.span])).toEqual([
      [1, 0, 2],
      [2, 2, 2],
      [3, 4, 2],
    ]);
  });

  it('clips a period that started before the window and one that runs past it', () => {
    const s = segments(sprint(3), '2027-01-11', 4);
    expect(s.map((x) => [x.number, x.start, x.fromWeek, x.span])).toEqual([
      [1, '2027-01-04', 0, 2],
      [2, '2027-01-25', 2, 2],
    ]);
  });

  it('draws a mid-week period from the week it starts in', () => {
    const s = segments(sprint(2, '2027-01-06'), '2027-01-04', 4);
    expect(s.map((x) => [x.fromWeek, x.span])).toEqual([
      [0, 2],
      [2, 2],
    ]);
  });

  it('starts at the cadence start and is empty for a zero length', () => {
    expect(segments(sprint(2, '2027-01-18'), '2027-01-04', 4).map((x) => x.fromWeek)).toEqual([2]);
    expect(segments(sprint(0), '2027-01-04', 4)).toEqual([]);
  });
});

describe('stepReasons', () => {
  const pi = sprint(10);
  it('accepts a period length that divides the area period and starts on its starts', () => {
    expect(stepReasons(sprint(2), pi, true)).toEqual([]);
    expect(stepReasons(sprint(5, '2027-02-08'), pi, true)).toEqual([]);
  });

  it('names a length that does not fit', () => {
    expect(stepReasons(sprint(3), pi, true)).toEqual([{ kind: 'length', weeks: 3, reference: 10 }]);
  });

  it('names another weekday', () => {
    expect(stepReasons(sprint(2, '2027-01-06'), pi, true)).toEqual([
      { kind: 'weekday', weekday: 3 },
    ]);
  });

  it('names an offset in days', () => {
    expect(stepReasons(sprint(2, '2027-01-11'), pi, true)).toEqual([{ kind: 'offset', weeks: 1 }]);
  });

  it('needs the same length when teams are compared with each other', () => {
    expect(stepReasons(sprint(4), sprint(2), false)).toEqual([
      { kind: 'length', weeks: 4, reference: 2 },
    ]);
    expect(stepReasons(sprint(2, '2027-01-18'), sprint(2), false)).toEqual([]);
  });
});

describe('compareCadences', () => {
  it('compares each team with the area cadence and marks periods that run over its starts', () => {
    const ws = workspace([
      team('alpha', sprint(2)),
      team('gamma', sprint(3)),
      team('delta', sprint(2, '2027-01-06')),
    ]);
    const c = compareCadences(ws, area(['alpha', 'gamma', 'delta'], sprint(10)), '2027-01-04', 12);
    expect(c.reference?.fromArea).toBe(true);
    expect(c.areaSegments.map((s) => [s.fromWeek, s.span])).toEqual([
      [0, 10],
      [10, 2],
    ]);
    const [alpha, gamma, delta] = c.rows;
    expect(alpha!.inStep).toBe(true);
    expect(alpha!.segments.every((s) => !s.off)).toBe(true);
    expect(gamma!.inStep).toBe(false);
    // Sprint 4 (weeks 10-12) runs over the start of the second area period.
    expect(gamma!.segments.map((s) => s.off)).toEqual([false, false, false, true]);
    expect(delta!.segments.every((s) => s.off)).toBe(true);
  });

  it('without an area cadence compares with the cadence most teams share', () => {
    const ws = workspace([
      team('gamma', sprint(3)),
      team('alpha', sprint(2)),
      team('beta', sprint(2, '2027-01-18')),
    ]);
    const c = compareCadences(ws, area(['gamma', 'alpha', 'beta']), '2027-01-04', 12);
    expect(c.reference).toMatchObject({ fromArea: false, teamId: 'alpha' });
    expect(c.areaSegments).toEqual([]);
    expect(c.rows.map((r) => r.inStep)).toEqual([false, true, true]);
    expect(c.rows[0]!.segments.every((s) => s.off)).toBe(true);
  });

  it('during a what-if keeps the saved reference, so the changed team differs (#470)', () => {
    // Alpha and Beta share 2-week sprints: Alpha is the reference.
    const saved = workspace([
      team('alpha', sprint(2)),
      team('beta', sprint(2)),
      team('gamma', sprint(3)),
    ]);
    const a = area(['alpha', 'beta', 'gamma']);
    const withAlpha = (c: Cadence) => ({
      ...saved,
      teams: [team('alpha', c), ...saved.teams.slice(1)],
    });
    // Alpha tries 4 weeks: no two teams share a cadence now. Alone, the changed file would take
    // Alpha's new cadence and call Beta and Gamma out of step.
    const whatIf = withAlpha(sprint(4));
    expect(compareCadences(whatIf, a, '2027-01-04', 12).rows.map((r) => r.inStep)).toEqual([
      true,
      false,
      false,
    ]);
    const c = compareCadences(whatIf, a, '2027-01-04', 12, saved);
    expect(c.reference).toMatchObject({ teamId: 'alpha', cadence: sprint(2) });
    expect(c.rows.map((r) => r.inStep)).toEqual([false, true, false]);
    expect(c.rows[0]!.reasons).toEqual([{ kind: 'length', weeks: 4, reference: 2 }]);
    expect(c.sharing).toBe(1);
    // Alpha tries Gamma's 3 weeks: now more teams share that one, so it is the reference.
    const joined = compareCadences(withAlpha(sprint(3)), a, '2027-01-04', 12, saved);
    expect(joined.reference).toMatchObject({ teamId: 'alpha', cadence: sprint(3) });
    expect(joined.rows.map((r) => r.inStep)).toEqual([true, false, true]);
    expect(joined.sharing).toBe(2);
  });

  it('counts how many teams share the peer reference, none with an area cadence', () => {
    const ws = workspace([team('alpha', sprint(2)), team('beta', sprint(2)), team('c', sprint(3))]);
    expect(compareCadences(ws, area(['c', 'alpha', 'beta']), '2027-01-04', 4).sharing).toBe(2);
    expect(compareCadences(ws, area(['alpha'], sprint(10)), '2027-01-04', 4).sharing).toBe(0);
  });

  it('keeps the area order and skips unknown team ids', () => {
    const ws = workspace([team('alpha', sprint(2)), team('beta', sprint(2))]);
    const c = compareCadences(ws, area(['beta', 'gone', 'alpha']), '2027-01-04', 4);
    expect(c.rows.map((r) => r.teamId)).toEqual(['beta', 'alpha']);
  });
});

describe('teamLoad', () => {
  it('pools the members’ hours like the cost table and warns when one is over the maximum', () => {
    const t = team('alpha', sprint(2), {
      members: [
        { personId: 'p1', roleId: 'po' },
        { personId: 'p2', roleId: 'dev' },
      ],
      memberHours: { p1: 20, p2: 40 },
      events: [
        {
          id: 'e1',
          name: 'Refinement',
          categoryId: 'c1',
          rule: { type: 'weekly', weekday: 2 },
          time: '10:00',
          duration: 780,
          participants: [{ roleId: 'po', share: 1 }],
          preparation: 0,
        },
      ],
    });
    const ws = workspace([t]);
    ws.people = [
      { id: 'p1', name: 'Pat' },
      { id: 'p2', name: 'Sam' },
    ];
    const cells = teamLoad(ws, t, loadPerWeek(ws, noIndex()));
    // 13 h of 20 h + 40 h = 21.7 % (#262); Pat alone (13 of 20 h = 65 %) is over 60 %.
    expect(cells[0]!.share).toBeCloseTo(13 / 60);
    expect(cells[0]!.warn).toBe(true);
  });

  it('judges a person in two teams on all their meetings ÷ all their hours (#294)', () => {
    // Alex is PO in Alpha and Beta, 16 + 16 h, limit 15 %.
    const refinement = (hours: number) => ({
      id: `e${hours}`,
      name: 'Refinement',
      categoryId: 'c1',
      rule: { type: 'weekly' as const, weekday: 2 },
      time: '10:00',
      duration: hours * 60,
      participants: [{ roleId: 'po', share: 1 }],
      preparation: 0,
    });
    const member = { members: [{ personId: 'alex', roleId: 'po' }], memberHours: { alex: 16 } };
    const judge = (alpha: number, beta: number) => {
      const a = team('alpha', sprint(2), { ...member, events: [refinement(alpha)] });
      const b = team('beta', sprint(2), { ...member, events: [refinement(beta)] });
      const ws = workspace([a, b]);
      ws.people = [{ id: 'alex', name: 'Alex' }];
      ws.settings.thresholds.maxFte = 0.15;
      return teamLoad(ws, a, loadPerWeek(ws, noIndex()))[0]!;
    };
    // 3 h of Alpha's 16 h is 19 %, but 4 h of 32 h is 12.5 %: not over the limit.
    expect(judge(3, 1)).toMatchObject({ share: 3 / 16, warn: false });
    // 2 h of 16 h is 12.5 % in Alpha, but 5 h of 32 h is 15.6 %: over the limit there too.
    expect(judge(2, 3)).toMatchObject({ share: 2 / 16, warn: true });
  });

  it('does not warn for area meetings without area hours when the total is under the limit', () => {
    const t = team('alpha', sprint(2), {
      members: [{ personId: 'alex', roleId: 'po' }],
      memberHours: { alex: 32 },
    });
    const a = area(['alpha']);
    a.events = [
      {
        id: 'forum',
        name: 'PO forum',
        categoryId: 'c1',
        rule: { type: 'weekly', weekday: 2 },
        time: '10:00',
        duration: 60,
        participants: [{ roleId: 'po', share: 1, fromTeams: true }],
        preparation: 0,
      },
    ];
    const ws = workspace([t]);
    ws.areas = [a];
    ws.people = [{ id: 'alex', name: 'Alex' }];
    ws.settings.thresholds.maxFte = 0.5;
    // 1 h of 32 h is 3 %; the 0 h in the area are warned about in Load, not outlined here.
    expect(teamLoad(ws, t, loadPerWeek(ws, noIndex()))[0]!.warn).toBe(false);
  });

  it('is 0 without members', () => {
    const t = team('alpha', sprint(2));
    const ws = workspace([t]);
    expect(teamLoad(ws, t, loadPerWeek(ws, noIndex()))[0]).toMatchObject({ share: 0, warn: false });
  });
});

describe('areaOnlyLoad (#334)', () => {
  /** Jordan leads the area with 8 h there and is in no team; Alex is PO in Alpha with 32 h. */
  function setup(maxFte: number) {
    const t = team('alpha', sprint(2), {
      members: [{ personId: 'alex', roleId: 'po' }],
      memberHours: { alex: 32 },
    });
    const a = area(['alpha']);
    a.members = [{ personId: 'jordan', roleId: 'lead' }];
    a.memberHours = { jordan: 8 };
    a.events = [
      {
        id: 'sync',
        name: 'Lead sync',
        categoryId: 'c1',
        rule: { type: 'weekly', weekday: 2 },
        time: '10:00',
        duration: 60,
        participants: [{ roleId: 'lead', share: 1 }],
        preparation: 0,
      },
    ];
    const ws = workspace([t]);
    ws.areas = [a];
    ws.people = [
      { id: 'alex', name: 'Alex' },
      { id: 'jordan', name: 'Jordan' },
    ];
    ws.settings.thresholds.maxFte = maxFte;
    return { ws, a, weeks: loadPerWeek(ws, noIndex()) };
  }

  it('names the people who are only in the area', () => {
    const { ws, a } = setup(0.12);
    expect(areaOnlyPeople(ws, a)).toEqual(['jordan']);
  });

  it('warns when someone only in the area is over the limit', () => {
    // 1 h of 8 h is 12.5 %: over 12 %, not over 20 %.
    const over = setup(0.12);
    expect(areaOnlyLoad(over.ws, over.a, over.weeks)[0]).toMatchObject({
      share: 1 / 8,
      warn: true,
    });
    const fine = setup(0.2);
    expect(areaOnlyLoad(fine.ws, fine.a, fine.weeks)[0]!.warn).toBe(false);
  });
});

describe('one rule for over the limit on the area fixture (#307, #334)', () => {
  /** People over the limit per week as the people table, strip and week detail judge them. */
  function overByRule(ws: Workspace) {
    const weeks = loadPerWeek(ws, noIndex());
    const max = ws.settings.thresholds.maxFte;
    return weeks.map((w) =>
      ws.people
        .filter((p) => overMax(w.byPerson[p.id] ?? 0, capacity(ws, p.id), max))
        .map((p) => p.id)
        .sort(),
    );
  }
  function overByWarnings(ws: Workspace) {
    const weeks = loadPerWeek(ws, noIndex());
    const all = warnings(weeks, ws).filter((w) => w.kind === 'above-fte');
    return weeks.map((w) =>
      all
        .filter((x) => x.monday === w.monday)
        .map((x) => x.personId)
        .sort(),
    );
  }

  const files = {
    'area fixture': () => areaWorkspace() as unknown as Workspace,
    'example file': () => structuredClone(example) as unknown as Workspace,
  };
  const cases = Object.keys(files).flatMap((file) =>
    [0.6, 0.3, 0.12].map((max) => [file as keyof typeof files, max] as const),
  );

  it.each(cases)('%s: Warnings and the people table agree at a limit of %s', (file, max) => {
    const ws = files[file]();
    ws.settings.thresholds.maxFte = max;
    expect(overByWarnings(ws)).toEqual(overByRule(ws));
  });

  it.each(cases)('%s: the Overview strip counts the same weeks at %s', (file, max) => {
    const ws = files[file]();
    ws.settings.thresholds.maxFte = max;
    expect(ws.areas.length).toBeGreaterThan(0);
    for (const a of ws.areas) {
      const weeks = loadPerWeek(ws, noIndex());
      const rows = [
        ...a.teamIds.map((id) =>
          teamLoad(
            ws,
            ws.teams.find((t) => t.id === id)!,
            weeks,
          ),
        ),
        areaOnlyLoad(ws, a, weeks),
      ];
      const stripWeeks = weeks.filter((_, i) => rows.some((r) => r[i]!.warn)).map((w) => w.monday);
      const inArea = new Set(
        [
          ...a.members,
          ...ws.teams.filter((t) => a.teamIds.includes(t.id)).flatMap((t) => t.members),
        ].map((m) => m.personId),
      );
      const warned = [
        ...new Set(
          warnings(weeks, ws)
            .filter((w) => w.kind === 'above-fte' && inArea.has(w.personId))
            .map((w) => w.monday),
        ),
      ].sort();
      expect(stripWeeks).toEqual(warned);
    }
  });

  it('has missing area hours as one hint per person and area', () => {
    const ws = areaWorkspace() as unknown as Workspace;
    const list = areaHints(loadPerWeek(ws, noIndex()), ws);
    const keys = list.map((h) => `${h.personId}/${h.areaId}`);
    expect(new Set(keys).size).toBe(keys.length);
    // POs and Scrum Masters invited from every team, without hours in Payments.
    expect(list.filter((h) => h.kind === 'no-area-hours').map((h) => h.personId)).toEqual(
      expect.arrayContaining(['person-sam', 'person-kim', 'person-mo']),
    );
    expect(list.some((h) => h.personId === 'person-ruth')).toBe(false);
  });
});

describe('areaMeetingHours', () => {
  it('counts every attendee, including "from every team", per week', () => {
    const ws = workspace([
      team('alpha', sprint(2), { members: [{ personId: 'p1', roleId: 'po' }] }),
      team('beta', sprint(2), {
        members: [
          { personId: 'p2', roleId: 'po' },
          { personId: 'p1', roleId: 'po' },
        ],
      }),
    ]);
    const a = area(['alpha', 'beta']);
    a.members = [{ personId: 'p3', roleId: 'pm' }];
    a.events = [
      {
        id: 'forum',
        name: 'PO forum',
        categoryId: 'c1',
        rule: { type: 'weekly', weekday: 2 },
        time: '10:00',
        duration: 60,
        participants: [
          { roleId: 'pm', share: 1 },
          { roleId: 'po', share: 1, fromTeams: true },
        ],
        preparation: 0.5,
      },
      {
        id: 'once',
        name: 'Kick-off',
        categoryId: 'c1',
        rule: { type: 'once', date: '2027-01-05' },
        time: '10:00',
        duration: 60,
        participants: [{ roleId: 'pm', share: 1 }],
        preparation: 0,
      },
    ];
    ws.areas = [a];
    const [forum, once] = areaMeetingHours(ws, a);
    // 1.5 h each for the PM and the two distinct POs.
    expect(forum).toMatchObject({
      perWeek: 4.5,
      recurring: true,
      attendees: [['p3'], ['p1', 'p2']],
    });
    expect(once).toMatchObject({ perWeek: 0, recurring: false });
  });
});

describe('zeroHourMembers (#446)', () => {
  it('names the members with 0 h in the team, each once', () => {
    const ws = areaWorkspace() as unknown as Workspace;
    const gamma = ws.teams.find((t) => t.id === 'team-gamma')!;
    expect(zeroHourMembers(ws, gamma)).toEqual([]);
    gamma.memberHours = { 'person-kim': 0, 'person-lou': 20 };
    gamma.members.push({ personId: 'person-kim', roleId: 'role-po' });
    expect(zeroHourMembers(ws, gamma)).toEqual(['person-kim']);
  });
});
