import { demandRows } from './demand';
import { commitmentImpact, overallLoad } from './impact';
import type { WeekLoad } from './load';
import type { Area, Team, Workspace } from './model';
import { ownerGaps, ownerNames } from './owners';

/**
 * The staffing map (#322): per platform and product how much of the demand is committed, what is
 * left after the meetings, and where a commitment is under the Mindestzusage or an owner is
 * missing. Every figure is in FTE of a typical week and uses the effect check (#320), so the map
 * and the assign dialog never disagree. It shows counts, never the people behind them.
 */

const EPS = 1e-9;
const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface ProductStaffing {
  team: Team;
  /** FTE asked for in all demands. */
  demand: number;
  /** FTE committed, each demand counted at most up to what it asks for. */
  committed: number;
  /** demand − committed. */
  open: number;
  /** committed ÷ demand, 0 without demand. */
  coverage: number;
  /** Commitments under the Mindestzusage or covering only the meetings (#320). */
  under: number;
  /** Wanted owners nobody holds (#331). */
  ownerGaps: number;
  /** Weekly hours of the committed people in the product, and the part in its meetings. */
  hours: number;
  meetingHours: number;
  /** People committed here. */
  people: string[];
}

export interface PlatformStaffing {
  /** Undefined for the products in no platform. */
  area: Area | undefined;
  products: ProductStaffing[];
  demand: number;
  committed: number;
  /** Products with open demand. */
  open: number;
  under: number;
  /** The platform's own and its products' missing owners. */
  ownerGaps: number;
}

export interface StaffingTotals {
  /** Products with a demand, and those of them fully staffed. */
  products: number;
  full: number;
  demand: number;
  committed: number;
  open: number;
  /** FTE of the committed people left for product work, and in the products' meetings. */
  afterMeetings: number;
  inMeetings: number;
}

export interface StaffingMap {
  platforms: PlatformStaffing[];
  totals: StaffingTotals;
}

/** True once a product in scope (default: any) asks the line for people. */
export const hasDemands = (ws: Workspace, teams: Team[] = ws.teams): boolean =>
  teams.some((t) => (t.demands?.length ?? 0) > 0);

export function productStaffing(ws: Workspace, team: Team): ProductStaffing {
  let demand = 0;
  let committed = 0;
  let under = 0;
  let hours = 0;
  let meetingHours = 0;
  const people: string[] = [];
  for (const row of demandRows(ws, team)) {
    demand += row.demand.fte;
    committed += Math.min(row.committed, row.demand.fte);
    for (const { personId } of row.who) {
      const impact = commitmentImpact(ws, team.id, personId, row.demand.roleId);
      if (!impact) continue;
      people.push(personId);
      if (impact.state !== 'enough') under++;
      hours += impact.hours;
      meetingHours += Math.min(impact.meetingHours, impact.hours);
    }
  }
  demand = round2(demand);
  committed = round2(committed);
  return {
    team,
    demand,
    committed,
    open: round2(Math.max(0, demand - committed)),
    coverage: demand > 0 ? committed / demand : 0,
    under,
    ownerGaps: ownerGaps(ws, team),
    hours,
    meetingHours,
    people,
  };
}

/**
 * The map of the given products (default: all), grouped by platform in the file's order; the
 * products in no platform come last.
 */
export function staffingMap(ws: Workspace, teams: Team[] = ws.teams): StaffingMap {
  const inScope = new Set(teams.map((t) => t.id));
  const byId = new Map(ws.teams.map((t) => [t.id, t]));
  const grouped = new Set<string>();
  const groups: { area: Area | undefined; teams: Team[] }[] = [];
  for (const area of ws.areas) {
    const own = area.teamIds.filter((id) => inScope.has(id)).flatMap((id) => byId.get(id) ?? []);
    own.forEach((t) => grouped.add(t.id));
    if (own.length > 0) groups.push({ area, teams: own });
  }
  const loose = teams.filter((t) => !grouped.has(t.id));
  if (loose.length > 0) groups.push({ area: undefined, teams: loose });

  const hpw = ws.settings.hoursPerWeek;
  const totals: StaffingTotals = {
    products: 0,
    full: 0,
    demand: 0,
    committed: 0,
    open: 0,
    afterMeetings: 0,
    inMeetings: 0,
  };
  const platforms = groups.map(({ area, teams: own }): PlatformStaffing => {
    const products = own.map((t) => productStaffing(ws, t));
    const sum = (f: (p: ProductStaffing) => number) => products.reduce((s, p) => s + f(p), 0);
    for (const p of products) {
      if (p.demand <= 0) continue;
      totals.products++;
      if (p.open <= EPS) totals.full++;
    }
    totals.demand += sum((p) => p.demand);
    totals.committed += sum((p) => p.committed);
    if (hpw > 0) {
      totals.afterMeetings += sum((p) => p.hours - p.meetingHours) / hpw;
      totals.inMeetings += sum((p) => p.meetingHours) / hpw;
    }
    return {
      area,
      products,
      demand: round2(sum((p) => p.demand)),
      committed: round2(sum((p) => p.committed)),
      open: products.filter((p) => p.open > EPS).length,
      under: sum((p) => p.under),
      ownerGaps: (area ? ownerGaps(ws, area) : 0) + sum((p) => p.ownerGaps),
    };
  });
  totals.demand = round2(totals.demand);
  totals.committed = round2(totals.committed);
  totals.open = round2(Math.max(0, totals.demand - totals.committed));
  totals.afterMeetings = round2(totals.afterMeetings);
  totals.inMeetings = round2(totals.inMeetings);
  return { platforms, totals };
}

/**
 * People committed on the map who are "über Grenze": all their meeting hours ÷ all their hours,
 * across every team, exactly as the effect check and Terminlast judge it (#320).
 */
export function overLimitCount(ws: Workspace, map: StaffingMap, weeks: WeekLoad[]): number {
  const ids = new Set(map.platforms.flatMap((pl) => pl.products.flatMap((p) => p.people)));
  let n = 0;
  for (const id of ids) if (overallLoad(ws, weeks, id).over) n++;
  return n;
}

export type StatusFilter = 'all' | 'open' | 'hint';

export interface MapFilter {
  query: string;
  /** A skill family id, or undefined for all. */
  familyId: string | undefined;
  status: StatusFilter;
}

/** A product with something to look at: open demand, a weak commitment or a missing owner. */
export const hasHint = (p: ProductStaffing): boolean => p.under > 0 || p.ownerGaps > 0;

/**
 * Whether a product matches the filter. The search finds a product by its name, its platform's
 * name or the name of one of its or its platform's owners.
 */
export function productMatches(
  ws: Workspace,
  platform: PlatformStaffing,
  p: ProductStaffing,
  filter: MapFilter,
): boolean {
  if (filter.familyId !== undefined && platform.area?.skillFamilyId !== filter.familyId)
    return false;
  if (filter.status === 'open' && p.open <= EPS) return false;
  if (filter.status === 'hint' && !hasHint(p)) return false;
  const q = filter.query.trim().toLocaleLowerCase();
  if (!q) return true;
  const names = [
    p.team.name,
    ...(platform.area ? [platform.area.name, ...ownerNames(ws, platform.area)] : []),
    ...ownerNames(ws, p.team),
  ];
  return names.some((n) => n.toLocaleLowerCase().includes(q));
}
