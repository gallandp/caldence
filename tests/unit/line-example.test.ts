import { describe, expect, it } from 'vitest';
import type { Workspace } from '../../src/core/model';
import { validate } from '../../src/core/validate';
import { freeFte, syncAssignments } from '../../src/core/line';
import { contextHintIfAdded } from '../../src/core/contextSwitch';
import { ownerGaps } from '../../src/core/owners';
import { lineExample } from '../../src/data/examples';
import { lineExampleWorkspace } from '../../src/data/examples/line-example';

const byName = (w: Workspace, name: string) => w.people.find((p) => p.name === name)!;
const team = (w: Workspace, name: string) => w.teams.find((t) => t.name === name)!;
const teamsOf = (w: Workspace, id: string) =>
  w.teams.filter((t) => t.members.some((m) => m.personId === id)).map((t) => t.name);
const staffed = (w: Workspace, t: string, demandId: string) =>
  w
    .assignments!.filter((a) => a.teamId === team(w, t).id && a.demandId === demandId)
    .reduce((s, a) => s + a.fte, 0);

describe('line organisation example (#323)', () => {
  const w = lineExampleWorkspace('de');

  it('is valid, at the target scale and within the limits of #315', () => {
    const v = validate(w);
    expect(v.ok ? [] : v.errors).toEqual([]);
    const meetings = [...w.teams, ...w.areas].reduce((n, u) => n + u.events.length, 0);
    expect([w.teams.length, w.areas.length, w.lineUnits!.length]).toEqual([61, 11, 16]);
    const line = w.people.filter((p) => p.lineUnitId);
    expect(line.length).toBeGreaterThanOrEqual(480);
    expect(w.people.length).toBeLessThanOrEqual(1000);
    expect(meetings).toBeGreaterThanOrEqual(600);
    expect(w.companies).toHaveLength(3);
    // Every person is in the line or in a unit.
    const inUnit = new Set(
      [...w.teams, ...w.areas].flatMap((u) => u.members.map((m) => m.personId)),
    );
    expect(w.people.filter((p) => !p.lineUnitId && !inUnit.has(p.id))).toEqual([]);
  });

  it('is the same on every run and opens on the organisation', () => {
    expect(JSON.stringify(lineExampleWorkspace('de'))).toBe(JSON.stringify(w));
    expect(w.view).toEqual({ unit: '@organisation', page: 'team' });
  });

  it('holds the workshop cases of the click dummy', () => {
    const anna = byName(w, 'Anna Becker').id;
    expect(freeFte(w, anna)).toBe(0.2);
    expect(team(w, 'Ordermatik').cadence.kind).toBe('sprint');
    expect(team(w, 'Ordermatik').demands![0]).toMatchObject({ skillId: 'lag', fte: 0.4 });
    expect(staffed(w, 'Ordermatik', 'd1')).toBe(0);

    const ben = byName(w, 'Ben Hoffmann');
    expect(teamsOf(w, ben.id)).toEqual(['Lagerlicht', 'Partnerhafen']);
    expect(ben.skillIds).toContain('han');
    expect(team(w, 'Routenwerk').demands![0]).toMatchObject({ skillId: 'han', fte: 0.5 });
    expect(contextHintIfAdded(w, ben.id, team(w, 'Routenwerk').id)).toMatchObject({ teams: 3 });

    expect(freeFte(w, byName(w, 'Kim Lehmann').id)).toBe(0);

    const selin = byName(w, 'Selin Arslan').id;
    expect(teamsOf(w, selin)).toEqual(['Ordermatik', 'Lagerlicht']);
    expect(team(w, 'Ordermatik').memberHours[selin]).toBeUndefined();
    expect(freeFte(w, selin)).toBe(-1);

    expect(staffed(w, 'Lagerlicht', 'd1')).toBeCloseTo(1.3);
    expect(team(w, 'Routenwerk').demands![2]).toEqual({ id: 'd3', fte: 0.5, roleId: 'sm' });
    expect(ownerGaps(w, team(w, 'Partnerhafen'))).toBe(1);
    expect(team(w, 'Torwacht').ownerMode).toBe('technical');
    expect(ownerGaps(w, team(w, 'Torwacht'))).toBe(0);
  });

  it('keeps assignments in line with the members', () => {
    expect(syncAssignments(structuredClone(w)).assignments).toEqual(w.assignments);
  });

  it('has both open and fully staffed demands', () => {
    const states = w.teams.flatMap((t) =>
      (t.demands ?? []).map((d) => staffed(w, t.name, d.id) >= d.fte - 1e-9),
    );
    expect(states).toContain(true);
    expect(states).toContain(false);
  });

  it('follows the UI language and gets a fresh id', async () => {
    const en = await lineExample('en');
    const de = await lineExample('de');
    expect(en.organisation!.name).toBe('Velmora Group');
    expect(de.organisation!.name).toBe('Velmora Gruppe');
    expect(en.skills!.map((s) => s.name)).toContain('Orvalis Warehouse');
    expect(en.teams.map((t) => t.name)).toEqual(de.teams.map((t) => t.name));
    expect(en.id).not.toBe(de.id);
  });

  it('uses no name of the dummy that was renamed', () => {
    expect(JSON.stringify(w)).not.toMatch(/Atlas/);
  });
});
