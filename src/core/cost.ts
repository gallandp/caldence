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
  /**
   * Roles that meetings with a cost invite but nobody holds in that team or area: each counts as
   * one person for the cost, but not for the hours (#264). One entry per unit and role, saying in
   * which period (per week: recurring meetings; horizon: every occurrence) it adds cost.
   */
  unfilled: UnfilledRole[];
}

export interface UnfilledRole {
  unitId: string;
  roleId: string;
  week: boolean;
  horizon: boolean;
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

/** Running totals of a cost summary. */
type Sums = {
  perWeek: number;
  horizon: number;
  byCategory: Record<string, number>;
  unfilled: Map<string, UnfilledRole>;
};

const emptySums = (): Sums => ({
  perWeek: 0,
  horizon: 0,
  byCategory: record<number>(),
  unfilled: new Map(),
});

/** Adds the weekly and horizon costs of one team's or area's meetings to `sums`. */
function addUnitCosts(
  ws: Workspace,
  index: HolidayIndex,
  unit: Team,
  rate: number,
  heads: (p: Participant) => number,
  sums: Sums,
): void {
  const empty = (p: Participant) => heads(p) > 0 && attendees(ws, unit.id, p).length === 0;
  const note = (event: CalEvent, period: 'week' | 'horizon') => {
    for (const p of event.participants) {
      if (!empty(p)) continue;
      const key = `${unit.id}\u0000${p.roleId}`;
      const entry = sums.unfilled.get(key) ?? {
        unitId: unit.id,
        roleId: p.roleId,
        week: false,
        horizon: false,
      };
      entry[period] = true;
      sums.unfilled.set(key, entry);
    }
  };
  for (const event of unit.events) {
    const weekly =
      occurrencesPerWeek(event.rule, unit) *
      meetingCost(ws, unit, event, effectiveDuration(event, unit), rate, heads);
    if (weekly === 0) continue;
    note(event, 'week');
    sums.perWeek += weekly;
    sums.byCategory[event.categoryId] = (sums.byCategory[event.categoryId] ?? 0) + weekly;
  }
  const events = new Map(unit.events.map((e) => [e.id, e]));
  const inHorizon = new Set<CalEvent>();
  for (const occ of occurrences(unit, ws.settings, index)) {
    const event = events.get(occ.eventId);
    if (!event || occ.skippedHoliday) continue;
    const cost = meetingCost(ws, unit, event, occ.duration, rate, heads);
    sums.horizon += cost;
    if (cost > 0) inHorizon.add(event);
  }
  for (const event of inHorizon) note(event, 'horizon');
}

const summary = (ws: Workspace, sums: Sums): CostSummary => ({
  perWeek: sums.perWeek,
  horizon: sums.horizon,
  byCategory: ws.categories
    .filter((c) => (sums.byCategory[c.id] ?? 0) > 0)
    .map((c) => ({ categoryId: c.id, perWeek: sums.byCategory[c.id]! })),
  unfilled: [...sums.unfilled.values()],
});

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
  const sums = emptySums();
  for (const unit of [...scopeTeams(ws, filter), ...areasInScope(ws, filter)]) {
    const heads = (p: Participant): number => {
      if (filter.personId) return Number(attendees(ws, unit.id, p).includes(filter.personId));
      if (filter.roleId && p.roleId !== filter.roleId) return 0;
      return Math.max(1, attendees(ws, unit.id, p).length);
    };
    addUnitCosts(ws, index, unit, rate, heads, sums);
  }
  return summary(ws, sums);
}

/** Costs of one team's or area's own meetings (an area without those of its teams). */
export function unitCostSummary(
  ws: Workspace,
  index: HolidayIndex,
  unit: Team,
  rate: number,
): CostSummary {
  const sums = emptySums();
  const heads = (p: Participant) => Math.max(1, attendees(ws, unit.id, p).length);
  addUnitCosts(ws, index, unit, rate, heads, sums);
  return summary(ws, sums);
}
