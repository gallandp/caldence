import { unitCostSummary, meetingCost, type UnfilledRole } from './cost';
import { capacity, occurrencesPerWeek } from './load';
import {
  areaAsTeam,
  areaOf,
  attendees,
  ORG_UNIT,
  unfilled,
  type Area,
  type CalEvent,
  type Participant,
  type Team,
  type Workspace,
} from './model';
import { effectiveDuration, occurrences } from './recurrence';
import type { HolidayIndex } from './regions';

/**
 * What an area's meetings take, per team and for the area's own meetings (persona concept M3):
 * time from the recurring meetings as a weekly average, cost per week (same rule) and in the
 * planning horizon (every occurrence). The numbers match the cost card in Meetings & cadence.
 */
export interface UnitRow {
  unitId: string;
  /**
   * Hours per week of all attendees together, recurring meetings only. A role nobody holds counts
   * as one person, as in the cost and the Meeting load tiles, so hours × rate = cost (#335).
   */
  hours: number;
  /** Weekly hours of the people counted, in this unit; an unfilled role brings the default. */
  capacity: number;
  /** hours ÷ capacity: for a team "Termine im Team", for the total the Terminlast. */
  share: number;
  /** Meeting hours without any weekly hours to measure them against: always over the limit. */
  noHours: boolean;
  /**
   * People invited to at least one meeting of the unit (for the total: of any unit, each once),
   * the divisor of "cost per person". Members who attend nothing are left out, in every row
   * alike; a role nobody holds counts as one person, as in the cost (#263).
   */
  invited: number;
  /** Only with an hourly rate. `unfilled`: roles nobody holds, counted as one person each (#264). */
  cost?: { perWeek: number; horizon: number; unfilled: UnfilledRole[] };
  /** Teams only, with an hourly rate: see `areaShare` (#336). Not part of the total. */
  areaShare?: AreaShare;
}

/** Euros per week (recurring meetings) and in the planning horizon (every occurrence). */
export interface AreaShare {
  perWeek: number;
  horizon: number;
}

export interface AreaCosts {
  teams: UnitRow[];
  /** The area's own meetings; no share, its people are counted in the total. */
  area: UnitRow;
  /** For the organisation (#328): each area's own meetings, counted in the total like `area`. */
  areas: UnitRow[];
  total: UnitRow;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const share = (hours: number, cap: number) => (cap > 0 ? hours / cap : 0);

/**
 * Everyone invited to at least one meeting of the unit. A role nobody holds counts as one person,
 * as it does for the cost (`role:<unit>:<role>`), so that cost and divisor agree.
 */
function invitedTo(ws: Workspace, unit: Team): Set<string> {
  const out = new Set<string>();
  for (const e of unit.events)
    for (const p of e.participants) {
      const ids = attendees(ws, unit.id, p, e);
      if (p.roleId !== undefined && unfilled(ws, unit.id, p))
        out.add(`role:${unit.id}:${p.roleId}`);
      for (const id of ids) out.add(id);
    }
  return out;
}

/** Hours per week of a unit's recurring meetings: the cost at a rate of 1 per hour. */
function weeklyHours(ws: Workspace, unit: Team): number {
  return sum(
    unit.events.map(
      (e) =>
        occurrencesPerWeek(e.rule, unit) * meetingCost(ws, unit, e, effectiveDuration(e, unit), 1),
    ),
  );
}

/** The default weekly hours of each role nobody holds (`role:` entries of `invitedTo`). */
const unfilledCapacity = (ws: Workspace, invited: Set<string>) =>
  [...invited].filter((id) => id.startsWith('role:')).length * ws.settings.hoursPerWeek;

export function unitRow(
  ws: Workspace,
  index: HolidayIndex,
  unit: Team,
  cap: number,
  rate: number | undefined,
  invited: Set<string> = invitedTo(ws, unit),
): UnitRow {
  const hours = weeklyHours(ws, unit);
  cap += unfilledCapacity(ws, invited);
  const out: UnitRow = {
    unitId: unit.id,
    hours,
    capacity: cap,
    share: share(hours, cap),
    noHours: hours > 0 && cap <= 0,
    invited: invited.size,
  };
  if (rate) {
    const s = unitCostSummary(ws, index, unit, rate);
    out.cost = { perWeek: s.perWeek, horizon: s.horizon, unfilled: s.unfilled };
  }
  return out;
}

/**
 * What the meetings of a team's area cost for the team's people, on top of the team's own
 * meetings (#336). A person in several teams of the area has their part split over those teams
 * by their weekly hours in each, as the people table lists them (evenly without any hours).
 * People only in the area and roles nobody holds belong to no team: they stay in the area row.
 * Undefined for a team without an area or without a rate.
 */
export function areaShare(
  ws: Workspace,
  index: HolidayIndex,
  teamId: string,
  rate: number | undefined,
): AreaShare | undefined {
  const area = areaOf(ws, teamId);
  if (!area || !rate) return undefined;
  const teams = ws.teams.filter((t) => area.teamIds.includes(t.id));
  const weight = (personId: string): number => {
    const mine = teams.filter((t) => t.members.some((m) => m.personId === personId));
    if (!mine.some((t) => t.id === teamId)) return 0;
    const hours = mine.map((t) => capacity(ws, personId, t.id));
    const all = sum(hours);
    return all > 0 ? hours[mine.findIndex((t) => t.id === teamId)]! / all : 1 / mine.length;
  };
  const heads = (p: Participant, e: CalEvent) =>
    unfilled(ws, area.id, p) ? 0 : sum(attendees(ws, area.id, p, e).map(weight));
  const s = unitCostSummary(ws, index, areaAsTeam(area), rate, heads);
  return { perWeek: s.perWeek, horizon: s.horizon };
}

export function areaCosts(
  ws: Workspace,
  index: HolidayIndex,
  area: Area,
  rate?: number,
  /** False when only the total is needed (the what-if): each team's area share is left out. */
  shares = true,
): AreaCosts {
  const teams = ws.teams.filter((t) => area.teamIds.includes(t.id));
  const invited = new Set<string>();
  const teamRows = teams.map((t) => {
    const people = [...new Set(t.members.map((m) => m.personId))];
    const own = invitedTo(ws, t);
    own.forEach((p) => invited.add(p));
    const row = unitRow(ws, index, t, sum(people.map((p) => capacity(ws, p, t.id))), rate, own);
    if (rate && shares) row.areaShare = areaShare(ws, index, t.id, rate);
    return row;
  });
  // The organisation also holds every area's own meetings (#328).
  const owners = area.id === ORG_UNIT ? [...ws.areas, area] : [area];
  const ownRows = owners.map((a) => {
    const unit = areaAsTeam(a);
    const own = invitedTo(ws, unit);
    own.forEach((p) => invited.add(p));
    const row = unitRow(ws, index, unit, 0, rate, own);
    row.share = 0;
    row.noHours = false;
    return row;
  });
  const areaRow = ownRows.pop()!;
  const everyone = [
    ...new Set([
      ...owners.flatMap((a) => a.members.map((m) => m.personId)),
      ...teams.flatMap((t) => t.members.map((m) => m.personId)),
    ]),
  ];
  const all = [...teamRows, ...ownRows, areaRow];
  const hours = sum(all.map((r) => r.hours));
  const cap = sum(everyone.map((p) => capacity(ws, p, area.id))) + unfilledCapacity(ws, invited);
  const total: UnitRow = {
    unitId: area.id,
    hours,
    capacity: cap,
    share: share(hours, cap),
    noHours: hours > 0 && cap <= 0,
    invited: invited.size,
  };
  if (rate)
    total.cost = {
      perWeek: sum(all.map((r) => r.cost!.perWeek)),
      horizon: sum(all.map((r) => r.cost!.horizon)),
      unfilled: all.flatMap((r) => r.cost!.unfilled),
    };
  return { teams: teamRows, area: areaRow, areas: ownRows, total };
}

export interface CostlyMeeting {
  unitId: string;
  event: CalEvent;
  /** Recurring average per week; 0 for one-off and milestone meetings. */
  perWeek: number;
  horizon: number;
  /** Invited people; a role nobody holds still costs one person, like everywhere in the app. */
  invited: number;
  /** Roles the meeting invites that nobody holds (counted as one person each). */
  unfilled: string[];
}

/** Every meeting of the area and its teams with its cost per week and in the horizon. */
export function meetingCosts(
  ws: Workspace,
  index: HolidayIndex,
  area: Area,
  rate: number,
): CostlyMeeting[] {
  const units = [...ws.teams.filter((t) => area.teamIds.includes(t.id)), areaAsTeam(area)];
  const list: CostlyMeeting[] = [];
  for (const unit of units) {
    const horizon = new Map<string, number>();
    const events = new Map(unit.events.map((e) => [e.id, e]));
    for (const occ of occurrences(unit, ws.settings, index)) {
      const event = events.get(occ.eventId);
      if (!event || occ.skippedHoliday) continue;
      horizon.set(
        event.id,
        (horizon.get(event.id) ?? 0) + meetingCost(ws, unit, event, occ.duration, rate),
      );
    }
    for (const event of unit.events) {
      const perWeek =
        occurrencesPerWeek(event.rule, unit) *
        meetingCost(ws, unit, event, effectiveDuration(event, unit), rate);
      const lists = event.participants.map((p) => attendees(ws, unit.id, p, event));
      list.push({
        unitId: unit.id,
        event,
        perWeek,
        horizon: horizon.get(event.id) ?? 0,
        invited: new Set(lists.flat()).size,
        unfilled: event.participants.flatMap((p) =>
          p.roleId !== undefined && unfilled(ws, unit.id, p) ? [p.roleId] : [],
        ),
      });
    }
  }
  return list;
}

/**
 * The most expensive meetings for one period, with each one's share of all meeting cost in that
 * period. Per week only recurring meetings count (one-offs have no weekly average).
 */
export function costliest(
  list: CostlyMeeting[],
  period: 'week' | 'horizon',
  limit = 5,
): (CostlyMeeting & { cost: number; shareOfAll: number })[] {
  const cost = (m: CostlyMeeting) => (period === 'week' ? m.perWeek : m.horizon);
  const all = sum(list.map(cost));
  return list
    .filter((m) => cost(m) > 0)
    .map((m) => ({ ...m, cost: cost(m), shareOfAll: all > 0 ? cost(m) / all : 0 }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, limit);
}
