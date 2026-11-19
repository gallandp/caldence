import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/valid-workspace.json';
import type { CalEvent, Workspace } from '../../src/core/model';
import { assign } from '../../src/core/line';
import { loadPerWeek } from '../../src/core/load';
import type { HolidayIndex } from '../../src/core/regions';
import {
  hasDemands,
  overLimitCount,
  productMatches,
  staffingMap,
  type MapFilter,
} from '../../src/core/staffingMap';

const noIndex = (): HolidayIndex => ({
  holidays: new Map(),
  schoolHolidays: new Map(),
  beyondKnown: false,
});
const ok = <T>(r: { ok: true; value: T } | { ok: false; errors: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

const meeting = (id: string, rule: CalEvent['rule'], duration: number): CalEvent => ({
  id,
  name: id,
  categoryId: (fixture as unknown as Workspace).categories[0]!.id,
  rule,
  time: '09:00',
  duration,
  preparation: 0,
  participants: [{ roleId: 'r1', share: 1 }],
});

/**
 * Platform "Nordlicht" with product "Team A" (6.25 h meetings a week → Mindestzusage 0.3 FTE,
 * demand 1 FTE) and product "Team B" (no meetings, demand 0.5 FTE). Owner roles mark Alex as the
 * business owner of Team A; Team B and the platform have no owners.
 */
function org(): Workspace {
  const w = structuredClone(fixture) as unknown as Workspace;
  w.people.push({ id: 'p2', name: 'Ilka Brandt' }, { id: 'p3', name: 'Oskar Venn' });
  w.roles.push({ id: 'rpo', name: 'Product Owner', colour: '#123456', owner: 'business' });
  const a = w.teams[0]!;
  a.members.push({ personId: 'p1', roleId: 'rpo' });
  a.ownerMode = 'business';
  a.events = [
    meeting('daily', { type: 'weekdays', weekdays: [1, 2, 3, 4, 5] }, 15),
    meeting('block', { type: 'weekly', weekday: 2 }, 300),
  ];
  a.demands = [{ id: 'd1', fte: 1, roleId: 'r1' }];
  w.teams.push({
    id: 't2',
    name: 'Team B',
    cadence: { kind: 'flow', lengthWeeks: 1, start: '2026-11-09' },
    members: [],
    memberHours: {},
    assumptions: {},
    cycles: [],
    events: [],
    demands: [{ id: 'd1', fte: 0.5, roleId: 'r1' }],
  } as unknown as Workspace['teams'][number]);
  w.skillFamilies = [{ id: 'f1', name: 'Orvalis' }];
  w.areas = [
    {
      id: 'a1',
      name: 'Nordlicht',
      teamIds: ['t1', 't2'],
      members: [],
      memberHours: {},
      cycles: [],
      events: [],
      skillFamilyId: 'f1',
    } as unknown as Workspace['areas'][number],
  ];
  return w;
}

const staff = (w: Workspace, personId: string, teamId: string, fte: number) =>
  ok(assign(w, { personId, teamId, demandId: 'd1', fte }))[0];

describe('staffing map (#322)', () => {
  it('only shows once a product has a demand', () => {
    const w = structuredClone(fixture) as unknown as Workspace;
    expect(hasDemands(w)).toBe(false);
    expect(hasDemands(org())).toBe(true);
  });

  it('sums demand, committed and open FTE per product, platform and in total', () => {
    let w = staff(org(), 'p2', 't1', 0.2);
    w = staff(w, 'p3', 't2', 0.5);
    const map = staffingMap(w);
    expect(map.platforms).toHaveLength(1);
    const [pl] = map.platforms;
    const [a, b] = pl!.products;
    expect(a).toMatchObject({ demand: 1, committed: 0.2, open: 0.8, under: 1, ownerGaps: 0 });
    expect(a!.coverage).toBeCloseTo(0.2);
    expect(b).toMatchObject({ demand: 0.5, committed: 0.5, open: 0, under: 0 });
    // Team B and the platform want a tandem nobody holds: 2 + 2 gaps.
    expect(pl).toMatchObject({ demand: 1.5, committed: 0.7, open: 1, under: 1, ownerGaps: 4 });
    expect(map.totals).toMatchObject({ products: 2, full: 1, demand: 1.5, committed: 0.7 });
    expect(map.totals.open).toBeCloseTo(0.8);
  });

  it('splits committed time into meetings and time after meetings, like the effect check', () => {
    // 0.5 FTE = 20 h in Team A: 6.25 h in meetings, 13.75 h left; 20 h in Team B, no meetings.
    let w = staff(org(), 'p2', 't1', 0.5);
    w = staff(w, 'p3', 't2', 0.5);
    const { totals } = staffingMap(w);
    expect(totals.inMeetings).toBeCloseTo(6.25 / 40, 2);
    expect(totals.afterMeetings).toBeCloseTo((13.75 + 20) / 40, 2);
    expect(totals.afterMeetings + totals.inMeetings).toBeCloseTo(totals.committed, 1);
  });

  it('counts a commitment that covers only the meetings as a hint', () => {
    // 0.1 FTE = 4 h, less than the 6.25 h of meetings.
    const map = staffingMap(staff(org(), 'p2', 't1', 0.1));
    expect(map.platforms[0]!.products[0]!.under).toBe(1);
  });

  it('caps an over-committed demand at what it asks for', () => {
    const w = org();
    w.teams[1]!.demands = [{ id: 'd1', fte: 0.2, roleId: 'r1' }];
    const p = staffingMap(staff(w, 'p3', 't2', 0.5)).platforms[0]!.products[1]!;
    expect(p).toMatchObject({ demand: 0.2, committed: 0.2, open: 0, coverage: 1 });
    // 20 h committed against 8 h asked for: the time counts only up to the demand.
    const { totals } = staffingMap(staff(w, 'p3', 't2', 0.5));
    expect(totals.afterMeetings + totals.inMeetings).toBeCloseTo(0.2, 2);
  });

  it('counts missing wanted owners of the platform and its products', () => {
    const w = org();
    w.areas[0]!.ownerMode = 'technical';
    w.roles.push({ id: 'rto', name: 'Plattform Owner', colour: '#654321', owner: 'technical' });
    const [pl] = staffingMap(w).platforms;
    // Team B wants a tandem (2 gaps), Team A only a business owner (held), the platform 1 gap.
    expect(pl!.products.map((p) => p.ownerGaps)).toEqual([0, 2]);
    expect(pl!.ownerGaps).toBe(3);
  });

  it('puts products without a platform last and scopes to the given products', () => {
    const w = org();
    w.areas[0]!.teamIds = ['t2'];
    const map = staffingMap(w);
    expect(map.platforms.map((p) => p.area?.name)).toEqual(['Nordlicht', undefined]);
    expect(map.platforms[1]!.products.map((p) => p.team.name)).toEqual(['Team A']);
    expect(staffingMap(w, [w.teams[1]!]).platforms).toHaveLength(1);
  });

  it('filters by search (product, platform, owner), skill family and status', () => {
    const w = staff(org(), 'p2', 't1', 0.2);
    const map = staffingMap(w);
    const pl = map.platforms[0]!;
    const names = (f: Partial<MapFilter>) =>
      pl.products
        .filter((p) =>
          productMatches(w, pl, p, { query: '', familyId: undefined, status: 'all', ...f }),
        )
        .map((p) => p.team.name);
    expect(names({ query: 'team b' })).toEqual(['Team B']);
    expect(names({ query: 'nordl' })).toEqual(['Team A', 'Team B']);
    expect(names({ query: 'alex' })).toEqual(['Team A']);
    expect(names({ familyId: 'f1' })).toEqual(['Team A', 'Team B']);
    expect(names({ familyId: 'other' })).toEqual([]);
    expect(names({ status: 'open' })).toEqual(['Team A', 'Team B']);
    expect(names({ status: 'hint' })).toEqual(['Team A', 'Team B']);
  });

  it('counts committed people over the Grenze across all their teams', () => {
    const w = staff(org(), 'p2', 't1', 0.1);
    const map = staffingMap(w);
    // 6.25 h of meetings in 4 h: far over the 60 % Grenze.
    expect(overLimitCount(w, map, loadPerWeek(w, noIndex()))).toBe(1);
    const fine = staff(org(), 'p2', 't1', 1);
    expect(overLimitCount(fine, staffingMap(fine), loadPerWeek(fine, noIndex()))).toBe(0);
  });
});
