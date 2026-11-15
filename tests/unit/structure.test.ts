import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/valid-workspace.json';
import type { CalEvent, Team, Workspace } from '../../src/core/model';
import { validate, type Result } from '../../src/core/validate';
import { areaStructure } from '../../src/core/structure';
import { addAreaPerson, removeFromArea, setAreaHours, setAreaRole } from '../../src/core/areaEdit';

function ok<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
}

const team = (id: string, members: [string, string, number?][]): Team => ({
  id,
  name: id,
  cadence: { kind: 'sprint', lengthWeeks: 2, start: '2026-01-05' },
  members: members.map(([personId, roleId]) => ({ personId, roleId })),
  memberHours: Object.fromEntries(
    members.filter((m) => m[2] !== undefined).map(([p, , h]) => [p, h!]),
  ),
  assumptions: {},
  cycles: [],
  events: [],
});

const forum = (fromTeams: boolean, roleId = 'po'): CalEvent => ({
  id: 'e1',
  name: 'PO forum',
  categoryId: 'c1',
  rule: { type: 'weekly', weekday: 1 },
  time: '10:00',
  duration: 60,
  participants: [{ roleId, share: 1, fromTeams }],
  preparation: 0,
});

/**
 * Area "zv" with Alpha and Beta; Gamma is outside. Sabine leads the area, Alex is PO in Alpha with
 * 4 h in the area, Sam is SM in Alpha and Beta, Mira is a developer in Alpha and in Gamma.
 */
function ws(): Workspace {
  const w = structuredClone(fixture) as unknown as Workspace;
  w.roles = ['po', 'sm', 'dev', 'lead'].map((id) => ({ id, name: id, colour: '#3366cc' }));
  w.people = ['sabine', 'alex', 'sam', 'mira', 'bea'].map((id) => ({ id, name: id }));
  w.categories = [{ id: 'c1', name: 'Meeting', colour: '#3366cc' }];
  w.teams = [
    team('alpha', [
      ['alex', 'po', 20],
      ['sam', 'sm', 16],
      ['mira', 'dev'],
    ]),
    team('beta', [
      ['bea', 'po', 32],
      ['sam', 'sm', 16],
    ]),
    team('gamma', [['mira', 'dev', 8]]),
  ];
  w.areas = [
    {
      id: 'zv',
      name: 'ZV',
      teamIds: ['alpha', 'beta'],
      members: [
        { personId: 'sabine', roleId: 'lead' },
        { personId: 'alex', roleId: 'po' },
      ],
      memberHours: { sabine: 40, alex: 4 },
      cycles: [],
      events: [],
    },
  ];
  expect(validate(w).ok).toBe(true);
  return w;
}

describe('areaStructure', () => {
  it('sorts people into the three groups with their hours', () => {
    const w = ws();
    const s = areaStructure(w, w.areas[0]!);
    const by = Object.fromEntries(s.people.map((p) => [p.personId, p]));
    expect(by.sabine).toMatchObject({ group: 'area', areaHours: 40, total: 40, teams: [] });
    expect(by.alex).toMatchObject({ group: 'both', areaHours: 4, areaRoleIds: ['po'], total: 24 });
    expect(by.sam).toMatchObject({ group: 'team', total: 32 });
    expect(by.sam!.teams.map((t) => t.teamId)).toEqual(['alpha', 'beta']);
    // Mira's Gamma hours are "other teams"; her Alpha hours follow the default of 40 h.
    expect(by.mira).toMatchObject({ group: 'team', otherHours: 8, total: 48 });
    expect(s.counts).toEqual({ area: 1, both: 1, team: 3 });
    expect(s.areaHours).toBe(44);
    expect(s.teams).toEqual([
      { teamId: 'alpha', both: ['alex'], only: ['sam', 'mira'] },
      { teamId: 'beta', both: [], only: ['bea', 'sam'] },
    ]);
  });

  it('counts people invited "from every team" as in the team and in the area', () => {
    const w = ws();
    w.areas[0]!.events = [forum(true, 'sm')];
    const s = areaStructure(w, w.areas[0]!);
    const sam = s.people.find((p) => p.personId === 'sam')!;
    expect(sam).toMatchObject({ group: 'both', areaHours: 0, invitedOnly: true });
    expect(s.teams[1]!.both).toEqual(['sam']);
    // An area-level participant without fromTeams reaches only area members.
    w.areas[0]!.events = [forum(false, 'sm')];
    expect(areaStructure(w, w.areas[0]!).people.find((p) => p.personId === 'sam')!.group).toBe(
      'team',
    );
  });

  it('puts a team member with area hours but no area role in both', () => {
    const w = ws();
    w.areas[0]!.memberHours.bea = 2;
    const bea = areaStructure(w, w.areas[0]!).people.find((p) => p.personId === 'bea')!;
    expect(bea).toMatchObject({ group: 'both', areaRoleIds: [], invitedOnly: false });
  });
});

describe('area person edits', () => {
  it('adds, re-roles, re-hours and removes a person at area level', () => {
    let w = ws();
    w = ok(addAreaPerson(w, 'zv', 'bea', 'lead', 6));
    expect(w.areas[0]!.members).toContainEqual({ personId: 'bea', roleId: 'lead' });
    expect(w.areas[0]!.memberHours.bea).toBe(6);
    // Adding someone already there keeps their roles, and their hours without new ones.
    w = ok(addAreaPerson(w, 'zv', 'sabine', 'po', null));
    expect(w.areas[0]!.members.filter((m) => m.personId === 'sabine').length).toBe(2);
    expect(w.areas[0]!.memberHours.sabine).toBe(40);
    w = ok(setAreaRole(w, 'zv', 'sabine', 'lead'));
    w = ok(setAreaRole(w, 'zv', 'alex', 'sm'));
    expect(w.areas[0]!.members.map((m) => [m.personId, m.roleId])).toEqual([
      ['sabine', 'lead'],
      ['alex', 'sm'],
      ['bea', 'lead'],
    ]);
    w = ok(setAreaHours(w, 'zv', 'alex', 8));
    expect(w.areas[0]!.memberHours.alex).toBe(8);
    w = ok(removeFromArea(w, 'zv', 'alex'));
    expect(w.areas[0]!.members.some((m) => m.personId === 'alex')).toBe(false);
    expect(Object.hasOwn(w.areas[0]!.memberHours, 'alex')).toBe(false);
    expect(w.teams[0]!.members.some((m) => m.personId === 'alex')).toBe(true);
    expect(validate(w).ok).toBe(true);
  });

  it('refuses an unknown area', () => {
    expect(setAreaHours(ws(), 'nope', 'alex', 1).ok).toBe(false);
  });
});
