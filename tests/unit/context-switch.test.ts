import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  contextHint,
  contextHintIfAdded,
  contextHints,
  contextLoss,
  contextOverride,
  pruneContextOverrides,
  setContextOverride,
  teamCount,
} from '../../src/core/contextSwitch';
import { duplicateTeam, removeItem, updateTeam, updateSettings } from '../../src/core/edit';
import { emptyWorkspace, type Team, type Workspace } from '../../src/core/model';
import { teamToTemplate, validateTemplate } from '../../src/core/template';
import { validate } from '../../src/core/validate';
import { LIMITS } from '../../src/core/limits';
import { createWorkspaceStore } from '../../src/ui/state/workspace';

function team(id: string, personIds: string[], extra: Partial<Team> = {}): Team {
  return {
    id,
    name: `Team ${id}`,
    cadence: { kind: 'sprint', lengthWeeks: 2, start: '2026-01-05' },
    members: personIds.map((personId) => ({ personId, roleId: 'r1' })),
    memberHours: {},
    assumptions: {},
    cycles: [],
    events: [],
    ...extra,
  };
}

/** Ben in teams a, b, c; Mia in a and b; Ola only in an area. */
function ws(): Workspace {
  const w = emptyWorkspace('2026-01-05');
  w.roles = [{ id: 'r1', name: 'Developer', colour: '#336699' }];
  w.people = [
    { id: 'ben', name: 'Ben' },
    { id: 'mia', name: 'Mia' },
    { id: 'ola', name: 'Ola' },
  ];
  w.teams = [team('a', ['ben', 'mia']), team('b', ['ben', 'mia']), team('c', ['ben'])];
  w.areas = [
    {
      id: 'x',
      name: 'Area',
      teamIds: ['a', 'b', 'c'],
      members: [{ personId: 'ola', roleId: 'r1' }],
      memberHours: {},
      cycles: [],
      events: [],
    },
  ];
  return w;
}

describe('context switch counting (#321)', () => {
  it('counts distinct teams, roles twice in one team once, areas not at all', () => {
    const w = ws();
    w.teams[0]!.members.push({ personId: 'ben', roleId: 'r2' });
    expect(teamCount(w, 'ben')).toBe(3);
    expect(teamCount(w, 'mia')).toBe(2);
    expect(teamCount(w, 'ola')).toBe(0);
  });

  it("uses Weinberg's table", () => {
    expect([1, 2, 3, 4, 5, 9].map(contextLoss)).toEqual([0, 0.2, 0.4, 0.6, 0.75, 0.75]);
  });

  it('hints from the threshold, default 3', () => {
    const w = ws();
    expect(contextHint(w, 'ben')).toEqual({ personId: 'ben', teams: 3, loss: 0.4 });
    expect(contextHint(w, 'mia')).toBeNull();
    expect(contextHints(w).map((h) => h.personId)).toEqual(['ben']);
    w.settings.thresholds.contextSwitch = 2;
    expect(contextHints(w).map((h) => h.personId)).toEqual(['ben', 'mia']);
  });

  it('counts the new team before adding someone', () => {
    const w = ws();
    expect(contextHintIfAdded(w, 'mia', 'c')).toEqual({ personId: 'mia', teams: 3, loss: 0.4 });
    expect(contextHintIfAdded(w, 'mia', 'a')).toBeNull();
    expect(contextHintIfAdded(w, 'ola', 'c')).toBeNull();
    expect(contextHintIfAdded(w, undefined, 'c')).toBeNull();
  });
});

describe('override on the membership (#321)', () => {
  it('is stored on the team, not on the person, and mutes the hint', () => {
    const w = setContextOverride(ws(), 'c', 'ben', '  Release support until May  ');
    expect(w.teams[2]!.contextOverrides).toEqual({
      ben: { teams: 3, reason: 'Release support until May' },
    });
    expect(w.people.find((p) => p.id === 'ben')).toEqual({ id: 'ben', name: 'Ben' });
    expect(contextHint(w, 'ben')?.overriddenIn).toBe('c');
    expect(validate(w).ok).toBe(true);
    // An empty reason is left out; null takes the override back.
    const plain = setContextOverride(ws(), 'c', 'ben', ' ');
    expect(plain.teams[2]!.contextOverrides).toEqual({ ben: { teams: 3 } });
    expect(setContextOverride(plain, 'c', 'ben', null).teams[2]!.contextOverrides).toBeUndefined();
  });

  it('ignores a person who is not in the team', () => {
    const w = setContextOverride(ws(), 'c', 'mia', 'x');
    expect(w.teams[2]!.contextOverrides).toBeUndefined();
  });

  it('no longer holds when the number of teams changes', () => {
    const w = setContextOverride(ws(), 'c', 'ben', null);
    const over = setContextOverride(w, 'c', 'ben', '');
    over.teams.push(team('d', ['ben']));
    expect(contextOverride(over, 'c', 'ben')).toBeUndefined();
    expect(contextHint(over, 'ben')).toEqual({ personId: 'ben', teams: 4, loss: 0.6 });
    const pruned = pruneContextOverrides(over);
    expect(pruned.teams[2]!.contextOverrides).toBeUndefined();
    // Back to 3 teams, the dropped override does not come back.
    pruned.teams.pop();
    expect(contextHint(pruned, 'ben')?.overriddenIn).toBeUndefined();
  });

  it('is cleared when the membership in that team changes', () => {
    const before = setContextOverride(ws(), 'c', 'ben', 'Planned');
    const hours = updateTeam(before, 'c', { memberHours: { ben: 8 } });
    if (!hours.ok) throw new Error('update failed');
    expect(pruneContextOverrides(hours.value, before).teams[2]!.contextOverrides).toBeUndefined();
    // A change elsewhere keeps it.
    const other = updateTeam(before, 'a', { name: 'Renamed' });
    if (!other.ok) throw new Error('update failed');
    expect(pruneContextOverrides(other.value, before)).toBe(other.value);
  });

  it('keeps an override set together with the membership', () => {
    const before = ws();
    const after = ws();
    after.teams[2]!.members.push({ personId: 'mia', roleId: 'r1' });
    const set = setContextOverride(after, 'c', 'mia', '');
    expect(pruneContextOverrides(set, before).teams[2]!.contextOverrides).toEqual({
      mia: { teams: 3 },
    });
  });

  it('goes with the person when they are deleted', () => {
    const w = setContextOverride(ws(), 'c', 'ben', '');
    const r = removeItem(w, 'people', 'ben');
    if (!r.ok) throw new Error('remove failed');
    expect(r.value.teams[2]!.contextOverrides).toBeUndefined();
    expect(validate(r.value).ok).toBe(true);
  });

  it('is pruned by every change through the workspace store', () => {
    const store = createWorkspaceStore(setContextOverride(ws(), 'c', 'ben', ''));
    store.apply((w) => updateTeam(w, 'c', { members: [] }));
    expect(get(store).teams[2]!.contextOverrides).toBeUndefined();
  });

  it('never reaches a template', () => {
    const w = setContextOverride(ws(), 'c', 'ben', 'Planned');
    const tpl = teamToTemplate(w, 'c', { id: 'tpl', name: 'T', description: '' });
    expect(JSON.stringify(tpl)).not.toContain('contextOverrides');
  });
});

describe('validation (#321)', () => {
  it('checks the threshold and the overrides', () => {
    expect(
      validate(
        updateSettings(ws(), { thresholds: { warnFactor: 1.5, maxFte: 0.6, contextSwitch: 4 } }),
      ).ok,
    ).toBe(true);
    for (const bad of [1, 2.5, LIMITS.teams + 1]) {
      const w = ws();
      w.settings.thresholds.contextSwitch = bad;
      expect(validate(w).ok).toBe(false);
    }
    const w = ws();
    w.teams[2]!.contextOverrides = { nobody: { teams: 3 } };
    expect(validate(w).ok).toBe(false);
    w.teams[2]!.contextOverrides = { ben: { teams: 3, reason: 'x'.repeat(201) } };
    expect(validate(w).ok).toBe(false);
    w.teams[2]!.contextOverrides = { ben: { teams: 1 } };
    expect(validate(w).ok).toBe(false);
  });
});

describe('override edge cases (#321)', () => {
  it('ends in source and copy when a team is duplicated', () => {
    const [dup] = duplicateTeam(setContextOverride(ws(), 'c', 'ben', ''), 'c', 'Copy');
    const pruned = pruneContextOverrides(dup);
    expect(pruned.teams.every((t) => t.contextOverrides === undefined)).toBe(true);
  });

  it('ends for the replacement when a person is merged into another', () => {
    const w = setContextOverride(ws(), 'c', 'ben', '');
    const r = removeItem(w, 'people', 'ben', 'mia');
    if (!r.ok) throw new Error('merge failed');
    expect(r.value.teams[2]!.contextOverrides).toBeUndefined();
    expect(contextHint(r.value, 'mia')).toEqual({ personId: 'mia', teams: 3, loss: 0.4 });
  });

  it('ends in one team when the person joins another, and undo brings it back', () => {
    const store = createWorkspaceStore(setContextOverride(ws(), 'c', 'ben', 'Planned'));
    store.apply((w) => ({ ...w, teams: [...w.teams, team('d', ['ben'])] }));
    expect(get(store).teams[2]!.contextOverrides).toBeUndefined();
    store.undo();
    expect(get(store).teams[2]!.contextOverrides).toEqual({
      ben: { teams: 3, reason: 'Planned' },
    });
  });

  it('refuses unknown or prototype keys from a file', () => {
    for (const key of ['__proto__', 'constructor', 'nobody']) {
      const w = ws();
      w.teams[2]!.contextOverrides = JSON.parse(`{"${key}": {"teams": 3}}`);
      expect(validate(w).ok).toBe(false);
    }
  });

  it('refuses a template that carries overrides', () => {
    const w = ws();
    const tpl = JSON.parse(
      JSON.stringify(teamToTemplate(w, 'c', { id: 'tpl', name: 'T', description: '' })),
    );
    tpl.team.contextOverrides = {};
    const r = validateTemplate(tpl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.key).toBe('template.error.personal');
  });
});
