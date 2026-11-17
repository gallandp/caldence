import { describe, expect, it } from 'vitest';
import { areaCosts, costliest, meetingCosts } from '../../src/core/areaCosts';
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

describe('unfilled roles (#264)', () => {
  /** Team Gamma with a weekly meeting for Developers, a role nobody in Gamma holds. */
  const withDevMeeting = (w: Workspace) => {
    const gamma = w.teams.find((t) => t.id === 'team-gamma')!;
    gamma.events.push({
      ...structuredClone(gamma.events[0]!),
      id: 'ev-dev-sync',
      name: 'Dev sync',
      rule: { type: 'weekly', weekday: 1 },
      participants: [{ roleId: 'role-dev', share: 1 }],
    });
    return gamma;
  };

  it('names the roles that add cost but no hours, per team and in the cost summary', () => {
    const w = ws();
    const area = w.areas[0]!;
    const gamma = withDevMeeting(w);
    // Gamma has a PO and an SM only: the Developers of the meeting count as one person.
    const summary = unitCostSummary(w, noIndex(), gamma, 100);
    expect(summary.unfilled).toEqual(['role-dev']);
    expect(summary.perWeek).toBeGreaterThan(0);
    const row = areaCosts(w, noIndex(), area, 100).teams.find((r) => r.unitId === 'team-gamma')!;
    expect(row.cost!.unfilled).toEqual(summary.unfilled);
  });

  it('lists no role once someone holds it', () => {
    const w = ws();
    const gamma = withDevMeeting(w);
    expect(unitCostSummary(w, noIndex(), gamma, 100).unfilled).toEqual(['role-dev']);
    for (const roleId of unitCostSummary(w, noIndex(), gamma, 100).unfilled)
      gamma.members.push({ personId: 'person-kim', roleId });
    expect(unitCostSummary(w, noIndex(), gamma, 100).unfilled).toEqual([]);
  });
});
