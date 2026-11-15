import { occurrenceHours, occurrencesPerWeek } from './load';
import {
  areasInScope,
  attendees,
  type CalEvent,
  type Participant,
  type Team,
  type Workspace,
} from './model';
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

/**
 * Euros of one occurrence lasting `minutes` in a team or area; `heads` says how many people
 * attend per participant. By default everyone the participant stands for, or one person if
 * nobody holds the role yet.
 */
export function meetingCost(
  ws: Workspace,
  unit: Team,
  event: CalEvent,
  minutes: number,
  rate: number,
  heads = (p: Participant) => Math.max(1, attendees(ws, unit.id, p).length),
): number {
  return event.participants.reduce(
    (sum, p) => sum + occurrenceHours(event, minutes, p.share) * heads(p) * rate,
    0,
  );
}

/**
 * Weekly and horizon costs of the teams and areas in scope; a person filter counts only that
 * person.
 */
export function costSummary(
  ws: Workspace,
  index: HolidayIndex,
  filter: Filter,
  rate: number,
): CostSummary {
  let perWeek = 0;
  let horizon = 0;
  const byCategory = record<number>();
  for (const unit of [...scopeTeams(ws, filter), ...areasInScope(ws, filter)]) {
    const heads = (p: Participant): number => {
      if (filter.personId) return Number(attendees(ws, unit.id, p).includes(filter.personId));
      if (filter.roleId && p.roleId !== filter.roleId) return 0;
      return Math.max(1, attendees(ws, unit.id, p).length);
    };
    for (const event of unit.events) {
      const weekly =
        occurrencesPerWeek(event.rule, unit) *
        meetingCost(ws, unit, event, effectiveDuration(event, unit), rate, heads);
      if (weekly === 0) continue;
      perWeek += weekly;
      byCategory[event.categoryId] = (byCategory[event.categoryId] ?? 0) + weekly;
    }
    const events = new Map(unit.events.map((e) => [e.id, e]));
    for (const occ of occurrences(unit, ws.settings, index)) {
      const event = events.get(occ.eventId);
      if (event && !occ.skippedHoliday)
        horizon += meetingCost(ws, unit, event, occ.duration, rate, heads);
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
