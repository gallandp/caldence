import { describe, expect, it } from 'vitest';
import { areaCosts } from '../../src/core/areaCosts';
import { compareOrgCadences } from '../../src/core/areaOverview';
import { costSummary } from '../../src/core/cost';
import { ORG_UNIT, orgArea, type Workspace } from '../../src/core/model';
import type { HolidayIndex } from '../../src/core/regions';
import example from '../../src/data/examples/example.caldence.json';

const noIndex = (): HolidayIndex => ({
  holidays: new Map(),
  schoolHolidays: new Map(),
  beyondKnown: false,
});
const ws = () => structuredClone(example) as unknown as Workspace;

/** The organisation's summary on its page (#450): the area Overview's figures for all teams. */
describe('organisation summary', () => {
  it('takes the area verdict where the area has a cadence, else the cadence most share', () => {
    const w = ws();
    const c = compareOrgCadences(w, '2027-01-04', 12);
    expect(c.rows.map((r) => r.teamId)).toEqual(w.teams.map((t) => t.id));
    // Team Beta and Team Delta share the 1-week cadence that most teams have.
    expect(c.reference?.teamId).toBe('team-beta');
    // Team Gamma's 2-week sprints fit Commerce's 10-week PI; Team Alpha starts on Thursday.
    expect(c.rows.filter((r) => !r.inStep).map((r) => r.teamId)).toEqual(['team-alpha']);
    // Without the area cadence Team Gamma is compared with the common cadence too.
    delete w.areas[0]!.cadence;
    const peer = compareOrgCadences(w, '2027-01-04', 12);
    expect(peer.rows.filter((r) => !r.inStep).map((r) => r.teamId)).toEqual([
      'team-alpha',
      'team-gamma',
    ]);
  });

  it('has a cost row per team and per area, and its total equals Meeting load', () => {
    const w = ws();
    w.organisation = {
      events: [structuredClone(w.areas[0]!.events[0]!)].map((e) => ({ ...e, id: 'org-sync' })),
    };
    const c = areaCosts(w, noIndex(), orgArea(w), 100);
    expect(c.teams.map((r) => r.unitId)).toEqual(w.teams.map((t) => t.id));
    expect(c.areas.map((r) => r.unitId)).toEqual(w.areas.map((a) => a.id));
    const rows = [...c.teams, ...c.areas, c.area];
    expect(c.total.cost!.perWeek).toBeCloseTo(rows.reduce((s, r) => s + r.cost!.perWeek, 0));
    const load = costSummary(w, noIndex(), { teamId: ORG_UNIT }, 100);
    expect(load.perWeek).toBeGreaterThan(0);
    expect(c.total.cost!.perWeek).toBeCloseTo(load.perWeek);
    expect(c.total.cost!.horizon).toBeCloseTo(load.horizon);
  });
});
