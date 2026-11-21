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

  it('keeps with each reason whether it is about an area cadence or the shared one (#478)', () => {
    const w = ws();
    w.teams.find((t) => t.id === 'team-gamma')!.cadence.lengthWeeks = 3;
    const c = compareOrgCadences(w, '2027-01-04', 12);
    const gamma = c.rows.find((r) => r.teamId === 'team-gamma')!;
    // Judged by Commerce's 10-week PI although the organisation compares with a 1-week cadence.
    expect(gamma.reasons).toContainEqual({
      kind: 'length',
      weeks: 3,
      reference: 10,
      fromArea: true,
    });
  });

  it('counts what the lead line needs: by area, others, and how many share the reference', () => {
    const c = compareOrgCadences(ws(), '2027-01-04', 12);
    expect({ byArea: c.byArea, others: c.others, sharing: c.sharing }).toEqual({
      byArea: 2,
      others: 2,
      sharing: 2,
    });
  });

  it('on a tie takes the first team as the reference and says nobody shares it', () => {
    const w = ws();
    w.areas = [];
    // Four different cadences: no two teams share one.
    w.teams[1]!.cadence = { kind: 'sprint', lengthWeeks: 3, start: '2027-01-04' };
    w.teams[3]!.cadence = { kind: 'pi', lengthWeeks: 10, start: '2027-01-04' };
    const c = compareOrgCadences(w, '2027-01-04', 12);
    expect(c.reference?.teamId).toBe(w.teams[0]!.id);
    expect(c.sharing).toBe(1);
    expect(c.byArea).toBe(0);
    expect(c.rows.filter((r) => r.inStep).map((r) => r.teamId)).toEqual([w.teams[0]!.id]);
  });

  it('with one team that team is aligned with itself', () => {
    const w = ws();
    w.areas = [];
    w.teams = w.teams.slice(0, 1);
    const c = compareOrgCadences(w, '2027-01-04', 12);
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0]!.inStep).toBe(true);
    expect(c.others).toBe(1);
  });

  it('without teams there is nothing to compare', () => {
    const w = ws();
    w.areas = [];
    w.teams = [];
    const c = compareOrgCadences(w, '2027-01-04', 12);
    expect(c.rows).toEqual([]);
    expect(c.reference).toBeUndefined();
    expect({ byArea: c.byArea, others: c.others, sharing: c.sharing }).toEqual({
      byArea: 0,
      others: 0,
      sharing: 0,
    });
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
