import { describe, expect, it } from 'vitest';
import { costSummary, meetingCost, unitCostSummary } from '../../src/core/cost';
import { removeItem } from '../../src/core/edit';
import { exportIcs, scopeHasEvents } from '../../src/core/ics';
import {
  areaHours,
  capacity,
  loadPerWeek,
  warnings,
  weeklyHoursByPerson,
} from '../../src/core/load';
import {
  areaAsTeam,
  attendees,
  emptyWorkspace,
  missingRoles,
  unitLoadIds,
  type Area,
  type CalEvent,
  type Team,
  type Workspace,
} from '../../src/core/model';
import { occurrences } from '../../src/core/recurrence';
import type { HolidayIndex } from '../../src/core/regions';
import { validate } from '../../src/core/validate';

const noIndex = (): HolidayIndex => ({
  holidays: new Map(),
  schoolHolidays: new Map(),
  beyondKnown: false,
});

const team = (id: string, members: [string, string][], events: CalEvent[] = []): Team => ({
  id,
  name: id,
  cadence: { kind: 'sprint', lengthWeeks: 2, start: '2027-01-04' },
  members: members.map(([personId, roleId]) => ({ personId, roleId })),
  memberHours: {},
  assumptions: {},
  cycles: [],
  events,
});

/** PO forum: Mondays 1 h, "PO from every team" plus the head of area. */
const forum = (extra: Partial<CalEvent> = {}): CalEvent => ({
  id: 'e1',
  name: 'PO forum',
  categoryId: 'c1',
  rule: { type: 'weekly', weekday: 1 },
  time: '10:00',
  duration: 60,
  participants: [
    { roleId: 'po', share: 1, fromTeams: true },
    { roleId: 'head', share: 1 },
  ],
  preparation: 0,
  ...extra,
});

/**
 * Alex is PO in Alpha (20 h) and Beta (18 h), Bo is PO in Gamma, Dev only develops in Alpha,
 * Hana heads the area with 10 h there. The area holds Alpha, Beta and Gamma.
 */
function workspace(events: CalEvent[] = [forum()]): Workspace {
  const ws = emptyWorkspace('2027-01-04');
  ws.settings.horizon = { from: '2027-01-04', to: '2027-01-31' }; // four Mondays
  ws.settings.hourlyRate = 100;
  ws.roles = [
    { id: 'po', name: 'Product Owner', colour: '#2563eb' },
    { id: 'dev', name: 'Developer', colour: '#16a34a' },
    { id: 'sm', name: 'Scrum Master', colour: '#9333ea' },
    { id: 'head', name: 'Head of area', colour: '#0b7a6b' },
  ];
  ws.people = ['alex', 'bo', 'dev', 'hana'].map((id) => ({ id, name: id }));
  ws.categories = [{ id: 'c1', name: 'Sync', colour: '#2563eb' }];
  ws.teams = [
    {
      ...team('alpha', [
        ['alex', 'po'],
        ['dev', 'dev'],
      ]),
      memberHours: { alex: 20 },
    },
    { ...team('beta', [['alex', 'po']]), memberHours: { alex: 18 } },
    team('gamma', [['bo', 'po']]),
  ];
  const area: Area = {
    id: 'area',
    name: 'Platform',
    teamIds: ['alpha', 'beta', 'gamma'],
    members: [{ personId: 'hana', roleId: 'head' }],
    memberHours: { hana: 10 },
    cycles: [],
    events,
  };
  ws.areas = [area];
  return ws;
}

describe('attendees', () => {
  it('resolves "from every team" to everyone with the role in the teams, each once', () => {
    const ws = workspace();
    const [po, head] = ws.areas[0]!.events[0]!.participants;
    expect(attendees(ws, 'area', po!)).toEqual(['alex', 'bo']);
    expect(attendees(ws, 'area', head!)).toEqual(['hana']);
  });

  it('without fromTeams only counts the area members with the role', () => {
    const ws = workspace();
    expect(attendees(ws, 'area', { roleId: 'po', share: 1 })).toEqual([]);
  });

  it('follows the teams as they change', () => {
    const ws = workspace();
    ws.areas[0]!.teamIds = ['gamma'];
    expect(attendees(ws, 'area', { roleId: 'po', share: 1, fromTeams: true })).toEqual(['bo']);
  });

  it('in a team means the team members with the role', () => {
    const ws = workspace();
    expect(attendees(ws, 'alpha', { roleId: 'dev', share: 1 })).toEqual(['dev']);
  });
});

describe('missingRoles', () => {
  it('names each team without anyone in an invited role', () => {
    const ws = workspace([
      forum({
        participants: [
          { roleId: 'po', share: 1, fromTeams: true },
          { roleId: 'sm', share: 1, fromTeams: true },
          { roleId: 'dev', share: 1 },
        ],
      }),
    ]);
    ws.teams[2]!.members = [];
    expect(missingRoles(ws, ws.areas[0]!, ws.areas[0]!.events[0]!)).toEqual([
      { teamId: 'gamma', roleId: 'po' },
      { teamId: 'alpha', roleId: 'sm' },
      { teamId: 'beta', roleId: 'sm' },
      { teamId: 'gamma', roleId: 'sm' },
    ]);
  });
});

describe('area meetings in the load', () => {
  it('count for the area, never for a team', () => {
    const ws = workspace();
    const week = loadPerWeek(ws, noIndex())[0]!;
    expect(week.byTeamPerson.area).toEqual({ alex: 1, bo: 1, hana: 1 });
    expect(week.byTeamPerson.alpha).toBeUndefined();
    expect(week.byTeamRole.area).toEqual({ po: 1, head: 1 });
    expect(week.byPerson.alex).toBe(1);
    expect(week.regularByPerson.alex).toBe(1);
  });

  it('weeklyHoursByPerson gives the recurring hours per attendee', () => {
    expect(weeklyHoursByPerson(workspace(), 'area')).toEqual({ alex: 1, bo: 1, hana: 1 });
    expect(weeklyHoursByPerson(workspace(), 'nope')).toEqual({});
  });

  it('an area without a cadence never matches a cadence-day rule', () => {
    const ws = workspace([forum({ rule: { type: 'cadence-day', day: 0 } })]);
    expect(occurrences(areaAsTeam(ws.areas[0]!), ws.settings, noIndex())).toEqual([]);
  });
});

describe('area hours', () => {
  it('are 0 without an entry', () => {
    const ws = workspace();
    expect(areaHours(ws, 'area', 'hana')).toBe(10);
    expect(areaHours(ws, 'area', 'alex')).toBe(0);
  });

  it('add to the team hours of the area, and to the total', () => {
    const ws = workspace();
    ws.areas[0]!.memberHours.alex = 4;
    expect(capacity(ws, 'alex', 'area')).toBe(42);
    expect(capacity(ws, 'alex')).toBe(42);
    expect(capacity(ws, 'alex', 'alpha')).toBe(20);
    expect(capacity(ws, 'hana', 'area')).toBe(10);
    expect(capacity(ws, 'hana')).toBe(10);
    // Bo has no area hours and is in Gamma with the default 40 h.
    expect(capacity(ws, 'bo', 'area')).toBe(40);
  });

  it('a person only in the area without area hours has 0 h, also across the file (#265)', () => {
    const ws = workspace();
    ws.areas[0]!.memberHours = {};
    expect(ws.areas[0]!.members.some((m) => m.personId === 'hana')).toBe(true);
    expect(capacity(ws, 'hana', 'area')).toBe(0);
    expect(capacity(ws, 'hana')).toBe(0);
    // Someone in no team and no area keeps the workspace default.
    ws.areas[0]!.members = ws.areas[0]!.members.filter((m) => m.personId !== 'hana');
    expect(capacity(ws, 'hana')).toBe(40);
  });

  it('unitLoadIds counts the area teams and the area itself', () => {
    const ws = workspace();
    expect(unitLoadIds(ws, 'area')).toEqual(['alpha', 'beta', 'gamma', 'area']);
    expect(unitLoadIds(ws, 'alpha')).toEqual(['alpha']);
  });
});

describe('the FTE check for area meetings', () => {
  const fteWarned = (ws: Workspace) =>
    [
      ...new Set(
        warnings(loadPerWeek(ws, noIndex()), ws)
          .filter((w) => w.kind === 'above-fte')
          .map((w) => w.personId),
      ),
    ].sort();

  it('flags people invited from every team without area hours, whatever their team hours', () => {
    const ws = workspace();
    expect(fteWarned(ws)).toEqual(['alex', 'bo']);
  });

  it('is quiet once they have area hours', () => {
    const ws = workspace();
    ws.areas[0]!.memberHours = { hana: 10, alex: 4, bo: 2 };
    expect(fteWarned(ws)).toEqual([]);
  });

  it('a PO forum does not raise the load of a team', () => {
    const ws = workspace();
    const week = loadPerWeek(ws, noIndex())[0]!;
    expect(week.byTeamPerson.alpha?.alex ?? 0).toBe(0);
  });
});

describe('area meeting costs', () => {
  it('count everyone a participant stands for', () => {
    const ws = workspace();
    const area = areaAsTeam(ws.areas[0]!);
    // (2 POs + 1 head) x 1 h x 100 €
    expect(meetingCost(ws, area, forum(), 60, 100)).toBe(300);
  });

  it('are in the summary of the area and of all, not of one team', () => {
    const ws = workspace();
    expect(costSummary(ws, noIndex(), {}, 100).perWeek).toBe(300);
    expect(costSummary(ws, noIndex(), { teamId: 'area' }, 100).perWeek).toBe(300);
    expect(costSummary(ws, noIndex(), { teamId: 'alpha' }, 100).perWeek).toBe(0);
    expect(costSummary(ws, noIndex(), { personId: 'alex' }, 100).perWeek).toBe(100);
    expect(costSummary(ws, noIndex(), { personId: 'dev' }, 100).perWeek).toBe(0);
  });
});

describe('area meetings in the iCalendar export', () => {
  const opts = (scope: object) => ({
    scope,
    from: '2027-01-04',
    to: '2027-01-31',
    reminderMinutes: null,
    allDay: { holidays: false, schoolHolidays: false, milestones: false },
    now: new Date('2027-01-01T00:00:00Z'),
    locale: 'en' as const,
  });

  it('the area calendar holds its own meetings only', () => {
    const ws = workspace();
    ws.teams[0]!.events = [{ ...forum(), id: 'e9', name: 'Daily', participants: [] }];
    const text = exportIcs(ws, noIndex(), opts({ teamId: 'area' }));
    expect(text).toContain('SUMMARY:PO forum');
    expect(text).not.toContain('SUMMARY:Daily');
    expect(text).toContain('DESCRIPTION:Platform');
  });

  it('a person calendar includes the area meetings they are invited to', () => {
    const ws = workspace();
    expect(exportIcs(ws, noIndex(), opts({ personId: 'bo' }))).toContain('SUMMARY:PO forum');
    expect(scopeHasEvents(ws, { personId: 'bo' })).toBe(true);
    expect(scopeHasEvents(ws, { personId: 'dev' })).toBe(false);
  });
});

describe('validating fromTeams', () => {
  it('is allowed in area events', () => {
    expect(validate(workspace()).ok).toBe(true);
  });

  it('is refused in team events', () => {
    const ws = workspace([]);
    ws.teams[0]!.events = [forum({ participants: [{ roleId: 'po', share: 1, fromTeams: true }] })];
    const result = validate(ws);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors).toContainEqual({
        path: 'teams.0.events.0.participants.0.fromTeams',
        key: 'error.fromTeams.team',
      });
  });

  it('must be a boolean', () => {
    const ws = workspace([
      forum({ participants: [{ roleId: 'po', share: 1, fromTeams: 'yes' as unknown as boolean }] }),
    ]);
    const result = validate(ws);
    expect(result.ok).toBe(false);
  });
});

describe('area page costs', () => {
  it('count only the unit own meetings', () => {
    const ws = workspace();
    ws.teams[0]!.events = [{ ...forum(), id: 'e9', participants: [{ roleId: 'dev', share: 1 }] }];
    expect(unitCostSummary(ws, noIndex(), areaAsTeam(ws.areas[0]!), 100).perWeek).toBe(300);
    expect(costSummary(ws, noIndex(), { teamId: 'area' }, 100).perWeek).toBe(400);
  });
});

describe('replacing a role in an area meeting', () => {
  it('keeps "from every team" when two entries merge', () => {
    const ws = workspace();
    const result = removeItem(ws, 'roles', 'po', 'head');
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.areas[0]!.events[0]!.participants).toEqual([
        { roleId: 'head', share: 1, fromTeams: true },
      ]);
  });
});
