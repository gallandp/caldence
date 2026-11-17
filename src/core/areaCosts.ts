import { unitCostSummary, meetingCost } from './cost';
import { capacity, occurrencesPerWeek, weeklyHoursByPerson } from './load';
import { areaAsTeam, type Area, type CalEvent, type Team, type Workspace } from './model';
import { effectiveDuration, occurrences } from './recurrence';
import type { HolidayIndex } from './regions';

/**
 * What an area's meetings take, per team and for the area's own meetings (persona concept M3):
 * time from the recurring meetings as a weekly average, cost per week (same rule) and in the
 * planning horizon (every occurrence). The numbers match the cost card in Meetings & cadence.
 */
export interface UnitRow {
  unitId: string;
  /** Hours per week of all attendees together, recurring meetings only. */
  hours: number;
  /** Weekly hours of the people counted, in this unit. */
  capacity: number;
  /** hours ÷ capacity: for a team "Termine im Team", for the total the Terminlast. */
  share: number;
  people: number;
  /** Only with an hourly rate. */
  cost?: { perWeek: number; horizon: number };
}

export interface AreaCosts {
  teams: UnitRow[];
  /** The area's own meetings; no share, its people are counted in the total. */
  area: UnitRow;
  total: UnitRow;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const share = (hours: number, cap: number) => (cap > 0 ? hours / cap : 0);

function row(
  ws: Workspace,
  index: HolidayIndex,
  unit: Team,
  people: string[],
  cap: number,
  rate: number | undefined,
): UnitRow {
  const hours = sum(Object.values(weeklyHoursByPerson(ws, unit.id)));
  const out: UnitRow = {
    unitId: unit.id,
    hours,
    capacity: cap,
    share: share(hours, cap),
    people: people.length,
  };
  if (rate) {
    const s = unitCostSummary(ws, index, unit, rate);
    out.cost = { perWeek: s.perWeek, horizon: s.horizon };
  }
  return out;
}

export function areaCosts(
  ws: Workspace,
  index: HolidayIndex,
  area: Area,
  rate?: number,
): AreaCosts {
  const teams = area.teamIds.flatMap((id) => ws.teams.filter((t) => t.id === id));
  const teamRows = teams.map((t) => {
    const people = [...new Set(t.members.map((m) => m.personId))];
    return row(ws, index, t, people, sum(people.map((p) => capacity(ws, p, t.id))), rate);
  });
  const areaPeople = [...new Set(area.members.map((m) => m.personId))];
  const areaRow = row(ws, index, areaAsTeam(area), areaPeople, 0, rate);
  areaRow.share = 0;
  const everyone = [
    ...new Set([...areaPeople, ...teams.flatMap((t) => t.members.map((m) => m.personId))]),
  ];
  const all = [...teamRows, areaRow];
  const hours = sum(all.map((r) => r.hours));
  const cap = sum(everyone.map((p) => capacity(ws, p, area.id)));
  const total: UnitRow = {
    unitId: area.id,
    hours,
    capacity: cap,
    share: share(hours, cap),
    people: everyone.length,
  };
  if (rate)
    total.cost = {
      perWeek: sum(all.map((r) => r.cost!.perWeek)),
      horizon: sum(all.map((r) => r.cost!.horizon)),
    };
  return { teams: teamRows, area: areaRow, total };
}

export interface CostlyMeeting {
  unitId: string;
  event: CalEvent;
  /** Recurring average per week; 0 for one-off and milestone meetings. */
  perWeek: number;
  horizon: number;
  /** horizon ÷ all meeting cost of the area in the horizon. */
  shareOfAll: number;
}

/** The area's most expensive meetings over the planning horizon, its teams' and its own. */
export function costliestMeetings(
  ws: Workspace,
  index: HolidayIndex,
  area: Area,
  rate: number,
  limit = 5,
): CostlyMeeting[] {
  const units = [
    ...area.teamIds.flatMap((id) => ws.teams.filter((t) => t.id === id)),
    areaAsTeam(area),
  ];
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
      list.push({
        unitId: unit.id,
        event,
        perWeek,
        horizon: horizon.get(event.id) ?? 0,
        shareOfAll: 0,
      });
    }
  }
  const all = sum(list.map((m) => m.horizon));
  for (const m of list) m.shareOfAll = all > 0 ? m.horizon / all : 0;
  return list
    .filter((m) => m.horizon > 0 || m.perWeek > 0)
    .sort((a, b) => b.horizon - a.horizon || b.perWeek - a.perWeek)
    .slice(0, limit);
}
