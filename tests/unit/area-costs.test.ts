import { describe, expect, it } from 'vitest';
import { areaCosts, costliest, meetingCosts } from '../../src/core/areaCosts';
import { teamLoad } from '../../src/core/areaOverview';
import { loadPerWeek } from '../../src/core/load';
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

describe('costliest', () => {
  it('ranks by the cost of the period, at most five, with each share of all cost', () => {
    const w = ws();
    const list = meetingCosts(w, noIndex(), w.areas[0]!, 100);
    for (const period of ['week', 'horizon'] as const) {
      const top = costliest(list, period);
      expect(top.length).toBe(5);
      for (let i = 1; i < top.length; i++)
        expect(top[i - 1]!.cost).toBeGreaterThanOrEqual(top[i]!.cost);
      const all = costliest(list, period, 1000);
      expect(all.reduce((s, m) => s + m.shareOfAll, 0)).toBeCloseTo(1);
    }
    // A one-off meeting has no weekly average but counts in the horizon.
    const isPlanning = (m: { unitId: string; event: { id: string } }) =>
      m.unitId === 'area-payments' && m.event.id === 'ev-planning';
    expect(costliest(list, 'week', 1000).some(isPlanning)).toBe(false);
    expect(costliest(list, 'horizon', 1000).some(isPlanning)).toBe(true);
  });

  it('names roles nobody holds, which still cost one person', () => {
    const w = ws();
    const planning = meetingCosts(w, noIndex(), w.areas[0]!, 100).find(
      (m) => m.unitId === 'area-payments' && m.event.id === 'ev-planning',
    )!;
    expect(planning.unfilled).toEqual([]);
    const forum = meetingCosts(w, noIndex(), w.areas[0]!, 100).find(
      (m) => m.event.id === 'ev-po-forum',
    )!;
    expect(forum.invited).toBe(5);
  });
});

describe('areaCosts without hours', () => {
  it('flags meeting hours that have no weekly hours to be measured against', () => {
    const w = ws();
    const gamma = w.teams.find((t) => t.id === 'team-gamma')!;
    for (const id of Object.keys(gamma.memberHours)) gamma.memberHours[id] = 0;
    const row = areaCosts(w, noIndex(), w.areas[0]!).teams.find((r) => r.unitId === 'team-gamma')!;
    expect(row.noHours).toBe(true);
  });
});

describe('one meeting load in the cost table and the heat map (#262)', () => {
  it('a team with weekly meetings only has the same share in both', () => {
    const w = ws();
    const area = w.areas[0]!;
    for (const t of w.teams) t.events = t.events.filter((e) => e.rule.type === 'weekly');
    const gamma = w.teams.find((t) => t.id === 'team-gamma')!;
    expect(gamma.events.length).toBeGreaterThan(0);
    const row = areaCosts(w, noIndex(), area).teams.find((r) => r.unitId === gamma.id)!;
    // Whole weeks inside the horizon: every one holds each weekly meeting once.
    const weeks = loadPerWeek(w, noIndex()).slice(1, -1);
    const cells = teamLoad(w, gamma, weeks);
    expect(row.share).toBeGreaterThan(0);
    for (const c of cells) expect(c.share).toBeCloseTo(row.share);
  });

  it('a one-off meeting raises its week only, not the recurring share', () => {
    const w = ws();
    const area = w.areas[0]!;
    for (const t of w.teams) t.events = t.events.filter((e) => e.rule.type === 'weekly');
    const gamma = w.teams.find((t) => t.id === 'team-gamma')!;
    const weeks = () => loadPerWeek(w, noIndex()).slice(1, -1);
    const monday = weeks()[2]!.monday;
    const share = areaCosts(w, noIndex(), area).teams.find((r) => r.unitId === gamma.id)!.share;
    gamma.events.push({
      ...structuredClone(gamma.events[0]!),
      id: 'ev-once',
      rule: { type: 'once', date: monday },
    });
    const after = areaCosts(w, noIndex(), area).teams.find((r) => r.unitId === gamma.id)!;
    expect(after.share).toBeCloseTo(share);
    const cells = teamLoad(w, gamma, weeks());
    expect(cells.find((c) => c.monday === monday)!.share).toBeGreaterThan(share);
    expect(cells.find((c) => c.monday !== monday)!.share).toBeCloseTo(share);
  });
});
