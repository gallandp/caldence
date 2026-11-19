import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/valid-workspace.json';
import type { CalEvent, Workspace } from '../../src/core/model';
import { assign } from '../../src/core/line';
import { setCadenceLength } from '../../src/core/edit';
import {
  addDemand,
  defaultDemandRole,
  demandRows,
  minCommitment,
  roleMeetings,
  skillChoices,
  updateDemand,
} from '../../src/core/demand';

const ok = <T>(r: { ok: true; value: T } | { ok: false; errors: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

const meeting = (
  id: string,
  rule: CalEvent['rule'],
  duration: number,
  roleId = 'r1',
): CalEvent => ({
  id,
  name: id,
  categoryId: (fixture as unknown as Workspace).categories[0]!.id,
  rule,
  time: '09:00',
  duration,
  preparation: 0,
  participants: [{ roleId, share: 1 }],
});

/** Team A (2-week sprint, 40 h week, Grenze 60 %) with a daily 15 min and a 2 h planning per sprint. */
function product(): Workspace {
  const w = structuredClone(fixture) as unknown as Workspace;
  w.roles.push({ id: 'sm', name: 'Scrum Master', colour: '#654321' });
  w.people.push({ id: 'p2', name: 'Atlas Ware' }, { id: 'p3', name: 'Bea Sund' });
  w.skillFamilies = [
    { id: 'f1', name: 'Orvalis' },
    { id: 'f2', name: 'Netzwerk' },
  ];
  w.skills = [
    { id: 's1', name: 'Orvalis Lager', familyId: 'f1' },
    { id: 's2', name: 'Netzbau', familyId: 'f2' },
    { id: 's3', name: 'Orvalis Betrieb', familyId: 'f1' },
  ];
  const team = w.teams[0]!;
  team.events = [
    meeting('daily', { type: 'weekdays', weekdays: [1, 2, 3, 4, 5] }, 15),
    meeting('planning', { type: 'cadence-day', day: 1 }, 120),
    meeting('once', { type: 'once', date: '2026-12-01' }, 480),
    meeting('sm-sync', { type: 'weekly', weekday: 2 }, 60, 'sm'),
  ];
  return w;
}

describe('Mindestzusage (#318)', () => {
  it('is the role meeting hours ÷ the Grenze, rounded up to 0.1 FTE', () => {
    const w = product();
    const team = w.teams[0]!;
    // daily 5 × 0.25 h + planning 2 h ÷ 2 weeks = 2.25 h a week; once does not recur.
    expect(roleMeetings(team, 'r1').map((m) => [m.event.id, m.hours])).toEqual([
      ['daily', 1.25],
      ['planning', 1],
    ]);
    // 2.25 h ÷ 0.6 = 3.75 h = 0.09375 FTE → 0.1 FTE = 4 h.
    expect(minCommitment(w, team, 'r1')).toEqual({ meetingHours: 2.25, fte: 0.1, hours: 4 });
  });

  it('keeps an exact tenth and follows the Grenze', () => {
    const w = product();
    w.teams[0]!.events = [meeting('m', { type: 'weekly', weekday: 1 }, 432)]; // 7.2 h
    // 7.2 ÷ 0.6 = 12 h = 0.3 FTE, not 0.4 from floating point noise.
    expect(minCommitment(w, w.teams[0]!, 'r1')).toMatchObject({ fte: 0.3, hours: 12 });
    w.settings.thresholds.maxFte = 0.5;
    expect(minCommitment(w, w.teams[0]!, 'r1')).toMatchObject({ fte: 0.4, hours: 16 });
  });

  it('follows a what-if on the sprint length', () => {
    const w = product();
    const longer = ok(setCadenceLength(w, 't1', 1));
    // One planning a week: 1.25 + 2 = 3.25 h ÷ 0.6 = 5.42 h → 0.2 FTE.
    expect(minCommitment(longer, longer.teams[0]!, 'r1')?.fte).toBe(0.2);
  });

  it('is undefined for a role without meetings', () => {
    const w = product();
    w.roles.push({ id: 'x', name: 'Architect', colour: '#000000' });
    expect(minCommitment(w, w.teams[0]!, 'x')).toBeUndefined();
  });
});

describe('demands (#318)', () => {
  it('adds a role-only demand without a skill', () => {
    const [w, id] = ok(addDemand(product(), 't1', { fte: 0.5, roleId: 'sm' }));
    expect(w.teams[0]!.demands).toEqual([{ id, fte: 0.5, roleId: 'sm' }]);
    expect(minCommitment(w, w.teams[0]!, 'sm')).toMatchObject({ meetingHours: 1, fte: 0.1 });
  });

  it('refuses an unknown skill or a zero FTE', () => {
    expect(addDemand(product(), 't1', { skillId: 'nope', fte: 1, roleId: 'r1' }).ok).toBe(false);
    expect(addDemand(product(), 't1', { fte: 0, roleId: 'r1' }).ok).toBe(false);
  });

  it('shows who is committed and moves them when the role changes', () => {
    const [first, d] = ok(addDemand(product(), 't1', { skillId: 's1', fte: 1, roleId: 'r1' }));
    let [w] = ok(assign(first, { personId: 'p2', teamId: 't1', demandId: d, fte: 0.5 }));
    expect(demandRows(w, w.teams[0]!)).toEqual([
      {
        demand: { id: d, skillId: 's1', fte: 1, roleId: 'r1' },
        committed: 0.5,
        who: [{ personId: 'p2', fte: 0.5 }],
      },
    ]);
    const before = w;
    const text = JSON.stringify(before);
    w = ok(updateDemand(w, 't1', d, { roleId: 'sm', skillId: undefined, fte: 0.8 }));
    expect(JSON.stringify(before)).toBe(text); // never mutated in place
    expect(w.teams[0]!.demands![0]).toEqual({ id: d, fte: 0.8, roleId: 'sm' });
    expect(w.teams[0]!.members).toContainEqual({ personId: 'p2', roleId: 'sm' });
    expect(w.teams[0]!.members).not.toContainEqual({ personId: 'p2', roleId: 'r1' });
    expect(w.assignments).toHaveLength(1);
    expect(before.teams[0]!.members).toContainEqual({ personId: 'p2', roleId: 'r1' });
  });
});

describe('demand defaults (#318)', () => {
  it('starts with the builder role, else the role most members hold, never an owner role', () => {
    const w = product();
    expect(defaultDemandRole(w, w.teams[0]!)).toBe('r1');
    w.roles.push({ id: 'r-dev', name: 'Entwickler:innen', colour: '#111111' });
    expect(defaultDemandRole(w, w.teams[0]!)).toBe('r-dev');
    const owners = product();
    owners.roles.unshift({ id: 'po', name: 'PO', colour: '#222222', owner: 'business' });
    owners.teams[0]!.members = [{ personId: 'p2', roleId: 'po' }];
    expect(defaultDemandRole(owners, owners.teams[0]!)).toBe('r1');
  });

  it("lists the platform's skill family first", () => {
    const w = product();
    w.areas.push({
      id: 'a1',
      name: 'Warenfluss',
      teamIds: ['t1'],
      members: [],
      memberHours: {},
      cycles: [],
      events: [],
      skillFamilyId: 'f1',
    });
    const c = skillChoices(w, 't1');
    expect(c.own.map((s) => s.name)).toEqual(['Orvalis Betrieb', 'Orvalis Lager']);
    expect(c.other.map((s) => s.name)).toEqual(['Netzbau']);
    w.areas = [];
    expect(skillChoices(w, 't1').own).toEqual([]);
  });
});

describe('demand role change (#318)', () => {
  it('is refused when a staffed person already holds the new role', () => {
    const [first, d] = ok(addDemand(product(), 't1', { skillId: 's1', fte: 1, roleId: 'r1' }));
    const [w] = ok(assign(first, { personId: 'p2', teamId: 't1', demandId: d, fte: 0.5 }));
    w.teams[0]!.members.push({ personId: 'p2', roleId: 'sm' });
    const r = updateDemand(w, 't1', d, { roleId: 'sm' });
    expect(r.ok).toBe(false);
    expect(r.ok ? [] : r.errors.map((e) => e.key)).toEqual(['error.demand.roleHeld']);
  });
});
