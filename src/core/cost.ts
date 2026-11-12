import { occurrenceHours, occurrencesPerWeek } from './load';
import type { CalEvent, Team, Workspace } from './model';
import { effectiveDuration, occurrences } from './recurrence';
import { record } from './record';
import type { HolidayIndex } from './regions';
import { scopeTeams, type Filter } from './views';

export interface CostSummary {
  /** Average euros per week of the recurring meetings. */
  perWeek: number;
  /** Euros of all meetings in the planning horizon, holidays excluded. */
  horizon: number;
  /** Average euros per week by category, only categories that cost something. */
  byCategory: { categoryId: string; perWeek: number }[];
}

/** People attending for a role: its members in the team, or one person if it has none yet. */
const headcount = (team: Team, roleId: string): number =>
  Math.max(1, team.members.filter((m) => m.roleId === roleId).length);

/** Euros of one occurrence lasting `minutes`; `heads` says how many people attend per role. */
export function meetingCost(
  team: Team,
  event: CalEvent,
  minutes: number,
  rate: number,
  heads = (roleId: string) => headcount(team, roleId),
): number {
  return event.participants.reduce(
    (sum, p) => sum + occurrenceHours(event, minutes, p.share) * heads(p.roleId) * rate,
    0,
  );
}

/** Weekly and horizon costs of the teams in scope; a person filter counts only that person. */
export function costSummary(
  ws: Workspace,
  index: HolidayIndex,
  filter: Filter,
  rate: number,
): CostSummary {
  let perWeek = 0;
  let horizon = 0;
  const byCategory = record<number>();
  for (const team of scopeTeams(ws, filter)) {
    const personRoles = filter.personId
      ? new Set(team.members.filter((m) => m.personId === filter.personId).map((m) => m.roleId))
      : undefined;
    const heads = (roleId: string): number =>
      personRoles
        ? Number(personRoles.has(roleId))
        : filter.roleId && roleId !== filter.roleId
          ? 0
          : headcount(team, roleId);
    for (const event of team.events) {
      const weekly =
        occurrencesPerWeek(event.rule, team) *
        meetingCost(team, event, effectiveDuration(event, team), rate, heads);
      if (weekly === 0) continue;
      perWeek += weekly;
      byCategory[event.categoryId] = (byCategory[event.categoryId] ?? 0) + weekly;
    }
    const events = new Map(team.events.map((e) => [e.id, e]));
    for (const occ of occurrences(team, ws.settings, index)) {
      const event = events.get(occ.eventId);
      if (event && !occ.skippedHoliday)
        horizon += meetingCost(team, event, occ.duration, rate, heads);
    }
  }
  return {
    perWeek,
    horizon,
    byCategory: ws.categories
      .filter((c) => (byCategory[c.id] ?? 0) > 0)
      .map((c) => ({ categoryId: c.id, perWeek: byCategory[c.id]! })),
  };
}
