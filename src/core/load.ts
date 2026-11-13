import { addDays, diffDays, mondayOf, type ISODate } from './date';
import type { CalEvent, Rule, Team, Workspace } from './model';
import { effectiveDuration, occurrences } from './recurrence';
import { record } from './record';
import type { HolidayIndex } from './regions';
import type { Filter } from './views';

export interface BaseLoad {
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

/** Hours of one occurrence for a participant with the given share. */
export function occurrenceHours(event: CalEvent, minutes: number, share: number): number {
  return ((minutes * (1 + event.preparation)) / 60) * share;
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
      byRole[p.roleId] = (byRole[p.roleId] ?? 0) + hours;
      const cat = (byCategory[event.categoryId] ??= record());
      cat[p.roleId] = (cat[p.roleId] ?? 0) + hours;
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

  for (const team of ws.teams) {
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
        roles[p.roleId] = (roles[p.roleId] ?? 0) + hours;
        for (const m of team.members) {
          if (m.roleId === p.roleId) {
            week.byPerson[m.personId] = (week.byPerson[m.personId] ?? 0) + hours;
            const inTeam = (week.byTeamPerson[team.id] ??= record());
            inTeam[m.personId] = (inTeam[m.personId] ?? 0) + hours;
            if (regular)
              week.regularByPerson[m.personId] = (week.regularByPerson[m.personId] ?? 0) + hours;
          }
        }
      }
    }
  }
  return weeks;
}

export function fte(hours: number, hoursPerWeek: number): number {
  return hoursPerWeek > 0 ? hours / hoursPerWeek : 0;
}

/**
 * Weekly hours a person has: in one team (their entry there or the workspace default), or summed
 * over all their teams. A person in no team has the workspace default.
 */
export function capacity(ws: Workspace, personId: string, teamId?: string): number {
  const fallback = ws.settings.hoursPerWeek;
  const teams = ws.teams.filter(
    (t) =>
      (teamId === undefined || t.id === teamId) && t.members.some((m) => m.personId === personId),
  );
  if (teams.length === 0) return fallback;
  return teams.reduce(
    (sum, t) =>
      sum + (Object.hasOwn(t.memberHours, personId) ? t.memberHours[personId]! : fallback),
    0,
  );
}

/**
 * Flags weeks above warnFactor x the person's usual load and weeks above maxFte. The usual load
 * of a week is the person's average, or their recurring meetings that week if that is more, so
 * peaks that come back with the cadence (every sprint start) are not flagged; one-off meetings
 * and cycle milestones on top of them are. The FTE check follows the filter: with a team filter
 * (and no person) it compares a member's hours in that team with their hours there, otherwise
 * all hours with the hours summed over their teams.
 */
export function warnings(weeks: WeekLoad[], ws: Workspace, filter: Filter = {}): LoadWarning[] {
  const teamId = filter.personId ? undefined : filter.teamId;
  const { warnFactor, maxFte } = ws.settings.thresholds;
  const result: LoadWarning[] = [];
  for (const person of ws.people) {
    const total = weeks.reduce((sum, w) => sum + (w.byPerson[person.id] ?? 0), 0);
    const average = weeks.length > 0 ? total / weeks.length : 0;
    const hoursPerWeek = capacity(ws, person.id, teamId);
    for (const week of weeks) {
      const hours = week.byPerson[person.id] ?? 0;
      const usual = Math.max(average, week.regularByPerson[person.id] ?? 0);
      if (average > 0 && hours > warnFactor * usual) {
        result.push({ monday: week.monday, personId: person.id, kind: 'above-usual' });
      }
      const fteHours = teamId ? (week.byTeamPerson[teamId]?.[person.id] ?? 0) : hours;
      // Meetings without any weekly hours in the team are always too many.
      const over = hoursPerWeek > 0 ? fte(fteHours, hoursPerWeek) > maxFte : fteHours > 0;
      if (fteHours > 0 && over) {
        result.push({ monday: week.monday, personId: person.id, kind: 'above-fte' });
      }
    }
  }
  return result.sort(
    (a, b) => a.monday.localeCompare(b.monday) || a.personId.localeCompare(b.personId),
  );
}
