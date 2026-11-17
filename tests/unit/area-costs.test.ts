import { describe, expect, it } from 'vitest';
import { areaCosts, costliestMeetings } from '../../src/core/areaCosts';
import { unitCostSummary } from '../../src/core/cost';
import { areaAsTeam, type Workspace } from '../../src/core/model';
import type { HolidayIndex } from '../../src/core/regions';
import { areaWorkspace } from '../e2e/area-fixture';

const noIndex = (): HolidayIndex => ({
  holidays: new Map(),
  schoolHolidays: new Map(),
  beyondKnown: false,
});

const ws = () => areaWorkspace() as unknown as Workspace;

describe('areaCosts', () => {
  it('has one row per team, one for the area, and a total that adds them up', () => {
    const w = ws();
    const area = w.areas[0]!;
    const c = areaCosts(w, noIndex(), area, 100);
    expect(c.teams.map((r) => r.unitId)).toEqual(area.teamIds);
    const rows = [...c.teams, c.area];
    expect(c.total.hours).toBeCloseTo(rows.reduce((s, r) => s + r.hours, 0));
    expect(c.total.cost!.perWeek).toBeCloseTo(rows.reduce((s, r) => s + r.cost!.perWeek, 0));
    expect(c.total.cost!.horizon).toBeCloseTo(rows.reduce((s, r) => s + r.cost!.horizon, 0));
    expect(c.total.share).toBeCloseTo(c.total.hours / c.total.capacity);
    expect(c.total.people).toBe(
      new Set([
        ...area.members.map((m) => m.personId),
        ...w.teams
          .filter((t) => area.teamIds.includes(t.id))
          .flatMap((t) => t.members.map((m) => m.personId)),
      ]).size,
    );
  });

  it('matches the cost card of each team and of the area', () => {
    const w = ws();
    const area = w.areas[0]!;
    const c = areaCosts(w, noIndex(), area, 85);
    for (const r of c.teams) {
      const team = w.teams.find((t) => t.id === r.unitId)!;
      expect(r.cost!.perWeek).toBeCloseTo(unitCostSummary(w, noIndex(), team, 85).perWeek);
    }
    expect(c.area.cost!.horizon).toBeCloseTo(
      unitCostSummary(w, noIndex(), areaAsTeam(area), 85).horizon,
    );
  });

  it('a team share is its meeting hours over its members hours in the team', () => {
    const w = ws();
    const c = areaCosts(w, noIndex(), w.areas[0]!);
    const gamma = c.teams.find((r) => r.unitId === 'team-gamma')!;
    // Two members with 20 h each in Gamma.
    expect(gamma.capacity).toBe(40);
    expect(gamma.share).toBeCloseTo(gamma.hours / 40);
    expect(gamma.cost).toBeUndefined();
  });
});

describe('costliestMeetings', () => {
  it('ranks by cost in the horizon, at most five, with each share of all cost', () => {
    const w = ws();
    const top = costliestMeetings(w, noIndex(), w.areas[0]!, 100);
    expect(top.length).toBe(5);
    for (let i = 1; i < top.length; i++)
      expect(top[i - 1]!.horizon).toBeGreaterThanOrEqual(top[i]!.horizon);
    const all = costliestMeetings(w, noIndex(), w.areas[0]!, 100, 1000);
    expect(all.reduce((s, m) => s + m.shareOfAll, 0)).toBeCloseTo(1);
    // A one-off meeting has no weekly average but counts in the horizon.
    const planning = all.find((m) => m.unitId === 'area-payments' && m.event.id === 'ev-planning')!;
    expect(planning.perWeek).toBe(0);
    expect(planning.horizon).toBeGreaterThan(0);
  });
});
