import { describe, expect, it } from 'vitest';
import { setRoleLinks, teamRoleIds, unmatchedRoles } from '../../src/core/areaEdit';
import { costSummary, meetingCost } from '../../src/core/cost';
import { exportIcs } from '../../src/core/ics';
import { loadSummary } from '../../src/core/views';
import {
  duplicateTeam,
  removeItem,
  removeTeam,
  setAreaTeams,
  updateTeam,
} from '../../src/core/edit';
import { migrate } from '../../src/core/migrate';
import {
  areaAsTeam,
  CURRENT_SCHEMA,
  emptyWorkspace,
  eventAttendees,
  holders,
  invitesRole,
  missingRoles,
  roleAttendees,
} from '../../src/core/model';
import { applyTemplate } from '../../src/core/template';
import { validate } from '../../src/core/validate';
import { BUILTIN_TEMPLATES } from '../../src/data/templates';

const TODAY = '2027-02-10';

/**
 * A Scrum team "North" with a PO, an SM and two developers, then a SAFe team "Star" whose Release
 * Train also takes North in (#338).
 */
function mixed() {
  let r = applyTemplate(emptyWorkspace(TODAY), BUILTIN_TEMPLATES.scrum.en, {
    name: 'North',
    today: TODAY,
  });
  if (!r.ok) throw new Error('scrum');
  let ws = r.value[0];
  const north = r.value[1];
  const role = (name: string) => ws.roles.find((x) => x.name === name)!.id;
  ws.people = ['ann', 'ben', 'cleo', 'dan'].map((id) => ({ id, name: id }));
  const members = [
    { personId: 'ann', roleId: role('Product Owner') },
    { personId: 'ben', roleId: role('Scrum Master') },
    { personId: 'cleo', roleId: role('Developers') },
    { personId: 'dan', roleId: role('Developers') },
  ];
  const u = updateTeam(ws, north, { members });
  if (!u.ok) throw new Error('members');
  r = applyTemplate(u.value, BUILTIN_TEMPLATES.safe.en, { name: 'Star', today: TODAY });
  if (!r.ok) throw new Error('safe');
  ws = r.value[0];
  const star = r.value[1];
  const area = ws.areas[0]!;
  const joined = setAreaTeams(ws, area.id, [north, star]);
  if (!joined.ok) throw new Error('join');
  ws = joined.value;
  return { ws, north, star, areaId: area.id };
}

const roleId = (ws: ReturnType<typeof mixed>['ws'], name: string) =>
  ws.roles.find((x) => x.name === name)!.id;

describe('level words of a template (#338)', () => {
  it('are taken over when the file has no other team', () => {
    const r = applyTemplate(emptyWorkspace(TODAY), BUILTIN_TEMPLATES.safe.en, {
      name: 'Star',
      today: TODAY,
    });
    expect(r.ok && r.value[0].settings.levelNames).toEqual({ preset: 'train' });
  });

  it('are not taken over when the file already has a team', () => {
    const { ws } = mixed();
    expect(ws.settings.levelNames).toBeUndefined();
  });
});

describe('role links of an area (#338)', () => {
  it('lists the area roles a joined team does not hold, and the roles it can map them to', () => {
    const { ws, north, star, areaId } = mixed();
    const area = ws.areas.find((a) => a.id === areaId)!;
    const names = (ids: string[]) => ids.map((id) => ws.roles.find((x) => x.id === id)!.name);
    expect(names(unmatchedRoles(ws, area, north))).toEqual([
      'Scrum Master/Team Coach',
      'Agile Team',
    ]);
    expect(unmatchedRoles(ws, area, star)).toEqual([]);
    expect(names(teamRoleIds(ws, north))).toEqual(['Product Owner', 'Scrum Master', 'Developers']);
  });

  it('after mapping, the area meetings invite and count the mapped people', () => {
    const { ws, north, areaId } = mixed();
    const area = () => out.areas.find((a) => a.id === areaId)!;
    const r = setRoleLinks(ws, areaId, [
      { teamId: north, roleId: roleId(ws, 'Agile Team'), teamRoleId: roleId(ws, 'Developers') },
      {
        teamId: north,
        roleId: roleId(ws, 'Scrum Master/Team Coach'),
        teamRoleId: roleId(ws, 'Scrum Master'),
      },
    ]);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const out = r.value;
    const planning = area().events.find((e) => e.name === 'PI Planning day 1')!;
    const agile = planning.participants.find((p) => p.roleId === roleId(ws, 'Agile Team'))!;
    expect(holders(out, areaId, agile)).toEqual(['cleo', 'dan']);
    expect(missingRoles(out, area(), planning).filter((m) => m.teamId === north)).toEqual([]);
    // Before the mapping only Ann was invited from North; now Ben, Cleo and Dan come too.
    expect(eventAttendees(ws, areaId, planning).sort()).toEqual(['ann']);
    expect(eventAttendees(out, areaId, planning).sort()).toEqual(['ann', 'ben', 'cleo', 'dan']);
    const cost = (w: typeof ws) =>
      meetingCost(w, areaAsTeam(w.areas.find((a) => a.id === areaId)!), planning, 60, 100);
    // A role nobody holds counts one person: before, Ann plus SM/Team Coach, Agile Team, PM and
    // RTE (5); after, Ann, Ben, Cleo, Dan, PM and RTE (6).
    expect(cost(out) / cost(ws)).toBeCloseTo(6 / 5);
  });

  it('refuses links to teams outside the area, unknown roles and a role mapped twice', () => {
    const { ws, north, star, areaId } = mixed();
    const agile = roleId(ws, 'Agile Team');
    const dev = roleId(ws, 'Developers');
    expect(setRoleLinks(ws, areaId, [{ teamId: 'nope', roleId: agile, teamRoleId: dev }]).ok).toBe(
      false,
    );
    expect(setRoleLinks(ws, areaId, [{ teamId: north, roleId: agile, teamRoleId: 'x' }]).ok).toBe(
      false,
    );
    expect(
      setRoleLinks(ws, areaId, [
        { teamId: north, roleId: agile, teamRoleId: dev },
        { teamId: north, roleId: agile, teamRoleId: roleId(ws, 'Scrum Master') },
      ]).ok,
    ).toBe(false);
    expect(setRoleLinks(ws, areaId, [{ teamId: star, roleId: agile, teamRoleId: agile }]).ok).toBe(
      false,
    );
  });

  it('follow the team and its roles: leaving, removing, duplicating, replacing a role', () => {
    const { ws, north, star, areaId } = mixed();
    const agile = roleId(ws, 'Agile Team');
    const dev = roleId(ws, 'Developers');
    const r = setRoleLinks(ws, areaId, [{ teamId: north, roleId: agile, teamRoleId: dev }]);
    if (!r.ok) throw new Error('link');
    const linked = r.value;
    const links = (w: typeof linked) => w.areas.find((a) => a.id === areaId)!.roleLinks ?? [];

    const left = setAreaTeams(linked, areaId, [star]);
    expect(left.ok && links(left.value)).toEqual([]);
    expect(links(removeTeam(linked, north))).toEqual([]);
    expect(validate(removeTeam(linked, north)).ok).toBe(true);

    const [copy, copyId] = duplicateTeam(linked, north, 'North 2');
    expect(links(copy)).toContainEqual({ teamId: copyId, roleId: agile, teamRoleId: dev });

    const replaced = removeItem(linked, 'roles', dev, roleId(ws, 'Scrum Master'));
    expect(replaced.ok && links(replaced.value)).toEqual([
      { teamId: north, roleId: agile, teamRoleId: roleId(ws, 'Scrum Master') },
    ]);
    // A role replaced by the area role itself needs no link any more.
    const merged = removeItem(linked, 'roles', dev, agile);
    expect(merged.ok && links(merged.value)).toEqual([]);
  });

  it('a file of the previous schema loads unchanged but for the version', () => {
    const old = { ...emptyWorkspace(TODAY), schemaVersion: CURRENT_SCHEMA - 1 };
    const m = migrate(old);
    expect(m.ok && m.value).toEqual({ ...old, schemaVersion: CURRENT_SCHEMA });
    expect(CURRENT_SCHEMA).toBeGreaterThanOrEqual(8);
  });
});

describe('role filter with role links (#338)', () => {
  function linked() {
    const { ws, north, areaId } = mixed();
    const dev = roleId(ws, 'Developers');
    const agile = roleId(ws, 'Agile Team');
    const r = setRoleLinks(ws, areaId, [{ teamId: north, roleId: agile, teamRoleId: dev }]);
    if (!r.ok) throw new Error('link');
    const out = r.value;
    const area = out.areas.find((a) => a.id === areaId)!;
    const planning = area.events.find((e) => e.name === 'PI Planning day 1')!;
    const p = planning.participants.find((x) => x.roleId === agile)!;
    return { ws: out, areaId, dev, agile, planning, p };
  }

  it('the team role counts where it is linked; the area role only with its own people', () => {
    const { ws, areaId, dev, agile, planning, p } = linked();
    expect(invitesRole(ws, areaId, p, dev)).toBe(true);
    expect(invitesRole(ws, areaId, p, roleId(ws, 'Scrum Master'))).toBe(false);
    expect(roleAttendees(ws, areaId, p, planning, dev).sort()).toEqual(['cleo', 'dan']);
    // Star has nobody yet: no one comes as "Agile Team", Cleo and Dan stay Developers.
    expect(roleAttendees(ws, areaId, p, planning, agile)).toEqual([]);
  });

  it('the load by role lists the linked meetings under the filtered role', () => {
    const { ws, areaId, dev, agile } = linked();
    const devRows = loadSummary(ws, { teamId: areaId, roleId: dev }).byRole;
    expect(devRows.map((r) => r.roleId)).toEqual([dev]);
    expect(devRows[0]!.people).toBe(2);
    expect(devRows[0]!.hours).toBeGreaterThan(0);
    const agileRows = loadSummary(ws, { teamId: areaId, roleId: agile }).byRole;
    // The unfilled Agile Team counts one person, not Cleo and Dan.
    expect(agileRows.map((r) => [r.roleId, r.people])).toEqual([[agile, 1]]);
  });

  it('each row of the load by role is the same with and without the role filter', () => {
    const { ws, areaId } = linked();
    const all = loadSummary(ws, { teamId: areaId }).byRole;
    expect(all.length).toBeGreaterThan(0);
    for (const row of all) {
      const one = loadSummary(ws, { teamId: areaId, roleId: row.roleId }).byRole;
      expect(one).toEqual([row]);
    }
  });

  it('the cost of a role includes its linked area meetings, and the roles add up', () => {
    const { ws, areaId, dev } = linked();
    const { ws: before } = mixed();
    const index = { holidays: new Map(), schoolHolidays: new Map(), beyondKnown: false };
    const cost = (w: typeof ws, roleId?: string) =>
      costSummary(w, index, { teamId: areaId, ...(roleId ? { roleId } : {}) }, 100).perWeek;
    expect(cost(ws, dev)).toBeGreaterThan(cost(before, dev));
    const sum = ws.roles.reduce((n, r) => n + cost(ws, r.id), 0);
    expect(sum).toBeCloseTo(cost(ws));
  });

  it('the calendar of a role includes the linked area meetings', () => {
    const { ws, areaId, dev } = linked();
    const ics = exportIcs(
      ws,
      { holidays: new Map(), schoolHolidays: new Map(), beyondKnown: false },
      {
        scope: { teamId: areaId, roleId: dev },
        from: '2027-02-01',
        to: '2027-12-31',
        reminderMinutes: null,
        allDay: { holidays: false, schoolHolidays: false, milestones: false },
        now: new Date('2027-02-10T12:00:00Z'),
        locale: 'en',
      },
    );
    expect(ics).toContain('SUMMARY:PI Planning day 1');
    const plain = exportIcs(
      ws,
      { holidays: new Map(), schoolHolidays: new Map(), beyondKnown: false },
      {
        scope: { teamId: areaId, roleId: roleId(ws, 'Scrum Master') },
        from: '2027-02-01',
        to: '2027-12-31',
        reminderMinutes: null,
        allDay: { holidays: false, schoolHolidays: false, milestones: false },
        now: new Date('2027-02-10T12:00:00Z'),
        locale: 'en',
      },
    );
    expect(plain).not.toContain('SUMMARY:PI Planning day 1');
  });
});
