import { describe, expect, it } from 'vitest';
import valid from '../fixtures/valid-workspace.json';
import { REGIONS, regionIds } from '../../src/data/regions';
import {
  cadenceNumber,
  conflicts,
  dayLoad,
  filteredOccurrences,
  loadSummary,
  schoolHolidayGap,
  scopeTeams,
  weekRows,
  workspaceIndex,
} from '../../src/core/views';
import { emptyWorkspace, type CalEvent, type Team, type Workspace } from '../../src/core/model';

const base = (): Workspace => structuredClone(valid) as unknown as Workspace;

const ev = (id: string, time: string, duration: number, roleId = 'r1', share = 1): CalEvent => ({
  id,
  name: id,
  categoryId: 'c1',
  rule: { type: 'once', date: '2026-12-02' },
  time,
  duration,
  participants: [{ roleId, share }],
  preparation: 0,
});

function twoTeams(a: CalEvent, b: CalEvent): Workspace {
  const ws = base();
  const t1 = ws.teams[0]!;
  t1.events = [a];
  t1.cycles = [];
  const t2: Team = { ...structuredClone(t1), id: 't2', name: 'Team B', events: [b] };
  ws.teams.push(t2);
  return ws;
}

describe('region registry', () => {
  it('registers de-sn', () => {
    expect(regionIds()).toContain('de-sn');
    expect(REGIONS['de-sn']?.id).toBe('de-sn');
  });
});

describe('workspaceIndex', () => {
  it('marks 2026-12-25 for de-sn', () => {
    const ws = base();
    expect(workspaceIndex(ws).holidays.has('2026-12-25')).toBe(true);
  });
  it('gives empty maps for an unknown region', () => {
    const ws = base();
    ws.settings.region = 'xx';
    const idx = workspaceIndex(ws);
    expect(idx.holidays.size).toBe(0);
    expect(idx.schoolHolidays.size).toBe(0);
    expect(idx.beyondKnown).toBe(true);
    expect(weekRows(ws, idx, {}).length).toBeGreaterThan(0);
    // No coverage note for an unknown region: there is no date to name.
    expect(schoolHolidayGap(ws, idx)).toBeNull();
  });

  it('names the region whose school holidays end before the horizon', () => {
    const ws = base();
    ws.settings.region = 'de-sn';
    ws.settings.horizon = { from: '2027-01-01', to: '2027-12-31' };
    expect(schoolHolidayGap(ws, workspaceIndex(ws))).toBeNull();
    ws.settings.horizon.to = '2028-12-31';
    expect(schoolHolidayGap(ws, workspaceIndex(ws))?.schoolHolidaysKnownUntil).toBe('2028-09-01');
  });
});

describe('filteredOccurrences', () => {
  const setup = () => {
    const ws = base();
    ws.roles.push({ id: 'r2', name: 'PO', colour: '#112233' });
    const team = ws.teams[0]!;
    team.members.push({ personId: 'p1', roleId: 'r2' });
    team.events = [
      {
        ...ev('both', '09:00', 60, 'r1'),
        participants: [
          { roleId: 'r1', share: 1 },
          { roleId: 'r2', share: 0.5 },
        ],
      },
      ev('devonly', '11:00', 60, 'r1'),
    ];
    return ws;
  };
  it('person filter uses share of the held role', () => {
    const ws = setup();
    ws.teams[0]!.members = [{ personId: 'p1', roleId: 'r2' }];
    const out = filteredOccurrences(ws, workspaceIndex(ws), { personId: 'p1' });
    expect(out.map((o) => [o.eventId, o.hours])).toEqual([['both', 0.5]]);
  });
  it('role filter drops events without that role', () => {
    const ws = setup();
    const out = filteredOccurrences(ws, workspaceIndex(ws), { roleId: 'r2' });
    expect(out.map((o) => o.eventId)).toEqual(['both']);
  });
  it('sums all roles without person/role filter', () => {
    const ws = setup();
    const out = filteredOccurrences(ws, workspaceIndex(ws), { teamId: 't1' });
    expect(out.find((o) => o.eventId === 'both')?.hours).toBeCloseTo(1.5);
  });
  it('person filter ignores teamId and wins over roleId', () => {
    const ws = setup();
    ws.teams[0]!.members = [{ personId: 'p1', roleId: 'r2' }];
    const out = filteredOccurrences(ws, workspaceIndex(ws), {
      personId: 'p1',
      teamId: 'other',
      roleId: 'r1',
    });
    expect(out.map((o) => o.eventId)).toEqual(['both']);
  });
  it('keeps skipped holidays with 0 hours', () => {
    const ws = setup();
    ws.teams[0]!.events = [
      { ...ev('xmas', '09:00', 60), rule: { type: 'once', date: '2026-12-25' } },
    ];
    const out = filteredOccurrences(ws, workspaceIndex(ws), {});
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ hours: 0 });
    expect(out[0]?.skippedHoliday).toBeDefined();
  });
});

describe('dayLoad', () => {
  it('is 0 on a skipped holiday', () => {
    const ws = base();
    ws.teams[0]!.events = [
      { ...ev('xmas', '09:00', 60), rule: { type: 'once', date: '2026-12-25' } },
    ];
    expect(dayLoad(ws, workspaceIndex(ws), {}).get('2026-12-25') ?? 0).toBe(0);
  });
  it('sums hours per day', () => {
    const ws = base();
    ws.teams[0]!.events = [ev('a', '09:00', 60)];
    expect(dayLoad(ws, workspaceIndex(ws), {}).get('2026-12-02')).toBe(1);
  });
});

describe('cadenceNumber', () => {
  const team = base().teams[0]!;
  it('counts from the start date', () => {
    expect(cadenceNumber(team, '2026-11-09')).toBe(1);
    expect(cadenceNumber(team, '2026-11-22')).toBe(1);
    expect(cadenceNumber(team, '2026-11-23')).toBe(2);
    expect(cadenceNumber(team, '2026-11-08')).toBeUndefined();
  });
});

describe('weekRows', () => {
  it('has one row per Monday with cadence, milestones, holidays', () => {
    const ws = base();
    ws.teams[0]!.events = [ev('a', '09:00', 60)];
    const rows = weekRows(ws, workspaceIndex(ws), {});
    expect(rows[0]!.monday).toBe('2026-11-02');
    expect(rows.every((r, i) => i === 0 || r.monday > rows[i - 1]!.monday)).toBe(true);
    const w = rows.find((r) => r.monday === '2026-11-30')!;
    expect(w.milestones).toEqual([
      {
        teamId: 't1',
        cycleId: expect.any(String),
        id: expect.any(String),
        name: 'Freeze',
        date: '2026-12-01',
      },
    ]);
    expect(w.byRole).toEqual({ r1: 1 });
    expect(w.total).toBe(1);
    expect(rows.find((r) => r.monday === '2026-11-09')!.cadence).toEqual([
      { teamId: 't1', number: 1 },
    ]);
    expect(rows.find((r) => r.monday === '2026-11-16')!.cadence).toEqual([]);
    expect(rows.find((r) => r.monday === '2026-11-23')!.cadence).toEqual([
      { teamId: 't1', number: 2 },
    ]);
    expect(rows.find((r) => r.monday === '2026-12-21')!.holidays.map((h) => h.date)).toContain(
      '2026-12-25',
    );
    expect(rows.find((r) => r.monday === '2026-12-21')!.week).toBe(52);
  });
  it('has empty cadence when the horizon ends before the cadence starts', () => {
    const ws = base();
    ws.settings.horizon = { from: '2026-01-05', to: '2026-03-01' };
    const rows = weekRows(ws, workspaceIndex(ws), {});
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.cadence.length === 0)).toBe(true);
  });
  it('handles no teams and an inverted horizon', () => {
    const ws = emptyWorkspace('2026-11-07');
    expect(weekRows(ws, workspaceIndex(ws), {}).every((r) => r.total === 0)).toBe(true);
    ws.settings.horizon = { from: '2026-11-07', to: '2026-01-01' };
    expect(weekRows(ws, workspaceIndex(ws), {})).toEqual([]);
  });
  it('scopes cadence and milestones to the teams of the person filter', () => {
    const ws = twoTeams(ev('a', '09:00', 60), ev('b', '09:00', 60));
    ws.people.push({ id: 'p2', name: 'Other', hoursPerWeek: 40 });
    const [t1, t2] = ws.teams as [Team, Team];
    t1.members = [{ personId: 'p1', roleId: 'r1' }];
    t1.cycles = structuredClone(valid.teams[0]!.cycles) as Team['cycles'];
    t2.members = [{ personId: 'p2', roleId: 'r1' }];
    t2.cycles = [
      {
        id: 'cy2',
        name: 'C2',
        milestones: [{ id: 'm2', name: 'Other freeze', date: '2026-12-01' }],
      },
    ];
    const idx = workspaceIndex(ws);
    const week = (f: Parameters<typeof weekRows>[2]) =>
      weekRows(ws, idx, f).find((r) => r.monday === '2026-11-09')!;
    expect(week({}).cadence.map((c) => c.teamId)).toEqual(['t1', 't2']);
    expect(week({ personId: 'p1' }).cadence.map((c) => c.teamId)).toEqual(['t1']);
    expect(week({ teamId: 't2' }).cadence.map((c) => c.teamId)).toEqual(['t2']);
    const dec = (f: Parameters<typeof weekRows>[2]) =>
      weekRows(ws, idx, f)
        .find((r) => r.monday === '2026-11-30')!
        .milestones.map((m) => m.teamId);
    expect(dec({ personId: 'p1' })).toEqual(['t1']);
    expect(dec({ personId: 'p2' })).toEqual(['t2']);
    expect(dec({ personId: 'nobody' })).toEqual([]);
  });
  it('scopeTeams: person wins over teamId, otherwise team filter, otherwise all', () => {
    const ws = twoTeams(ev('a', '09:00', 60), ev('b', '09:00', 60));
    ws.teams[1]!.members = [];
    expect(scopeTeams(ws, {}).map((t) => t.id)).toEqual(['t1', 't2']);
    expect(scopeTeams(ws, { teamId: 't2' }).map((t) => t.id)).toEqual(['t2']);
    expect(scopeTeams(ws, { personId: 'p1', teamId: 't2' }).map((t) => t.id)).toEqual(['t1']);
  });
  it('reports school holidays', () => {
    const ws = base();
    const rows = weekRows(ws, workspaceIndex(ws), {});
    expect(rows.some((r) => r.schoolHoliday)).toBe(true);
  });
});

describe('conflicts', () => {
  it('reports overlapping meetings across two teams once', () => {
    const ws = twoTeams(ev('a', '09:00', 60), ev('b', '09:30', 30));
    const out = conflicts(ws, workspaceIndex(ws), 'p1');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: '2026-12-02' });
    expect(out[0]!.a.eventId).toBe('a');
    expect(out[0]!.b.eventId).toBe('b');
  });
  it('does not report meetings that only touch', () => {
    const ws = twoTeams(ev('a', '09:00', 60), ev('b', '10:00', 60));
    expect(conflicts(ws, workspaceIndex(ws), 'p1')).toEqual([]);
  });
  it('ignores holiday-skipped occurrences and unattended events', () => {
    const ws = twoTeams(
      { ...ev('a', '09:00', 60), rule: { type: 'once', date: '2026-12-25' } },
      { ...ev('b', '09:00', 60), rule: { type: 'once', date: '2026-12-25' } },
    );
    expect(conflicts(ws, workspaceIndex(ws), 'p1')).toEqual([]);
    expect(conflicts(ws, workspaceIndex(ws), 'nobody')).toEqual([]);
  });
  it('keeps wall-clock start across the DST change', () => {
    const ws = base();
    ws.settings.horizon = { from: '2027-03-01', to: '2027-04-30' };
    ws.teams[0]!.events = [{ ...ev('a', '09:00', 60), rule: { type: 'once', date: '2027-03-28' } }];
    const out = filteredOccurrences(ws, workspaceIndex(ws), {});
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: '2027-03-28', start: '09:00' });
  });
});

describe('loadSummary', () => {
  it('computes FTE 0.5 for 20 h at 40 h/week', () => {
    const ws = base();
    ws.settings.hoursPerWeek = 40;
    ws.teams[0]!.events = [{ ...ev('w', '09:00', 1200), rule: { type: 'weekly', weekday: 1 } }];
    const s = loadSummary(ws, {});
    expect(s.byRole).toEqual([{ roleId: 'r1', hours: 20, percent: 50, fte: 0.5 }]);
    expect(s.byCategory).toEqual([{ categoryId: 'c1', hours: 20 }]);
  });
  it('has a category by role matrix that sums to the totals', () => {
    const ws = base();
    ws.roles.push({ id: 'r2', name: 'PO', colour: '#112233' });
    ws.categories.push({ id: 'c2', name: 'Other', colour: '#778899' });
    ws.teams[0]!.events = [
      {
        ...ev('w', '09:00', 120),
        rule: { type: 'weekly', weekday: 1 },
        participants: [
          { roleId: 'r1', share: 1 },
          { roleId: 'r2', share: 0.5 },
        ],
      },
      { ...ev('x', '10:00', 60), categoryId: 'c2', rule: { type: 'weekly', weekday: 2 } },
    ];
    const s = loadSummary(ws, {});
    expect(s.matrix).toEqual({ c1: { r1: 2, r2: 1 }, c2: { r1: 1 } });
    expect(s.byCategory).toEqual([
      { categoryId: 'c1', hours: 3 },
      { categoryId: 'c2', hours: 1 },
    ]);
    expect(loadSummary(ws, { roleId: 'r2' }).matrix).toEqual({ c1: { r2: 1 } });
  });
  it('lists zero entries for used roles and categories, in workspace order', () => {
    const ws = base();
    ws.roles.push({ id: 'r2', name: 'PO', colour: '#112233' });
    ws.roles.push({ id: 'r3', name: 'Unused', colour: '#445566' });
    ws.categories.push({ id: 'c2', name: 'Other', colour: '#778899' });
    ws.teams[0]!.events = [ev('once', '09:00', 60, 'r2')];
    const s = loadSummary(ws, {});
    expect(s.byRole.map((r) => r.roleId)).toEqual(['r2']);
    expect(s.byRole[0]!.hours).toBe(0);
    expect(s.byCategory.map((c) => c.categoryId)).toEqual(['c1']);
  });
  it('sums a person across teams and handles hoursPerWeek 0', () => {
    const ws = twoTeams(
      { ...ev('a', '09:00', 60), rule: { type: 'weekly', weekday: 1 } },
      { ...ev('b', '09:00', 120), rule: { type: 'weekly', weekday: 2 } },
    );
    expect(loadSummary(ws, { personId: 'p1' }).byRole[0]!.hours).toBe(3);
    expect(loadSummary(ws, { teamId: 't2' }).byRole[0]!.hours).toBe(2);
    ws.settings.hoursPerWeek = 0;
    expect(loadSummary(ws, {}).byRole[0]).toMatchObject({ percent: 0, fte: 0 });
  });
});
