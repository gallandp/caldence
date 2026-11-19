import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/valid-workspace.json';
import type { Workspace } from '../../src/core/model';
import { loadWorkspace, validate } from '../../src/core/validate';
import { removeItem, removeTeam, updateSettings, updateTeam } from '../../src/core/edit';
import {
  assign,
  assignmentOf,
  freeFte,
  hasLineData,
  removeCompany,
  removeDemand,
  removeLineUnit,
  removeSkill,
  removeSkillFamily,
  unassign,
} from '../../src/core/line';
import { hoursLeft, overbooked } from '../../src/core/load';
import { structureSheets } from '../../src/core/structureSheets';
import { teamToTemplate } from '../../src/core/template';
import { isLineStaff, withoutNames } from '../../src/core/whatIf';
import { LIMITS } from '../../src/core/limits';

/** The fixture with a line: Orvalis family, Java skill, a line team, Alex in it and a demand. */
function lined(): Workspace {
  const w = structuredClone(fixture) as unknown as Workspace;
  w.roles.push({ id: 'dev', name: 'Developer', colour: '#123456' });
  w.people.push({ id: 'p2', name: 'Atlas Ware' });
  w.skillFamilies = [{ id: 'f1', name: 'Orvalis' }];
  w.skills = [{ id: 's1', name: 'Java', familyId: 'f1' }];
  w.companies = [{ id: 'co1', name: 'Velmora Nord' }];
  w.lineUnits = [
    { id: 'g1', name: 'Backend', skillFamilyId: 'f1' },
    { id: 'l1', name: 'Backend Nord', parentId: 'g1', managerPersonId: 'p1' },
  ];
  Object.assign(w.people[1]!, { lineUnitId: 'l1', contractFte: 0.8, skillIds: ['s1'] });
  w.teams[0]!.demands = [{ id: 'd1', skillId: 's1', fte: 1, roleId: 'dev' }];
  return w;
}

const ok = <T>(r: { ok: true; value: T } | { ok: false; errors: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};
const keys = (w: unknown): string[] => {
  const r = validate(w);
  return r.ok ? [] : r.errors.map((e) => `${e.path} ${e.key}`);
};

describe('line model (#315)', () => {
  it('files without line fields open unchanged, in both formats', () => {
    const text = JSON.stringify(fixture);
    expect(ok(loadWorkspace(text))).toEqual(fixture);
    const v2 = ok(loadWorkspace(JSON.stringify({ ...fixture, schemaVersion: 1007 })));
    expect(v2).toEqual(fixture);
  });

  it('accepts a file with line data', () => {
    expect(keys(lined())).toEqual([]);
  });

  it('assigning mirrors into members and hours', () => {
    const [w, id] = ok(assign(lined(), { personId: 'p2', teamId: 't1', demandId: 'd1', fte: 0.5 }));
    const team = w.teams[0]!;
    expect(team.members).toContainEqual({ personId: 'p2', roleId: 'dev' });
    expect(team.memberHours.p2).toBe(20);
    expect(w.assignments).toEqual([{ id, personId: 'p2', teamId: 't1', demandId: 'd1', fte: 0.5 }]);
    expect(assignmentOf(w, 't1', 'p2', 'dev')?.id).toBe(id);
  });

  it('one assignment per person and team', () => {
    const w0 = lined();
    w0.teams[0]!.demands!.push({ id: 'd2', fte: 0.5, roleId: 'r1' });
    const [w] = ok(assign(w0, { personId: 'p2', teamId: 't1', demandId: 'd1', fte: 0.5 }));
    const r = assign(w, { personId: 'p2', teamId: 't1', demandId: 'd2', fte: 0.2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.key).toBe('error.assignment.duplicate');
    // A file with two is rejected too.
    w.teams[0]!.members.push({ personId: 'p2', roleId: 'r1' });
    w.assignments!.push({ id: 'x', personId: 'p2', teamId: 't1', demandId: 'd2', fte: 0.2 });
    expect(keys(w)).toContain('assignments.1 error.assignment.duplicate');
  });

  it('an assignment must be mirrored in the members', () => {
    const w = lined();
    w.assignments = [{ id: 'a', personId: 'p2', teamId: 't1', demandId: 'd1', fte: 1 }];
    expect(keys(w)).toContain('assignments.0 error.assignment.notMember');
  });

  it('editing hours in the team changes the FTE; removing the member ends the assignment', () => {
    const [w] = ok(assign(lined(), { personId: 'p2', teamId: 't1', demandId: 'd1', fte: 0.5 }));
    const team = w.teams[0]!;
    const w2 = ok(updateTeam(w, 't1', { memberHours: { ...team.memberHours, p2: 30 } }));
    expect(w2.assignments![0]!.fte).toBe(0.75);
    const rest = team.members.filter((m) => m.personId !== 'p2');
    const w3 = ok(updateTeam(w2, 't1', { members: rest }));
    expect(w3.assignments).toEqual([]);
    // Other weekly hours, other FTE of the same hours.
    expect(updateSettings(w2, { hoursPerWeek: 30 }).assignments![0]!.fte).toBe(1);
  });

  it('unassigning removes the membership and its hours', () => {
    const [w, id] = ok(assign(lined(), { personId: 'p2', teamId: 't1', demandId: 'd1', fte: 0.5 }));
    const out = unassign(w, id);
    expect(out.assignments).toEqual([]);
    expect(out.teams[0]!.members.some((m) => m.personId === 'p2')).toBe(false);
    expect(out.teams[0]!.memberHours.p2).toBeUndefined();
    expect(keys(out)).toEqual([]);
  });

  it('free FTE counts all hours, also memberships without an assignment', () => {
    const [w] = ok(assign(lined(), { personId: 'p2', teamId: 't1', demandId: 'd1', fte: 0.5 }));
    expect(freeFte(w, 'p2')).toBe(0.3);
    // Alex: 32 h of 40 h without any assignment, contract 1.0.
    expect(freeFte(w, 'p1')).toBe(0.2);
    // A member without hours counts the weekly hours; area hours count too.
    w.teams[0]!.memberHours = { p1: 32 };
    w.areas.push({
      id: 'a1',
      name: 'Plattform',
      teamIds: [],
      members: [],
      memberHours: { p2: 8 },
      cycles: [],
      events: [],
    });
    expect(freeFte(w, 'p2')).toBe(-0.4);
  });

  it('the weekly-hours flag uses contract FTE × weekly hours', () => {
    const [w] = ok(assign(lined(), { personId: 'p2', teamId: 't1', demandId: 'd1', fte: 0.8 }));
    expect(overbooked(w, 'p2')).toBe(false);
    expect(hoursLeft(w, 'p2')).toBe(0);
    w.teams[0]!.memberHours.p2 = 33;
    expect(overbooked(w, 'p2')).toBe(true);
  });

  it('validates the tree: no cycles, at most three levels', () => {
    const w = lined();
    w.lineUnits!.push({ id: 'l2', name: 'Java Nord', parentId: 'l1' });
    expect(keys(w)).toEqual([]);
    w.lineUnits!.push({ id: 'l3', name: 'Zu tief', parentId: 'l2' });
    expect(keys(w)).toContain('lineUnits.3.parentId error.line.depth');
    w.lineUnits!.pop();
    w.lineUnits![0]!.parentId = 'l2';
    expect(keys(w)).toContain('lineUnits.0.parentId error.line.cycle');
  });

  it('validates references, names and values', () => {
    const w = lined();
    w.skills!.push({ id: 's2', name: ' java', familyId: 'nope' });
    w.people[1]!.contractFte = 1.2;
    w.people[0]!.pseudonymous = true;
    w.teams[0]!.demands!.push({ id: 'd1', fte: 0, roleId: 'zz' });
    const k = keys(w);
    expect(k).toContain('skills.1.name error.name.duplicate');
    expect(k).toContain('skills.1.familyId error.ref.unknown');
    expect(k).toContain('people.1.contractFte error.number.invalid');
    expect(k).toContain('people.0.lineUnitId error.required');
    expect(k).toContain('teams.0.demands.1.id error.id.duplicate');
    expect(k).toContain('teams.0.demands.1.fte error.number.invalid');
    expect(k).toContain('teams.0.demands.1.roleId error.ref.unknown');
  });

  it('names the field when a limit is exceeded', () => {
    const w = lined();
    w.companies = Array.from({ length: LIMITS.companies + 1 }, (_, i) => ({
      id: `c${i}`,
      name: `C${i}`,
    }));
    w.teams[0]!.demands = Array.from({ length: LIMITS.demandsPerTeam + 1 }, (_, i) => ({
      id: `d${i}`,
      fte: 1,
      roleId: 'dev',
    }));
    const k = keys(w);
    expect(k).toContain('companies error.list.tooLong');
    expect(k).toContain('teams.0.demands error.list.tooLong');
  });

  it('deleting leaves no orphans', () => {
    const [w] = ok(assign(lined(), { personId: 'p2', teamId: 't1', demandId: 'd1', fte: 0.5 }));
    w.areas.push({
      id: 'a1',
      name: 'P',
      teamIds: ['t1'],
      members: [],
      memberHours: {},
      cycles: [],
      events: [],
      skillFamilyId: 'f1',
    });
    w.people[1]!.companyId = 'co1';
    expect(keys(w)).toEqual([]);

    const noDemand = removeDemand(w, 't1', 'd1');
    expect(noDemand.assignments).toEqual([]);
    expect(noDemand.teams[0]!.members.some((m) => m.personId === 'p2')).toBe(false);

    const noFamily = removeSkillFamily(w, 'f1');
    expect(noFamily.skills).toEqual([]);
    expect(noFamily.people[1]!.skillIds).toEqual([]);
    expect(noFamily.teams[0]!.demands![0]!.skillId).toBeUndefined();
    expect(noFamily.areas[0]!.skillFamilyId).toBeUndefined();
    expect(noFamily.lineUnits![0]!.skillFamilyId).toBeUndefined();
    expect(keys(removeSkill(w, 's1'))).toEqual([]);

    expect(removeCompany(w, 'co1').people[1]!.companyId).toBeUndefined();

    const noGroup = removeLineUnit(w, 'g1');
    expect(noGroup.lineUnits).toEqual([{ id: 'l1', name: 'Backend Nord', managerPersonId: 'p1' }]);
    const noLine = removeLineUnit(w, 'l1');
    expect(noLine.people[1]!.lineUnitId).toBeUndefined();

    const noAlex = ok(removeItem(w, 'people', 'p1'));
    expect(noAlex.lineUnits![1]!.managerPersonId).toBeUndefined();
    const noAtlas = ok(removeItem(w, 'people', 'p2'));
    expect(noAtlas.assignments).toEqual([]);
    expect(keys(noAtlas)).toEqual([]);

    expect(removeTeam(w, 't1').assignments).toEqual([]);
  });

  it('a role used by a demand is in use; a replacement moves the demand', () => {
    const w = lined();
    const r = removeItem(w, 'roles', 'dev');
    expect(r.ok).toBe(false);
    const out = ok(removeItem(w, 'roles', 'dev', 'r1'));
    expect(out.teams[0]!.demands![0]!.roleId).toBe('r1');
  });

  it('templates carry no line data', () => {
    const t = teamToTemplate(lined(), 't1', { id: 'x', name: 'X', description: '' });
    expect(JSON.stringify(t)).not.toMatch(/demands|skill|Atlas/);
  });

  it('Excel has line data only when asked', () => {
    const w = lined();
    const text = { t: (k: string) => k, repeats: () => '', percent: (s: number) => `${s}` };
    expect(hasLineData(w)).toBe(true);
    expect(hasLineData(structuredClone(fixture) as unknown as Workspace)).toBe(false);
    const without = structureSheets(w, text);
    expect(JSON.stringify(without)).not.toMatch(/Java|Velmora|xlsx.sheet.line/);
    const withLine = structureSheets(w, text, { lineData: true });
    expect(withLine.at(-1)!.rows).toContainEqual(['Atlas Ware', 'Backend Nord', null, 0.8, 'Java']);
  });

  it('presenting hides line staff names even with names shown', () => {
    const w = withoutNames(lined(), (n) => `Person ${n}`, isLineStaff);
    expect(w.people.map((p) => p.name)).toEqual(['Alex', 'Person 2']);
  });
});
