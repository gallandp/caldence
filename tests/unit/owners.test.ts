import { describe, expect, it } from 'vitest';
import example from '../../src/data/examples/example.caldence.json';
import type { Workspace } from '../../src/core/model';
import {
  hasOwnerRoles,
  ownerGaps,
  ownerNames,
  ownerRole,
  ownerSlots,
  setOwnerMode,
} from '../../src/core/owners';
import { validate } from '../../src/core/validate';

const base = () => structuredClone(example) as unknown as Workspace;

/** The example with the Product Owner marked as business half (Alex in Alpha and Beta). */
function tandem(): Workspace {
  const ws = base();
  ws.roles.find((r) => r.id === 'role-po')!.owner = 'business';
  return ws;
}
const team = (ws: Workspace, id: string) => ws.teams.find((t) => t.id === id)!;

describe('owner tandems (#331)', () => {
  it('changes nothing for files without tandem roles', () => {
    const ws = base();
    expect(hasOwnerRoles(ws)).toBe(false);
    expect(ownerSlots(ws, team(ws, 'team-alpha'))).toEqual([]);
    expect(ownerGaps(ws, team(ws, 'team-alpha'))).toBe(0);
  });

  it('validates the role half and the unit mode', () => {
    expect(validate(tandem()).ok).toBe(true);
    const badRole = base();
    (badRole.roles[0] as { owner?: string }).owner = 'both';
    const r = validate(badRole);
    expect(!r.ok && r.errors[0]?.path).toBe('roles.0.owner');
    const badMode = base();
    (badMode.areas[0] as { ownerMode?: string }).ownerMode = 'nobody';
    const m = validate(badMode);
    expect(!m.ok && m.errors[0]?.path).toBe('areas.0.ownerMode');
  });

  it('counts only a missing wanted owner as a gap', () => {
    const ws = tandem();
    expect(ownerSlots(ws, team(ws, 'team-alpha'))).toEqual([
      { half: 'business', personIds: ['person-alex'] },
      { half: 'technical', personIds: [] },
    ]);
    expect(ownerGaps(ws, team(ws, 'team-alpha'))).toBe(1);
    const business = setOwnerMode(ws, 'team-alpha', 'business');
    expect(business.ok).toBe(true);
    if (!business.ok) return;
    expect(ownerGaps(business.value, team(business.value, 'team-alpha'))).toBe(0);
    const technical = setOwnerMode(ws, 'team-alpha', 'technical');
    if (!technical.ok) throw new Error('mode refused');
    expect(ownerSlots(technical.value, team(technical.value, 'team-alpha'))).toEqual([
      { half: 'technical', personIds: [] },
    ]);
  });

  it('keeps the other owner stored when switching to one half and back', () => {
    const one = setOwnerMode(tandem(), 'team-alpha', 'technical');
    if (!one.ok) throw new Error('mode refused');
    expect(team(one.value, 'team-alpha').ownerMode).toBe('technical');
    expect(team(one.value, 'team-alpha').members).toContainEqual({
      personId: 'person-alex',
      roleId: 'role-po',
    });
    const back = setOwnerMode(one.value, 'team-alpha', 'both');
    if (!back.ok) throw new Error('mode refused');
    expect('ownerMode' in team(back.value, 'team-alpha')).toBe(false);
    expect(ownerNames(back.value, team(back.value, 'team-alpha'))).toEqual(['Alex']);
    expect(setOwnerMode(tandem(), 'nope', 'both').ok).toBe(false);
  });

  it('reuses the marked role of a level and creates one per level otherwise', () => {
    const ws = tandem();
    expect(ownerRole(ws, 'business', 'team', 'x', '#000000')[1]).toBe('role-po');
    const [withArea, areaRole] = ownerRole(
      ws,
      'business',
      'area',
      'Business area owner',
      '#123456',
    );
    expect(areaRole).not.toBe('role-po');
    expect(withArea.roles.find((r) => r.id === areaRole)).toMatchObject({
      name: 'Business area owner',
      owner: 'business',
    });
    expect(validate(withArea).ok).toBe(true);
    // An unused role named for the other level is not taken; one with this name is.
    const [withTeam, tech] = ownerRole(withArea, 'technical', 'team', 'Technical PO', '#123456');
    const [, areaTech] = ownerRole(
      withTeam,
      'technical',
      'area',
      'Technical area owner',
      '#000000',
    );
    expect(areaTech).not.toBe(tech);
    expect(ownerRole(withTeam, 'technical', 'area', 'Technical PO', '#000000')[1]).toBe(tech);
  });
});
