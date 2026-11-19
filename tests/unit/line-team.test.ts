import { describe, expect, it } from 'vitest';
import valid from '../fixtures/valid-workspace.json';
import {
  lineSelection,
  linePeople,
  selectedLineUnit,
  unitLoadIds,
  unitTeamIds,
  type CalEvent,
  type Team,
  type Workspace,
} from '../../src/core/model';
import { capacity, loadPerWeek } from '../../src/core/load';
import { filteredOccurrences, loadSummary, scopePeople, scopeUnits } from '../../src/core/views';
import {
  childUnits,
  hasHint,
  isLineGroup,
  lineTree,
  parentChoices,
  staffRows,
  unitStats,
} from '../../src/core/lineStaff';
import {
  addLineUnit,
  addSkill,
  addSkillFamily,
  mergeSkill,
  renameSkill,
  skillUsage,
  updateLinePerson,
  updateLineUnit,
} from '../../src/core/lineEdit';
import type { HolidayIndex } from '../../src/core/regions';

const noIndex = (): HolidayIndex => ({
  holidays: new Map(),
  schoolHolidays: new Map(),
  beyondKnown: false,
});

const weekly = (id: string, minutes: number): CalEvent => ({
  id,
  name: id,
  categoryId: 'c1',
  rule: { type: 'weekly', weekday: 2 },
  time: '10:00',
  duration: minutes,
  participants: [{ roleId: 'r1', share: 1 }],
  preparation: 0,
});

/**
 * A group "Orvalis" with the line team "Orvalis Ware" (Ines, Kai) and Lou in the group itself.
 * Team A: Alex (no line) and Ines; Team B: Kai and Ines. Each team has a weekly 60-minute meeting.
 */
function lined(): Workspace {
  const ws = structuredClone(valid) as unknown as Workspace;
  ws.settings.horizon = { from: '2026-11-09', to: '2026-12-06' };
  const t1 = ws.teams[0]!;
  t1.cycles = [];
  t1.events = [weekly('e1', 60)];
  t1.members.push({ personId: 'p2', roleId: 'r1' });
  t1.memberHours = { p1: 32, p2: 20 };
  const t2: Team = {
    ...structuredClone(t1),
    id: 't2',
    name: 'Team B',
    members: [
      { personId: 'p3', roleId: 'r1' },
      { personId: 'p2', roleId: 'r1' },
    ],
    memberHours: { p3: 40, p2: 30 },
    events: [weekly('e2', 60)],
  };
  ws.teams.push(t2);
  ws.people.push({ id: 'p2', name: 'Ines', lineUnitId: 'l1', contractFte: 1 });
  ws.people.push({ id: 'p3', name: 'Kai', lineUnitId: 'l1', contractFte: 0.8 });
  ws.people.push({ id: 'p4', name: 'Lou', lineUnitId: 'g1' });
  ws.skillFamilies = [{ id: 'f1', name: 'Orvalis' }];
  ws.skills = [
    { id: 's1', name: 'Lager', familyId: 'f1' },
    { id: 's2', name: 'Lagerei', familyId: 'f1' },
  ];
  ws.people[2]!.skillIds = ['s1', 's2'];
  ws.lineUnits = [
    { id: 'g1', name: 'Orvalis', skillFamilyId: 'f1' },
    { id: 'l1', name: 'Orvalis Ware', parentId: 'g1', managerPersonId: 'p2' },
  ];
  return ws;
}

const ok = <T>(r: { ok: true; value: T } | { ok: false; errors: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

describe('line unit as the selection (#316)', () => {
  it('has its own id space', () => {
    expect(selectedLineUnit(lineSelection('l1'))).toBe('l1');
    expect(selectedLineUnit('l1')).toBeUndefined();
    expect(selectedLineUnit(null)).toBeUndefined();
  });

  it('a group has the people of its line teams and its own', () => {
    const ws = lined();
    expect([...linePeople(ws, 'g1')].sort()).toEqual(['p2', 'p3', 'p4']);
    expect([...linePeople(ws, 'l1')].sort()).toEqual(['p2', 'p3']);
  });

  it('stands for the teams its people are in', () => {
    const ws = lined();
    expect(unitTeamIds(ws, lineSelection('l1'))).toEqual(['t1', 't2']);
    expect(unitLoadIds(ws, lineSelection('l1'))).toEqual(['t1', 't2']);
    expect(scopeUnits(ws, { teamId: lineSelection('l1') }).map((u) => u.id)).toEqual(['t1', 't2']);
  });

  it('is about its own people only, not everyone in their teams', () => {
    const ws = lined();
    const filter = { teamId: lineSelection('l1') };
    expect([...scopePeople(ws, filter)].sort()).toEqual(['p2', 'p3']);
    // Team A's meeting counts Ines but not Alex; Team B's counts Ines and Kai.
    const occ = filteredOccurrences(ws, noIndex(), filter);
    const first = (team: string) => occ.find((o) => o.teamId === team)!.hours;
    expect(first('t1')).toBe(1);
    expect(first('t2')).toBe(2);
    const dev = loadSummary(ws, filter).byRole.find((r) => r.roleId === 'r1')!;
    expect(dev.people).toBe(2);
    // Hours are all the people's hours, the same as in every other scope.
    expect(dev.weekly).toBe(50 + 40);
  });

  it('measures a person on all their hours', () => {
    const ws = lined();
    expect(capacity(ws, 'p2', lineSelection('l1'))).toBe(50);
    expect(capacity(ws, 'p2', 't1')).toBe(20);
  });
});

describe('line staff (#316)', () => {
  it('lists people with contract, commitments, free FTE and hints', () => {
    const ws = lined();
    const weeks = loadPerWeek(ws, noIndex());
    const rows = staffRows(ws, 'l1', weeks);
    expect(rows.map((r) => r.person.name)).toEqual(['Ines', 'Kai']);
    const ines = rows[0]!;
    expect(ines.contract).toBe(1);
    expect(ines.commitments.map((c) => [c.name, c.fte, c.meetings])).toEqual([
      ['Team A', 0.5, 1],
      ['Team B', 0.75, 1],
    ]);
    expect(ines.free).toBe(-0.25);
    expect(hasHint(ines)).toBe(true);
    const kai = rows[1]!;
    expect(kai.free).toBe(-0.2);
    const stats = unitStats(rows);
    expect(stats).toEqual({ people: 2, contract: 1.8, committed: 2.25, free: -0.45, hinted: 2 });
  });

  it('flags over the limit as the Load view does', () => {
    const ws = lined();
    ws.teams[0]!.events[0]!.duration = 60 * 40;
    const rows = staffRows(ws, 'l1', loadPerWeek(ws, noIndex()));
    expect(rows.find((r) => r.person.id === 'p2')!.overLimit).toBe(true);
    expect(rows.find((r) => r.person.id === 'p3')!.overLimit).toBe(false);
  });

  it('knows groups, line teams and the tree', () => {
    const ws = lined();
    expect(isLineGroup(ws, 'g1')).toBe(true);
    expect(isLineGroup(ws, 'l1')).toBe(false);
    expect(childUnits(ws).map((u) => u.id)).toEqual(['g1']);
    expect(lineTree(ws).map((x) => [x.unit.id, x.depth])).toEqual([
      ['g1', 0],
      ['l1', 1],
    ]);
  });

  it('offers only parents that keep three levels and no cycle', () => {
    const [ws] = ok(addLineUnit(lined(), 'Ware Nord', 'l1'));
    // g1 → l1 → lu1: three levels.
    expect(parentChoices(ws, 'g1').map((u) => u.id)).toEqual([]);
    expect(parentChoices(ws, 'l1').map((u) => u.id)).toEqual(['g1']);
    expect(parentChoices(ws, 'lu1').map((u) => u.id)).toEqual(['g1', 'l1']);
    expect(parentChoices(ws, undefined).map((u) => u.id)).toEqual(['g1', 'l1']);
  });
});

describe('editing the line (#316)', () => {
  it('adds, renames, moves and empties line units', () => {
    const [w1, id] = ok(addLineUnit(lined(), '  Orvalis Geld ', 'g1'));
    expect(w1.lineUnits!.at(-1)).toEqual({ id, name: 'Orvalis Geld', parentId: 'g1' });
    const w2 = ok(updateLineUnit(w1, id, { name: 'Geld', parentId: null, managerPersonId: 'p3' }));
    expect(w2.lineUnits!.at(-1)).toEqual({ id, name: 'Geld', managerPersonId: 'p3' });
    expect(updateLineUnit(w2, 'g1', { parentId: 'l1' }).ok).toBe(false);
    expect(addLineUnit(w2, ' ').ok).toBe(false);
  });

  it('manages skills: add, rename, merge with usage', () => {
    const [w1, fam] = ok(addSkillFamily(lined(), 'Infrastruktur'));
    const [w2, sk] = ok(addSkill(w1, fam, 'Netzbau'));
    expect(w2.skills!.at(-1)).toEqual({ id: sk, name: 'Netzbau', familyId: fam });
    expect(addSkill(w2, fam, 'lager').ok).toBe(false);
    const w3 = ok(renameSkill(w2, 's1', 'Lagerlogik'));
    expect(w3.skills![0]!.name).toBe('Lagerlogik');
    w3.teams[0]!.demands = [{ id: 'd1', skillId: 's2', fte: 1, roleId: 'r1' }];
    expect(skillUsage(w3, 's2')).toEqual({ people: 1, demands: 1 });
    const w4 = ok(mergeSkill(w3, 's2', 's1'));
    expect(w4.skills!.map((s) => s.id)).toEqual(['s1', sk]);
    expect(w4.people[2]!.skillIds).toEqual(['s1']);
    expect(w4.teams[0]!.demands![0]!.skillId).toBe('s1');
  });

  it("sets a person's line fields", () => {
    const w = ok(
      updateLinePerson(lined(), 'p1', { lineUnitId: 'l1', contractFte: 0.5, skillIds: ['s1'] }),
    );
    expect(w.people[0]).toMatchObject({ lineUnitId: 'l1', contractFte: 0.5, skillIds: ['s1'] });
    const back = ok(
      updateLinePerson(w, 'p1', { lineUnitId: null, contractFte: null, skillIds: [] }),
    );
    expect(back.people[0]).toEqual({ id: 'p1', name: 'Alex' });
    expect(updateLinePerson(w, 'p1', { contractFte: 1.5 }).ok).toBe(false);
  });
});
