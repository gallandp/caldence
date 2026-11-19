import { weeklyLimit } from './line';
import { addDays, diffDays, mondayOf, type ISODate } from './date';
import {
  attendees,
  participantKey,
  units,
  unitTeamIds,
  ORG_UNIT,
  type CalEvent,
  type Rule,
  type Team,
  type Workspace,
} from './model';
import { effectiveDuration, occurrences } from './recurrence';
import { record } from './record';
import type { HolidayIndex } from './regions';

export interface BaseLoad {
  /** Hours per week of one attendee, by participant key (role or person invited by name). */
  byRole: Record<string, number>;
  byCategory: Record<string, Record<string, number>>;
}

export interface WeekLoad {
  monday: ISODate;
  byPerson: Record<string, number>;
  /** Hours per person from recurring meetings only: the load that comes back with the cadence. */
  regularByPerson: Record<string, number>;
  byTeamRole: Record<string, Record<string, number>>;
  /** Hours per person within each team: the load a team filter compares with team hours. */
  byTeamPerson: Record<string, Record<string, number>>;
}

export interface LoadWarning {
  monday: ISODate;
  personId: string;
  kind: 'above-usual' | 'above-fte';
}

/** Average occurrences per week of a recurring rule; one-off rules count 0. */
export function occurrencesPerWeek(rule: Rule, team: Team): number {
  switch (rule.type) {
    case 'weekly':
      return 1;
    case 'weekdays':
      return rule.weekdays.length;
    case 'every-n-weeks':
      return rule.n >= 1 ? 1 / rule.n : 0;
    case 'monthly-nth-weekday':
      return 12 / 52;
    case 'cadence-day':
      return team.cadence.lengthWeeks > 0 ? 1 / team.cadence.lengthWeeks : 0;
    case 'cycle-milestone':
    case 'once':
      return 0;
  }
}

/**
 * Hours of one occurrence for a participant with the given share: the meeting with its
 * preparation, plus the travel time of an on-site meeting (#309), which preparation does not grow.
 */
export function occurrenceHours(event: CalEvent, minutes: number, share: number): number {
  const travel = event.onSite?.travel ?? 0;
  return ((minutes * (1 + event.preparation) + travel) / 60) * share;
}

/** Analytical recurring average in hours per week, independent of horizon and holidays. */
export function weeklyBaseLoad(team: Team): BaseLoad {
  const byRole = record<number>();
  const byCategory = record<Record<string, number>>();
  for (const event of team.events) {
    const perWeek = occurrencesPerWeek(event.rule, team);
    if (perWeek === 0) continue;
    const minutes = effectiveDuration(event, team);
    for (const p of event.participants) {
      const hours = perWeek * occurrenceHours(event, minutes, p.share);
      const key = participantKey(p);
      byRole[key] = (byRole[key] ?? 0) + hours;
      const cat = (byCategory[event.categoryId] ??= record());
      cat[key] = (cat[key] ?? 0) + hours;
    }
  }
  return { byRole, byCategory };
}

/** Rules that do not come back every few weeks: one-offs and cycle milestones. */
const IRREGULAR = new Set<Rule['type']>(['once', 'cycle-milestone']);

/** Hours per week for every Monday of the horizon, holidays excluded, all teams summed. */
export function loadPerWeek(ws: Workspace, index: HolidayIndex): WeekLoad[] {
  const first = mondayOf(ws.settings.horizon.from);
  const last = mondayOf(ws.settings.horizon.to);
  const count = Math.max(0, diffDays(last, first) / 7 + 1);
  const weeks: WeekLoad[] = [];
  for (let i = 0; i < count; i++) {
    const byPerson = record<number>();
    const regularByPerson = record<number>();
    for (const person of ws.people) byPerson[person.id] = regularByPerson[person.id] = 0;
    weeks.push({
      monday: addDays(first, i * 7),
      byPerson,
      regularByPerson,
      byTeamRole: record(),
      byTeamPerson: record(),
    });
  }

  // Teams and areas alike: an area's meetings count for the area, never for one of its teams.
  for (const team of units(ws)) {
    const events = new Map(team.events.map((e) => [e.id, e]));
    for (const occ of occurrences(team, ws.settings, index)) {
      if (occ.skippedHoliday) continue;
      const event = events.get(occ.eventId);
      const week = weeks[diffDays(mondayOf(occ.date), first) / 7];
      if (!event || !week) continue;
      const regular = !IRREGULAR.has(event.rule.type);
      for (const p of event.participants) {
        const hours = occurrenceHours(event, occ.duration, p.share);
        const roles = (week.byTeamRole[team.id] ??= record());
        const key = participantKey(p);
        roles[key] = (roles[key] ?? 0) + hours;
        for (const personId of attendees(ws, team.id, p, event)) {
          week.byPerson[personId] = (week.byPerson[personId] ?? 0) + hours;
          const inUnit = (week.byTeamPerson[team.id] ??= record());
          inUnit[personId] = (inUnit[personId] ?? 0) + hours;
          if (regular)
            week.regularByPerson[personId] = (week.regularByPerson[personId] ?? 0) + hours;
        }
      }
    }
  }
  return weeks;
}

export function fte(hours: number, hoursPerWeek: number): number {
  return hoursPerWeek > 0 ? hours / hoursPerWeek : 0;
}

/** Meeting hours above maxFte of the weekly hours; meetings without any weekly hours always are. */
export function overMax(hours: number, capacity: number, maxFte: number): boolean {
  return hours > 0 && (capacity > 0 ? fte(hours, capacity) > maxFte : true);
}

/** A person's weekly hours in an area: their entry there, or 0 (area time is set on purpose). */
export function areaHours(ws: Workspace, areaId: string, personId: string): number {
  const area = ws.areas.find((a) => a.id === areaId);
  return area && Object.hasOwn(area.memberHours, personId) ? area.memberHours[personId]! : 0;
}

/**
 * Weekly hours a person has: in one team (their entry there or the workspace default), in an
 * area (their hours in its teams plus their area hours), or summed over all their teams and
 * areas. Area time without an entry is 0 h; only a person in no team and no area has the
 * workspace default (#265).
 */
export function capacity(ws: Workspace, personId: string, unitId?: string): number {
  // The organisation is everything: the same as no unit.
  const teamId = unitId === ORG_UNIT ? undefined : unitId;
  const fallback = ws.settings.hoursPerWeek;
  const scope = teamId === undefined ? undefined : new Set(unitTeamIds(ws, teamId));
  const teams = ws.teams.filter(
    (t) =>
      (scope === undefined || scope.has(t.id)) && t.members.some((m) => m.personId === personId),
  );
  // An area counts only its own hours: its people have 0 there without an entry (#265).
  const areas = ws.areas.filter(
    (a) =>
      (teamId === undefined || a.id === teamId) &&
      (Object.hasOwn(a.memberHours, personId) || a.members.some((m) => m.personId === personId)),
  );
  if (teams.length === 0 && areas.length === 0)
    return teamId !== undefined && ws.areas.some((a) => a.id === teamId) ? 0 : fallback;
  const inTeams = teams.reduce(
    (sum, t) =>
      sum + (Object.hasOwn(t.memberHours, personId) ? t.memberHours[personId]! : fallback),
    0,
  );
  return areas.reduce((sum, a) => sum + areaHours(ws, a.id, personId), inTeams);
}

/** Names of the teams and areas a person works in: as a member, or with hours in an area. */
export function placesOf(ws: Workspace, personId: string): string[] {
  return [
    ...ws.teams.filter((t) => t.members.some((m) => m.personId === personId)),
    ...ws.areas.filter(
      (a) =>
        Object.hasOwn(a.memberHours, personId) || a.members.some((m) => m.personId === personId),
    ),
  ].map((u) => u.name);
}

const placed = (ws: Workspace, personId: string): boolean => placesOf(ws, personId).length > 0;

/**
 * Weekly hours a person has left for one more team: their weekly limit (the Settings weekly hours,
 * times their contract FTE when set, #315) minus their hours in all teams and areas, at least 0.
 * Someone in no team has them all (#274).
 */
export function hoursLeft(ws: Workspace, personId: string): number {
  const used = placed(ws, personId) ? capacity(ws, personId) : 0;
  return Math.max(0, weeklyLimit(ws, personId) - used);
}

/** The person's hours in all teams and areas add up to more than their weekly limit. */
export function overbooked(ws: Workspace, personId: string): boolean {
  return placed(ws, personId) && capacity(ws, personId) > weeklyLimit(ws, personId);
}

/** A person's hours in a week in these teams. */
export function hoursIn(week: WeekLoad, teamIds: readonly string[], personId: string): number {
  return teamIds.reduce((sum, id) => sum + (week.byTeamPerson[id]?.[personId] ?? 0), 0);
}

/**
 * Flags weeks above warnFactor x the person's usual load and weeks above maxFte. The usual load
 * of a week is the person's average, or their recurring meetings that week if that is more, so
 * peaks that come back with the cadence (every sprint start) are not flagged; one-off meetings
 * and cycle milestones on top of them are. The limit is one rule everywhere: all of a person's
 * meeting hours ÷ their hours summed over their teams and areas, whatever the scope, so a person
 * is over the limit everywhere or nowhere (#273, #307, #334). Area meetings measured against the
 * area hours alone are hints, see `areaHints`.
 */
export function warnings(weeks: WeekLoad[], ws: Workspace): LoadWarning[] {
  const { warnFactor, maxFte } = ws.settings.thresholds;
  const result: LoadWarning[] = [];
  for (const person of ws.people) {
    const total = weeks.reduce((sum, w) => sum + (w.byPerson[person.id] ?? 0), 0);
    const average = weeks.length > 0 ? total / weeks.length : 0;
    const hoursPerWeek = capacity(ws, person.id);
    for (const week of weeks) {
      const hours = week.byPerson[person.id] ?? 0;
      const usual = Math.max(average, week.regularByPerson[person.id] ?? 0);
      if (average > 0 && hours > warnFactor * usual) {
        result.push({ monday: week.monday, personId: person.id, kind: 'above-usual' });
      }
      if (overMax(hours, hoursPerWeek, maxFte)) {
        result.push({ monday: week.monday, personId: person.id, kind: 'above-fte' });
      }
    }
  }
  return result.sort(
    (a, b) => a.monday.localeCompare(b.monday) || a.personId.localeCompare(b.personId),
  );
}

export interface AreaHint {
  personId: string;
  areaId: string;
  /** No hours set in the area, or the area meetings take more than the limit of them. */
  kind: 'no-area-hours' | 'area-share';
  /** The most hours of the area's meetings in one week. */
  hours: number;
  /** The person's weekly hours in the area. */
  areaHours: number;
}

/**
 * Hints about area meetings, at most one per person and area (#307, #334): a person attends
 * meetings of an area without hours set there, or those meetings take more than the limit of
 * their area hours in some week. They are never "over the limit", which `warnings` judges on all
 * meetings ÷ all weekly hours.
 */
export function areaHints(weeks: WeekLoad[], ws: Workspace): AreaHint[] {
  const { maxFte } = ws.settings.thresholds;
  const result: AreaHint[] = [];
  for (const area of ws.areas) {
    for (const person of ws.people) {
      const hours = Math.max(0, ...weeks.map((w) => w.byTeamPerson[area.id]?.[person.id] ?? 0));
      if (hours <= 0) continue;
      const inArea = areaHours(ws, area.id, person.id);
      const kind =
        inArea <= 0 ? 'no-area-hours' : fte(hours, inArea) > maxFte ? 'area-share' : null;
      if (kind)
        result.push({ personId: person.id, areaId: area.id, kind, hours, areaHours: inArea });
    }
  }
  return result.sort(
    (a, b) => a.personId.localeCompare(b.personId) || a.areaId.localeCompare(b.areaId),
  );
}

/** Average hours per week of a unit's recurring meetings for each person attending them. */
export function weeklyHoursByPerson(ws: Workspace, unitId: string): Record<string, number> {
  const out = record<number>();
  const team = units(ws).find((u) => u.id === unitId);
  if (!team) return out;
  for (const event of team.events) {
    const perWeek = occurrencesPerWeek(event.rule, team);
    if (perWeek === 0) continue;
    const minutes = effectiveDuration(event, team);
    for (const p of event.participants) {
      const hours = perWeek * occurrenceHours(event, minutes, p.share);
      for (const id of attendees(ws, team.id, p, event)) out[id] = (out[id] ?? 0) + hours;
    }
  }
  return out;
}
