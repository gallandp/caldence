import { describe, expect, it } from 'vitest';
import valid from '../fixtures/valid-workspace.json';
import { lineSelection, ORG_UNIT, type Team, type Workspace } from '../../src/core/model';
import { buildMatrix, cellPeople, matrixWorld } from '../../src/core/matrix';
import { lineExampleWorkspace } from '../../src/data/examples/line-example';

/**
 * Group "Orvalis" (g1) with the line teams "Ware" (l1: Ines, Kai) and "Kasse" (l2: Mo).
 * Platform "Hafen" holds Team A and Team B; Team C has no platform.
 * Team A: Alex (no line) 32 h, Ines 20 h. Team B: Kai 40 h (contract 0.8), Ines 10 h.
 * Team C: Mo 8 h. Team B asks for 2 FTE, of which Kai's assignment covers 1.
 */
function lined(): Workspace {
  const ws = structuredClone(valid) as unknown as Workspace;
  const a = ws.teams[0]!;
  a.members.push({ personId: 'p2', roleId: 'r1' });
  a.memberHours = { p1: 32, p2: 20 };
  const b: Team = {
    ...structuredClone(a),
    id: 't2',
    name: 'Team B',
    members: [
      { personId: 'p3', roleId: 'r1' },
      { personId: 'p2', roleId: 'r1' },
    ],
    memberHours: { p3: 40, p2: 10 },
    demands: [{ id: 'd1', roleId: 'r1', fte: 2 }],
  };
  const c: Team = {
    ...structuredClone(a),
    id: 't3',
    name: 'Team C',
    members: [{ personId: 'p5', roleId: 'r1' }],
    memberHours: { p5: 8 },
  };
  ws.teams.push(b, c);
  ws.areas = [
    {
      id: 'a1',
      name: 'Hafen',
      teamIds: ['t1', 't2'],
      members: [],
      memberHours: {},
      cycles: [],
      events: [],
    },
  ];
  ws.assignments = [{ id: 'as1', personId: 'p3', teamId: 't2', demandId: 'd1', fte: 1 }];
  ws.people.push(
    { id: 'p2', name: 'Ines', lineUnitId: 'l1' },
    { id: 'p3', name: 'Kai', lineUnitId: 'l1', contractFte: 0.8 },
    { id: 'p4', name: 'Lou', lineUnitId: 'l1' },
    { id: 'p5', name: 'Mo', lineUnitId: 'l2' },
  );
  ws.lineUnits = [
    { id: 'g1', name: 'Orvalis' },
    { id: 'l1', name: 'Ware', parentId: 'g1' },
    { id: 'l2', name: 'Kasse', parentId: 'g1' },
  ];
  return ws;
}

const ids = <T extends { id: string }>(xs: T[]) => xs.map((x) => x.id);

describe('matrix world (#396)', () => {
  it('a line unit is the line world, everything else the product world', () => {
    expect(matrixWorld(lineSelection('l1'))).toBe('line');
    expect(matrixWorld(ORG_UNIT)).toBe('product');
    expect(matrixWorld('t1')).toBe('product');
  });
});

describe('buildMatrix (#396)', () => {
  it('groups products under their platform, loose products last', () => {
    const m = buildMatrix(lined(), ORG_UNIT, 'product');
    expect(m.groups.map((g) => g.area?.name ?? null)).toEqual(['Hafen', null]);
    expect(m.groups.map((g) => g.columns.map((c) => c.team.id))).toEqual([['t1', 't2'], ['t3']]);
  });

  it('rows are the line teams with their group; cells are FTE from the membership hours', () => {
    const m = buildMatrix(lined(), ORG_UNIT, 'product');
    expect(m.rows.map((r) => [r.unit.name, r.group?.name])).toEqual([
      ['Ware', 'Orvalis'],
      ['Kasse', 'Orvalis'],
    ]);
    const ware = m.rows[0]!;
    expect(ware.cells).toEqual({ t1: 0.5, t2: 1.25 });
    expect(ids(ware.people.map((p) => p.person))).toEqual(['p2', 'p3', 'p4']);
    expect(ware.people[0]!.cells).toEqual({ t1: 0.5, t2: 0.25 });
  });

  it('Frei is the person free FTE; overbooked is negative; the row sums its people', () => {
    const ware = buildMatrix(lined(), ORG_UNIT, 'product').rows[0]!;
    // Ines 1 − 30/40 = 0.25, Kai 0.8 − 1 = −0.2, Lou 1.
    expect(ware.people.map((p) => p.free)).toEqual([0.25, -0.2, 1]);
    expect(ware.free).toBeCloseTo(1.05);
  });

  it('members without a line unit form the row "Ohne Linie" in the product world', () => {
    const m = buildMatrix(lined(), ORG_UNIT, 'product');
    expect(m.noLine?.cells).toEqual({ t1: 0.8 });
    expect(ids(m.noLine!.people.map((p) => p.person))).toEqual(['p1']);
    expect(buildMatrix(lined(), lineSelection('g1'), 'line').noLine).toBeUndefined();
  });

  it('open demand per product: what demands ask minus what is committed, none without demand', () => {
    const m = buildMatrix(lined(), ORG_UNIT, 'product');
    const open = Object.fromEntries(m.columns.map((c) => [c.team.id, c.open]));
    expect(open).toEqual({ t1: undefined, t2: 1, t3: undefined });
    expect(m.hasDemand).toBe(true);
  });

  it('product world: a platform filters the columns and keeps only line teams working there', () => {
    const m = buildMatrix(lined(), 'a1', 'product');
    expect(ids(m.columns.map((c) => c.team))).toEqual(['t1', 't2']);
    expect(m.rows.map((r) => r.unit.id)).toEqual(['l1']);
    // Lou works in none of the columns, so the row shows Ines and Kai only.
    expect(ids(m.rows[0]!.people.map((p) => p.person))).toEqual(['p2', 'p3']);
  });

  it('product world: a product is one column', () => {
    const m = buildMatrix(lined(), 't3', 'product');
    expect(ids(m.columns.map((c) => c.team))).toEqual(['t3']);
    expect(m.rows.map((r) => r.unit.id)).toEqual(['l2']);
    expect(m.noLine).toBeUndefined();
  });

  it('line world: the unit filters the rows, all products stay, unused ones dimmed', () => {
    const m = buildMatrix(lined(), lineSelection('l2'), 'line');
    expect(m.rows.map((r) => r.unit.id)).toEqual(['l2']);
    expect(ids(m.columns.map((c) => c.team))).toEqual(['t1', 't2', 't3']);
    expect(m.columns.map((c) => c.dim)).toEqual([true, true, false]);
  });

  it('line world on the organisation or the line root shows every line team', () => {
    for (const sel of [ORG_UNIT, lineSelection(ORG_UNIT)]) {
      const m = buildMatrix(lined(), sel, 'line');
      expect(m.rows.map((r) => r.unit.id)).toEqual(['l1', 'l2']);
      expect(m.noLine).toBeUndefined();
    }
  });

  it('a group with people of its own is a row too', () => {
    const ws = lined();
    ws.people.push({ id: 'p6', name: 'Pia', lineUnitId: 'g1' });
    const m = buildMatrix(ws, lineSelection('g1'), 'line');
    expect(m.rows.map((r) => r.unit.id)).toEqual(['g1', 'l1', 'l2']);
    expect(m.rows[0]!.group).toBeUndefined();
  });

  it('cellPeople lists who is behind a cell with the demand skill of their assignment', () => {
    const ws = lined();
    ws.skillFamilies = [{ id: 'f1', name: 'F' }];
    ws.skills = [{ id: 's1', name: 'Lager', familyId: 'f1' }];
    ws.teams[1]!.demands![0]!.skillId = 's1';
    const m = buildMatrix(ws, ORG_UNIT, 'product');
    expect(cellPeople(ws, m.rows[0]!, 't2')).toEqual([
      { personId: 'p3', name: 'Kai', fte: 1, skill: 'Lager' },
      { personId: 'p2', name: 'Ines', fte: 0.25, skill: undefined },
    ]);
  });

  it('never changes the workspace', () => {
    const ws = lined();
    const before = JSON.stringify(ws);
    buildMatrix(ws, ORG_UNIT, 'product');
    buildMatrix(ws, lineSelection('g1'), 'line');
    expect(JSON.stringify(ws)).toBe(before);
  });

  it('builds the line example (~500 people, 61 products) quickly', () => {
    const ws = lineExampleWorkspace('en');
    const t0 = performance.now();
    const m = buildMatrix(ws, ORG_UNIT, 'product');
    const ms = performance.now() - t0;
    expect(m.columns.length).toBeGreaterThan(50);
    expect(m.rows.reduce((n, r) => n + r.people.length, 0)).toBeGreaterThan(300);
    expect(ms).toBeLessThan(200);
  });
});

describe('buildMatrix edge cases (#396 review)', () => {
  it('a membership without hours commits nothing and shows no row', () => {
    const ws = lined();
    ws.teams[2]!.memberHours = { p5: 0 };
    const m = buildMatrix(ws, 't3', 'product');
    expect(m.rows).toEqual([]);
  });
});
