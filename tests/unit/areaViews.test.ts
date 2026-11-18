import { describe, expect, it } from 'vitest';
import valid from '../fixtures/valid-workspace.json';
import {
  conflicts,
  filteredOccurrences,
  loadSummary,
  scopePeople,
  scopeUnits,
  weekRows,
  workspaceIndex,
  type Filter,
} from '../../src/core/views';
import type { CalEvent, Participant, Team, Workspace } from '../../src/core/model';

const ev = (id: string, time: string, participants: Participant[]): CalEvent => ({
  id,
  name: id,
  categoryId: 'c1',
  rule: { type: 'once', date: '2026-12-02' },
  time,
  duration: 60,
  participants,
  preparation: 0,
});

/**
 * Team A (Alex, developer) and Team B (Bo, developer) in area "Unit" with Hana as its head.
 * The area has a forum with "developer from every team" and a steering meeting for its head.
 */
function areaWorkspace(): Workspace {
  const ws = structuredClone(valid) as unknown as Workspace;
  ws.roles.push({ id: 'r2', name: 'Head', colour: '#0b7a6b' });
  ws.people.push({ id: 'p2', name: 'Bo' }, { id: 'p3', name: 'Hana' });
  const t1 = ws.teams[0]!;
  t1.cycles = [];
  t1.events = [ev('a', '09:00', [{ roleId: 'r1', share: 1 }])];
  const t2: Team = {
    ...structuredClone(t1),
    id: 't2',
    name: 'Team B',
    members: [{ personId: 'p2', roleId: 'r1' }],
    events: [ev('b', '13:00', [{ roleId: 'r1', share: 1 }])],
  };
  ws.teams.push(t2);
  ws.areas = [
    {
      id: 'a1',
      name: 'Unit',
      teamIds: ['t1', 't2'],
      cadence: { kind: 'pi', lengthWeeks: 10, start: '2026-11-09' },
      members: [{ personId: 'p3', roleId: 'r2' }],
      memberHours: { p3: 8 },
      cycles: [],
      events: [
        ev('forum', '09:30', [{ roleId: 'r1', share: 1, fromTeams: true }]),
        ev('steer', '15:00', [{ roleId: 'r2', share: 1 }]),
      ],
    },
  ];
  return ws;
}

const shown = (ws: Workspace, filter: Filter): string[] =>
  filteredOccurrences(ws, workspaceIndex(ws), filter)
    .map((o) => `${o.teamId}/${o.eventId}`)
    .sort();

describe('area scope in Calendar and Load', () => {
  it('an area shows its own meetings and those of all its teams', () => {
    const ws = areaWorkspace();
    expect(shown(ws, { teamId: 'a1' })).toEqual(['a1/forum', 'a1/steer', 't1/a', 't2/b']);
    expect(scopeUnits(ws, { teamId: 'a1' }).map((u) => u.id)).toEqual(['t1', 't2', 'a1']);
  });

  it('a single team never shows area meetings', () => {
    const ws = areaWorkspace();
    expect(shown(ws, { teamId: 't1' })).toEqual(['t1/a']);
  });

  it('a person sees the area meetings they attend, also via "from every team"', () => {
    const ws = areaWorkspace();
    expect(shown(ws, { personId: 'p1' })).toEqual(['a1/forum', 't1/a']);
    expect(shown(ws, { personId: 'p3' })).toEqual(['a1/steer']);
  });

  it('a role filter in the area keeps only that role', () => {
    const ws = areaWorkspace();
    expect(shown(ws, { teamId: 'a1', roleId: 'r2' })).toEqual(['a1/steer']);
  });

  it('the area counts its own people and every team member once', () => {
    const ws = areaWorkspace();
    ws.areas[0]!.members.push({ personId: 'p1', roleId: 'r2' });
    expect([...scopePeople(ws, { teamId: 'a1' })].sort()).toEqual(['p1', 'p2', 'p3']);
    expect([...scopePeople(ws, { teamId: 't1' })]).toEqual(['p1']);
  });

  it('the load summary adds area meetings only for the area or a person who attends', () => {
    const ws = areaWorkspace();
    const role = (filter: Filter, id: string): number =>
      loadSummary(ws, filter).byRole.find((r) => r.roleId === id)?.hours ?? 0;
    // One-off meetings have no weekly base load; make them weekly.
    for (const unit of [...ws.teams, ...ws.areas])
      for (const e of unit.events) e.rule = { type: 'weekly', weekday: 3 };
    // a + b + forum for both developers: every person counts, as for cost (#272).
    expect(role({ teamId: 'a1' }, 'r1')).toBe(4);
    expect(role({ teamId: 'a1' }, 'r2')).toBe(1);
    expect(role({ teamId: 't1' }, 'r1')).toBe(1);
    expect(role({ personId: 'p1' }, 'r1')).toBe(2);
    expect(role({ personId: 'p1' }, 'r2')).toBe(0);
  });

  it('marks the area cadence in the horizon table', () => {
    const ws = areaWorkspace();
    const starts = (filter: Filter): string[] =>
      weekRows(ws, workspaceIndex(ws), filter)
        .find((r) => r.monday === '2026-11-09')!
        .cadence.map((c) => c.teamId);
    expect(starts({ teamId: 'a1' })).toEqual(['t1', 't2', 'a1']);
    expect(starts({ teamId: 't1' })).toEqual(['t1']);
  });

  it('finds conflicts between a team meeting and an area meeting', () => {
    const ws = areaWorkspace();
    const out = conflicts(ws, workspaceIndex(ws), 'p1');
    expect(out.map((c) => [c.a.eventId, c.b.eventId])).toEqual([['a', 'forum']]);
  });
});
