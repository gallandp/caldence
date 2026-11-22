import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { setCadenceLength, updateTeam, upsertEvent } from '../../src/core/edit';
import type { Workspace } from '../../src/core/model';
import type { HolidayIndex } from '../../src/core/regions';
import {
  countChanges,
  effectScope,
  listChanges,
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

  it("shows a team's own change that the area's load rounds away (#340)", () => {
    const w = ws();
    const team = w.teams.find((t) => t.id === 'team-alpha')!;
    const refinement = { ...team.events.find((e) => e.name === 'Backlog Refinement')! };
    const next = upsertEvent(structuredClone(w), team.id, { ...refinement, duration: 30 })[0];
    const pct = (e: { share: number }) => Math.round(e.share * 100);
    const at = (x: Workspace, id: string) => whatIfEffect(x, noIndex(), id)!;
    const area = [at(w, 'area-payments'), at(next, 'area-payments')];
    const own = [at(w, team.id), at(next, team.id)];
    expect(area.map(pct)).toEqual([13, 13]);
    expect(own.map(pct)).toEqual([16, 14]);
    expect(own[0]!.hours - own[1]!.hours).toBeCloseTo(area[0]!.hours - area[1]!.hours);
  });

  it('counts the teams in step with the area', () => {
    const w = ws();
    const area = w.areas[0]!;
    const e = whatIfEffect(w, noIndex(), area.id)!;
    if (!e.inStep) return; // the fixture has no reference cadence
    expect(e.inStep.of).toBe(area.teamIds.length);
  });

  it('counts against the saved reference, so a what-if on the first team does not move it (#470)', () => {
    const saved = ws();
    delete saved.areas[0]!.cadence;
    // No two teams share a cadence: the first, Alpha's 2-week sprints, is the reference.
    const before = whatIfEffect(saved, noIndex(), 'area-payments', undefined, saved)!;
    expect(before.inStep).toMatchObject({ n: 1, of: 4 });
    const next = setCadenceLength(saved, 'team-alpha', 4);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    // Alone, Alpha's new 4 weeks would be the reference and Alpha would stay aligned.
    expect(whatIfEffect(next.value, noIndex(), 'area-payments')!.inStep).toMatchObject({
      n: 1,
      of: 4,
    });
    const after = whatIfEffect(next.value, noIndex(), 'area-payments', undefined, saved)!;
    expect(after.inStep).toMatchObject({ n: 0, of: 4 });
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

  it('counts a new cadence length once, with the meetings it moves', () => {
    const base = ws();
    const team = base.teams.find((t) => t.events.some((e) => e.rule.type === 'cadence-day'))!;
    const r = setCadenceLength(base, team.id, team.cadence.lengthWeeks + 1);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(countChanges(base, r.value)).toBe(1);
  });

  it('counts a meeting what-if and a length what-if as 2', () => {
    const base = ws();
    const team = base.teams.find((t) => t.events.some((e) => e.rule.type === 'cadence-day'))!;
    const review = team.events.filter((e) => e.rule.type === 'cadence-day').at(-1)!;
    const weekly = upsertEvent(base, team.id, {
      ...review,
      rule: { type: 'weekly', weekday: 5 },
    })[0];
    const r = setCadenceLength(weekly, team.id, team.cadence.lengthWeeks + 1);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(countChanges(base, r.value)).toBe(2);
  });
});

describe('listChanges (#506)', () => {
  it('names a cadence change once and a meeting change with its old and new values', () => {
    const base = ws();
    const team = base.teams.find((t) => t.events.some((e) => e.rule.type === 'cadence-day'))!;
    const r = setCadenceLength(base, team.id, team.cadence.lengthWeeks + 1);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const weekly = team.events.find((e) => e.rule.type === 'weekly')!;
    const next = upsertEvent(r.value, team.id, { ...weekly, duration: weekly.duration + 15 })[0];
    expect(listChanges(base, next)).toEqual([
      {
        kind: 'cadence',
        unitId: team.id,
        from: team.cadence,
        to: next.teams.find((t) => t.id === team.id)!.cadence,
      },
      {
        kind: 'meeting',
        unitId: team.id,
        eventId: weekly.id,
        name: weekly.name,
        from: { duration: weekly.duration, rule: weekly.rule },
        to: { duration: weekly.duration + 15, rule: weekly.rule },
      },
    ]);
  });
});

describe('teams that fall out of step (#506)', () => {
  it('lists the teams not aligned, with the reason', () => {
    const saved = ws();
    const area = saved.areas[0]!;
    const before = whatIfEffect(saved, noIndex(), area.id, undefined, saved)!;
    if (!before.inStep) throw new Error('the fixture area needs a reference cadence');
    const inStep = area.teamIds.find((id) => !before.inStep!.off.some((o) => o.teamId === id))!;
    const len = saved.teams.find((t) => t.id === inStep)!.cadence.lengthWeeks;
    const r = setCadenceLength(saved, inStep, len + 1);
    if (!r.ok) throw new Error('length');
    const after = whatIfEffect(r.value, noIndex(), area.id, undefined, saved)!;
    expect(before.inStep.off.map((o) => o.teamId)).not.toContain(inStep);
    expect(after.inStep!.off.map((o) => o.teamId)).toEqual(
      [...before.inStep.off.map((o) => o.teamId), inStep].sort(
        (a, b) => area.teamIds.indexOf(a) - area.teamIds.indexOf(b),
      ),
    );
    const lost = after.inStep!.off.find((o) => o.teamId === inStep)!;
    expect(lost.reasons.some((x) => x.kind === 'length')).toBe(true);
    expect(after.inStep!.n).toBe(before.inStep.n - 1);
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
