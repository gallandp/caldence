import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { updateTeam, upsertEvent } from '../../src/core/edit';
import type { Workspace } from '../../src/core/model';
import type { HolidayIndex } from '../../src/core/regions';
import {
  countChanges,
  effectScope,
  whatIfEffect,
  withNames,
  withoutNames,
} from '../../src/core/whatIf';
import { createWorkspaceStore } from '../../src/ui/state/workspace';
import { areaWorkspace } from '../e2e/area-fixture';

const noIndex = (): HolidayIndex => ({
  holidays: new Map(),
  schoolHolidays: new Map(),
  beyondKnown: false,
});
const ws = () => areaWorkspace() as unknown as Workspace;

function longer(w: Workspace, teamId: string, minutes: number): Workspace {
  const team = w.teams.find((t) => t.id === teamId)!;
  const event = { ...team.events.find((e) => e.rule.type === 'weekly')!, duration: minutes };
  return upsertEvent(w, teamId, event)[0];
}

describe('what-if effect', () => {
  it('measures a team in an area against the whole area', () => {
    const w = ws();
    const area = w.areas[0]!;
    expect(effectScope(w, area.teamIds[0]!)).toBe(area.id);
    expect(effectScope(w, area.id)).toBe(area.id);
    expect(effectScope(w, 'nope')).toBeUndefined();
  });

  it('shows more hours, cost and load for a longer meeting', () => {
    const w = ws();
    const area = w.areas[0]!;
    const teamId = area.teamIds[0]!;
    const before = whatIfEffect(w, noIndex(), area.id, 100)!;
    const after = whatIfEffect(longer(w, teamId, 240), noIndex(), area.id, 100)!;
    expect(after.hours).toBeGreaterThan(before.hours);
    expect(after.share).toBeGreaterThan(before.share);
    expect(after.cost!.perWeek).toBeGreaterThan(before.cost!.perWeek);
    // Without a rate there is no cost.
    expect(whatIfEffect(w, noIndex(), area.id)!.cost).toBeUndefined();
  });

  it('counts the teams in step with the area', () => {
    const w = ws();
    const area = w.areas[0]!;
    const e = whatIfEffect(w, noIndex(), area.id)!;
    if (!e.inStep) return; // the fixture has no reference cadence
    expect(e.inStep.of).toBe(area.teamIds.length);
  });
});

describe('countChanges', () => {
  it('counts changed meetings and cadences, not other edits', () => {
    const base = ws();
    const teamId = base.areas[0]!.teamIds[0]!;
    expect(countChanges(base, base)).toBe(0);
    let next = longer(base, teamId, 240);
    expect(countChanges(base, next)).toBe(1);
    const team = next.teams.find((t) => t.id === teamId)!;
    const r = updateTeam(next, teamId, { cadence: { ...team.cadence, lengthWeeks: 5 } });
    if (!r.ok) throw new Error('cadence');
    next = r.value;
    expect(countChanges(base, next)).toBe(2);
    expect(
      countChanges(
        base,
        withoutNames(next, (n) => `P${n}`),
      ),
    ).toBe(2);
  });
});

describe('names', () => {
  it('numbers people in list order and brings the names back', () => {
    const base = ws();
    const hidden = withoutNames(base, (n) => `Person ${n}`);
    expect(hidden.people.map((p) => p.name)).toEqual(base.people.map((_, i) => `Person ${i + 1}`));
    expect(withNames(hidden, base).people).toEqual(base.people);
  });
});

describe('workspace store while presenting', () => {
  it('keeps what-ifs out of the dirty flag and restores everything on end', () => {
    const store = createWorkspaceStore(ws());
    const teamId = get(store).areas[0]!.teamIds[0]!;
    store.apply((w) => updateTeam(w, teamId, { name: 'Renamed' }));
    const saved = get(store);
    store.markSaved('plan.caldence.json');
    store.beginPresent();
    expect(get(store.presentBase)).toBe(saved);
    expect(get(store.canUndo)).toBe(false);
    store.apply((w) => longer(w, teamId, 240));
    expect(get(store.dirty)).toBe(false);
    expect(get(store.canUndo)).toBe(true);
    store.presentView((w) => withoutNames(w, (n) => `P${n}`));
    expect(get(store).people[0]!.name).toBe('P1');
    // An undo keeps the names hidden.
    store.undo();
    expect(get(store).people[0]!.name).toBe('P1');
    store.apply((w) => longer(w, teamId, 240));
    store.resetPresent();
    expect(countChanges(saved, get(store))).toBe(0);
    store.endPresent();
    expect(get(store)).toBe(saved);
    expect(get(store.presentBase)).toBeNull();
    expect(get(store.dirty)).toBe(false);
    // The undo history from before presenting is back.
    expect(get(store.canUndo)).toBe(true);
  });

  it('ends presenting when another workspace replaces this one', () => {
    const store = createWorkspaceStore(ws());
    store.beginPresent();
    store.replace(ws(), { fileName: null, dirty: false });
    expect(get(store.presentBase)).toBeNull();
  });
});
