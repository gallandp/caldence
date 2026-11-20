import { describe, expect, it } from 'vitest';
import { emptyWorkspace } from '../../src/core/model';
import { evenShare } from '../../src/core/load';
import { fittedHours, setupTeam } from '../../src/core/setup';
import { builtinTemplate } from '../../src/data/templates';

const today = '2027-01-04';
const scrum = builtinTemplate('scrum', 'en');
const roleId = (name: string) => scrum.roles.find((r) => r.name === name)!.id;

describe('setupTeam', () => {
  it('creates the team, its people and their memberships in one change', () => {
    const ws = emptyWorkspace(today);
    const r = setupTeam(ws, {
      template: scrum,
      name: 'Alpha',
      start: today,
      members: [
        { name: 'Anna', roleId: roleId('Product Owner') },
        { name: ' Ben ', roleId: roleId('Scrum Master') },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [out, teamId] = r.value;
    const team = out.teams.find((t) => t.id === teamId)!;
    expect(team.name).toBe('Alpha');
    expect(out.people.map((p) => p.name)).toEqual(['Anna', 'Ben']);
    expect(team.memberHours).toEqual({});
    const roleName = (id: string) => out.roles.find((x) => x.id === id)!.name;
    expect(
      team.members.map((m) => [
        out.people.find((p) => p.id === m.personId)!.name,
        roleName(m.roleId),
      ]),
    ).toEqual([
      ['Anna', 'Product Owner'],
      ['Ben', 'Scrum Master'],
    ]);
  });

  it('reuses an existing person with the same name and skips blank names and duplicates', () => {
    const first = setupTeam(emptyWorkspace(today), {
      template: scrum,
      name: 'A',
      start: today,
      members: [{ name: 'Anna', roleId: roleId('Product Owner') }],
    });
    if (!first.ok) throw new Error('setup failed');
    const r = setupTeam(first.value[0], {
      template: scrum,
      name: 'B',
      start: today,
      members: [
        { name: 'anna', roleId: roleId('Product Owner') },
        { name: 'Anna', roleId: roleId('Product Owner') },
        { name: '  ', roleId: roleId('Scrum Master') },
      ],
    });
    if (!r.ok) throw new Error('setup failed');
    const [out, teamId] = r.value;
    expect(out.people).toHaveLength(1);
    expect(out.teams.find((t) => t.id === teamId)!.members).toHaveLength(1);
  });

  it('starts the cadence on the chosen date or the next matching weekday', () => {
    const r = setupTeam(emptyWorkspace(today), {
      template: scrum,
      name: 'A',
      start: '2027-02-01',
      members: [],
    });
    if (!r.ok) throw new Error('setup failed');
    expect(r.value[0].teams[0]!.cadence.start >= '2027-02-01').toBe(true);
    expect(r.value[0].teams[0]!.cadence.start < '2027-02-08').toBe(true);
  });

  it('without a template adds an empty team', () => {
    const r = setupTeam(emptyWorkspace(today), {
      template: null,
      name: 'Solo',
      start: today,
      members: [],
    });
    if (!r.ok) throw new Error('setup failed');
    expect(r.value[0].teams[0]!.events).toEqual([]);
    expect(r.value[0].teams[0]!.name).toBe('Solo');
  });

  it('applies the confirmed settings with the team', () => {
    const r = setupTeam(emptyWorkspace(today), {
      template: scrum,
      name: 'A',
      start: today,
      members: [],
      settings: { timezone: 'Europe/Vienna', horizon: { from: today, to: '2027-06-30' } },
    });
    if (!r.ok) throw new Error('setup failed');
    expect(r.value[0].settings.timezone).toBe('Europe/Vienna');
    expect(r.value[0].settings.horizon.to).toBe('2027-06-30');
  });

  it('refuses a horizon that ends before it starts', () => {
    const r = setupTeam(emptyWorkspace(today), {
      template: scrum,
      name: 'A',
      start: today,
      members: [],
      settings: { horizon: { from: '2027-06-30', to: today } },
    });
    expect(r.ok).toBe(false);
  });

  it('puts people with a SAFe area role into the Release Train, not the team', () => {
    const safe = builtinTemplate('safe', 'en');
    const id = (name: string) => safe.roles.find((r) => r.name === name)!.id;
    const r = setupTeam(emptyWorkspace(today), {
      template: safe,
      name: 'Alpha',
      start: today,
      members: [
        { name: 'Anna', roleId: id('Product Owner') },
        { name: 'Rita', roleId: id('Release Train Engineer') },
      ],
    });
    if (!r.ok) throw new Error('setup');
    const [out, teamId] = r.value;
    const team = out.teams.find((t) => t.id === teamId)!;
    const area = out.areas[0]!;
    const person = (name: string) => out.people.find((p) => p.name === name)!.id;
    expect(team.members.map((m) => m.personId)).toEqual([person('Anna')]);
    expect(area.members.map((m) => m.personId)).toEqual([person('Rita')]);
    expect(area.memberHours).toEqual({ [person('Rita')]: out.settings.hoursPerWeek });
  });

  it('gives no extra area hours to someone who is also in the team', () => {
    const safe = builtinTemplate('safe', 'en');
    const id = (name: string) => safe.roles.find((r) => r.name === name)!.id;
    const r = setupTeam(emptyWorkspace(today), {
      template: safe,
      name: 'Alpha',
      start: today,
      members: [
        { name: 'Kim', roleId: id('Release Train Engineer') },
        { name: 'Kim', roleId: id('Product Owner') },
      ],
    });
    if (!r.ok) throw new Error('setup');
    const area = r.value[0].areas[0]!;
    expect(area.members).toHaveLength(1);
    expect(area.memberHours).toEqual({});
  });

  it('sets the hours given for a person already in another team (#274)', () => {
    const first = setupTeam(emptyWorkspace(today), {
      template: scrum,
      name: 'Alpha',
      start: today,
      members: [{ name: 'Sam', roleId: roleId('Developers') }],
    });
    if (!first.ok) throw new Error('setup');
    const r = setupTeam(first.value[0], {
      template: scrum,
      name: 'Beta',
      start: today,
      members: [
        { name: 'sam', roleId: roleId('Developers') },
        { name: 'Ben', roleId: roleId('Developers') },
      ],
      hours: { sam: 10 },
    });
    if (!r.ok) throw new Error('setup');
    const [out, teamId] = r.value;
    const sam = out.people.find((p) => p.name === 'Sam')!.id;
    expect(out.teams.find((t) => t.id === teamId)!.memberHours).toEqual({ [sam]: 10 });
  });

  it('lowers the other teams to fit the weekly hours when asked (#446)', () => {
    const first = setupTeam(emptyWorkspace(today), {
      template: scrum,
      name: 'Alpha',
      start: today,
      members: [{ name: 'Sam', roleId: roleId('Developers') }],
    });
    if (!first.ok) throw new Error('setup');
    const [ws, alphaId] = first.value;
    // Sam has the default 40 h in Alpha: an even split gives 20 h here and 20 h there.
    const r = setupTeam(ws, {
      template: scrum,
      name: 'Beta',
      start: today,
      members: [{ name: 'Sam', roleId: roleId('Developers') }],
      hours: { sam: 20 },
      fit: ['sam'],
    });
    if (!r.ok) throw new Error('setup');
    const [out, betaId] = r.value;
    const sam = out.people.find((p) => p.name === 'Sam')!.id;
    expect(out.teams.find((t) => t.id === betaId)!.memberHours).toEqual({ [sam]: 20 });
    expect(out.teams.find((t) => t.id === alphaId)!.memberHours).toEqual({ [sam]: 20 });
  });

  it('lowers several places in proportion, in half hours, and leaves others as they are', () => {
    const ws = emptyWorkspace(today);
    const a = setupTeam(ws, {
      template: scrum,
      name: 'Alpha',
      start: today,
      members: [
        { name: 'Sam', roleId: roleId('Developers') },
        { name: 'Kim', roleId: roleId('Developers') },
      ],
    });
    if (!a.ok) throw new Error('setup');
    const b = setupTeam(a.value[0], {
      template: scrum,
      name: 'Beta',
      start: today,
      members: [{ name: 'Sam', roleId: roleId('Developers') }],
      hours: { sam: 20 },
    });
    if (!b.ok) throw new Error('setup');
    const [, alphaId] = a.value;
    const [ws2, betaId] = b.value;
    // Sam: 40 h in Alpha (default) and 20 h in Beta. 13 h in Gamma leave 27 h for the two.
    const r = setupTeam(ws2, {
      template: scrum,
      name: 'Gamma',
      start: today,
      members: [{ name: 'Sam', roleId: roleId('Developers') }],
      hours: { sam: 13 },
      fit: ['sam'],
    });
    if (!r.ok) throw new Error('setup');
    const [out] = r.value;
    const sam = out.people.find((p) => p.name === 'Sam')!.id;
    const kim = out.people.find((p) => p.name === 'Kim')!.id;
    const alpha = out.teams.find((t) => t.id === alphaId)!;
    expect(alpha.memberHours[sam]).toBe(18);
    expect(out.teams.find((t) => t.id === betaId)!.memberHours[sam]).toBe(9);
    expect(Object.hasOwn(alpha.memberHours, kim)).toBe(false);
  });

  it('leaves the other teams alone when the hours still fit', () => {
    const first = setupTeam(emptyWorkspace(today), {
      template: scrum,
      name: 'Alpha',
      start: today,
      members: [{ name: 'Sam', roleId: roleId('Developers') }],
    });
    if (!first.ok) throw new Error('setup');
    const ws = first.value[0];
    ws.teams[0]!.memberHours = { [ws.people[0]!.id]: 10 };
    const r = setupTeam(ws, {
      template: scrum,
      name: 'Beta',
      start: today,
      members: [{ name: 'Sam', roleId: roleId('Developers') }],
      hours: { sam: 30 },
      fit: ['sam'],
    });
    if (!r.ok) throw new Error('setup');
    expect(r.value[0].teams[0]!.memberHours).toEqual({ [ws.people[0]!.id]: 10 });
  });

  it('keeps the other hours when the hours here take the whole week', () => {
    const first = setupTeam(emptyWorkspace(today), {
      template: scrum,
      name: 'Alpha',
      start: today,
      members: [{ name: 'Sam', roleId: roleId('Developers') }],
    });
    if (!first.ok) throw new Error('setup');
    const r = setupTeam(first.value[0], {
      template: scrum,
      name: 'Beta',
      start: today,
      members: [{ name: 'Sam', roleId: roleId('Developers') }],
      hours: { sam: 40 },
      fit: ['sam'],
    });
    if (!r.ok) throw new Error('setup');
    expect(r.value[0].teams[0]!.memberHours).toEqual({});
  });
});

describe('fittedHours (#446)', () => {
  function robin(gamma: number, delta: number) {
    const ws = emptyWorkspace(today);
    ws.people.push({ id: 'p', name: 'Robin' });
    const team = (id: string, hours: number) => ({
      id,
      name: id,
      cadence: { kind: 'sprint' as const, lengthWeeks: 2, start: today },
      members: [{ personId: 'p', roleId: 'r' }],
      memberHours: { p: hours },
      assumptions: {},
      cycles: [],
      events: [],
    });
    ws.teams.push(team('Gamma', gamma), team('Delta', delta));
    return ws;
  }

  it('hands the half hours rounding leaves to the largest remainders, so the total fits', () => {
    // 27 h left for 32 h and 8 h: 21.6 h and 5.4 h, in half hours 21.5 h and 5.5 h.
    const out = fittedHours(robin(32, 8), 'p', 13);
    expect(out.map((p) => [p.name, p.hours])).toEqual([
      ['Gamma', 21.5],
      ['Delta', 5.5],
    ]);
    expect(out.reduce((sum, p) => sum + p.hours, 0)).toBe(27);
  });

  it('changes nothing when the hours fit or the hours here take the whole week', () => {
    expect(fittedHours(robin(20, 10), 'p', 10)).toEqual([]);
    expect(fittedHours(robin(32, 8), 'p', 40)).toEqual([]);
    expect(fittedHours(robin(32, 8), 'p', 45)).toEqual([]);
  });

  it('leaves out places at 0 h, also for the even split', () => {
    const ws = robin(40, 0);
    expect(fittedHours(ws, 'p', 20).map((p) => [p.name, p.hours])).toEqual([['Gamma', 20]]);
    expect(evenShare(ws, 'p')).toBe(20);
  });
});
