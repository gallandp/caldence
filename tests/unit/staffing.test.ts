import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/valid-workspace.json';
import type { Workspace } from '../../src/core/model';
import { assign } from '../../src/core/line';
import { boardPeople, lineFamily, openDemands, personSkills } from '../../src/core/staffing';

const ok = <T>(r: { ok: true; value: T } | { ok: false; errors: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

/**
 * Two platforms (Warenfluss with family Orvalis, Netz with family Netzwerk), three products and a
 * line group "Orvalis" (family) with the line team "Orvalis Ware" (no own family): Anna, Ben, Cem.
 */
function board(): Workspace {
  const w = structuredClone(fixture) as unknown as Workspace;
  const base = w.teams[0]!;
  w.people.push(
    { id: 'anna', name: 'Anna Becker', lineUnitId: 'lw', skillIds: ['s1'] },
    { id: 'ben', name: 'Ben König', lineUnitId: 'lw', skillIds: ['s3'], contractFte: 0.8 },
    { id: 'cem', name: 'Cem Arslan', lineUnitId: 'lw', skillIds: ['s1', 's3'] },
    { id: 'out', name: 'Other Line', lineUnitId: 'ln', skillIds: ['s2'] },
  );
  w.skillFamilies = [
    { id: 'f1', name: 'Orvalis' },
    { id: 'f2', name: 'Netzwerk' },
  ];
  w.skills = [
    { id: 's1', name: 'Orvalis Lager', familyId: 'f1' },
    { id: 's2', name: 'Netzbau', familyId: 'f2' },
    { id: 's3', name: 'Orvalis Betrieb', familyId: 'f1' },
  ];
  w.lineUnits = [
    { id: 'lo', name: 'Orvalis', skillFamilyId: 'f1' },
    { id: 'lw', name: 'Orvalis Ware', parentId: 'lo' },
    { id: 'ln', name: 'Netz', skillFamilyId: 'f2' },
  ];
  const team = (id: string, name: string) => ({
    ...structuredClone(base),
    id,
    name,
    members: [],
    memberHours: {},
    events: [],
  });
  w.teams = [
    {
      ...team('ord', 'Ordermatik'),
      demands: [
        { id: 'd1', skillId: 's1', fte: 0.4, roleId: 'r1' },
        { id: 'd2', skillId: 's3', fte: 2, roleId: 'r1' },
      ],
    },
    { ...team('tor', 'Torwacht'), demands: [{ id: 'd1', skillId: 's1', fte: 1, roleId: 'r1' }] },
    { ...team('kab', 'Kabelweg'), demands: [{ id: 'd1', skillId: 's2', fte: 1, roleId: 'r1' }] },
    { ...team('solo', 'Solo'), demands: [{ id: 'd1', fte: 0.5, roleId: 'r1' }] },
  ];
  w.areas = [
    {
      id: 'wf',
      name: 'Warenfluss',
      teamIds: ['ord', 'tor'],
      members: [],
      memberHours: {},
      cycles: [],
      events: [],
      skillFamilyId: 'f1',
    },
    {
      id: 'nz',
      name: 'Netz',
      teamIds: ['kab'],
      members: [],
      memberHours: {},
      cycles: [],
      events: [],
      skillFamilyId: 'f2',
    },
  ];
  return w;
}

describe('lineFamily', () => {
  it('is the unit’s own family, else the nearest parent’s', () => {
    const w = board();
    expect(lineFamily(w, 'lw')).toBe('f1');
    expect(lineFamily(w, 'ln')).toBe('f2');
    w.lineUnits![0]!.skillFamilyId = undefined;
    expect(lineFamily(w, 'lw')).toBeUndefined();
  });
});

describe('boardPeople', () => {
  it('lists the line team’s people by free FTE, with skills and product count', () => {
    let w = board();
    w = ok(assign(w, { personId: 'anna', teamId: 'ord', demandId: 'd1', fte: 0.4 }))[0];
    const rows = boardPeople(w, 'lw');
    expect(rows.map((r) => r.person.id)).toEqual(['cem', 'ben', 'anna']);
    const anna = rows.find((r) => r.person.id === 'anna')!;
    expect(anna.free).toBe(0.6);
    expect(anna.contract).toBe(1);
    expect(anna.products).toBe(1);
    expect(rows.find((r) => r.person.id === 'ben')!.free).toBe(0.8);
  });

  it('personSkills keeps the file’s skill order and drops unknown ids', () => {
    const w = board();
    w.people.find((p) => p.id === 'cem')!.skillIds = ['s3', 'gone', 's1'];
    expect(
      personSkills(
        w,
        w.people.find((p) => p.id === 'cem')!,
      ).map((s) => s.id),
    ).toEqual(['s1', 's3']);
  });
});

describe('openDemands', () => {
  it('shows only open demands of the family, grouped by platform, with open FTE', () => {
    let w = board();
    w = ok(assign(w, { personId: 'cem', teamId: 'ord', demandId: 'd2', fte: 0.5 }))[0];
    const groups = openDemands(w, { family: 'f1' });
    expect(groups.map((g) => g.area?.id)).toEqual(['wf']);
    const rows = groups[0]!.rows;
    expect(rows.map((r) => `${r.team.id}/${r.demand.id}`)).toEqual(['ord/d1', 'ord/d2', 'tor/d1']);
    expect(rows[1]!.open).toBe(1.5);
    expect(rows[1]!.who).toEqual([{ personId: 'cem', fte: 0.5 }]);
    expect(groups[0]!.open).toBe(2.9);
  });

  it('drops fully staffed demands', () => {
    let w = board();
    w = ok(assign(w, { personId: 'anna', teamId: 'ord', demandId: 'd1', fte: 0.4 }))[0];
    const rows = openDemands(w, { family: 'f1' })[0]!.rows;
    expect(rows.map((r) => `${r.team.id}/${r.demand.id}`)).toEqual(['ord/d2', 'tor/d1']);
  });

  it('a product search reaches other families and role-only demands; no family shows all', () => {
    const w = board();
    const found = openDemands(w, { family: 'f1', query: 'kabel' });
    expect(found.map((g) => g.area?.id)).toEqual(['nz']);
    const all = openDemands(w, {});
    expect(all.map((g) => g.area?.id ?? null)).toEqual(['wf', 'nz', null]);
    expect(openDemands(w, { query: 'SOLO' })[0]!.rows[0]!.team.id).toBe('solo');
  });

  it('a product search also finds a product by its platform name', () => {
    const w = board();
    expect(
      openDemands(w, { family: 'f1', query: 'netz' }).flatMap((g) => g.rows.map((r) => r.team.id)),
    ).toEqual(['kab']);
  });
});
