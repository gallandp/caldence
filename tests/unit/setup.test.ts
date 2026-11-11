import { describe, expect, it } from 'vitest';
import { emptyWorkspace } from '../../src/core/model';
import { setupTeam } from '../../src/core/setup';
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
    expect(out.people[0]!.hoursPerWeek).toBe(ws.settings.hoursPerWeek);
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
});
