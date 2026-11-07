import { addDays, diffDays, mondayOf, type ISODate } from './date';
import type { CalEvent, Rule, Team, Workspace } from './model';
import { effectiveDuration, occurrences } from './recurrence';
import type { HolidayIndex } from './regions';

export interface BaseLoad {
  byRole: Record<string, number>;
  byCategory: Record<string, Record<string, number>>;
}

export interface WeekLoad {
  monday: ISODate;
  byPerson: Record<string, number>;
  byTeamRole: Record<string, Record<string, number>>;
}

export interface LoadWarning {
  monday: ISODate;
  personId: string;
  kind: 'above-average' | 'above-fte';
}

/** Average occurrences per week of a recurring rule; one-off rules count 0. */
function occurrencesPerWeek(rule: Rule, team: Team): number {
  switch (rule.type) {
    case 'weekly':
      return 1;
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
function occurrenceHours(event: CalEvent, minutes: number, share: number): number {
  return ((minutes * (1 + event.preparation)) / 60) * share;
}

/** Analytical recurring average in hours per week, independent of horizon and holidays. */
export function weeklyBaseLoad(team: Team): BaseLoad {
  const byRole: Record<string, number> = {};
  const byCategory: Record<string, Record<string, number>> = {};
  for (const event of team.events) {
    const perWeek = occurrencesPerWeek(event.rule, team);
    if (perWeek === 0) continue;
    const minutes = effectiveDuration(event, team);
    for (const p of event.participants) {
      const hours = perWeek * occurrenceHours(event, minutes, p.share);
      byRole[p.roleId] = (byRole[p.roleId] ?? 0) + hours;
      const cat = (byCategory[event.categoryId] ??= {});
      cat[p.roleId] = (cat[p.roleId] ?? 0) + hours;
    }
  }
  return { byRole, byCategory };
}

/** Hours per week for every Monday of the horizon, holidays excluded, all teams summed. */
export function loadPerWeek(ws: Workspace, index: HolidayIndex): WeekLoad[] {
  const first = mondayOf(ws.settings.horizon.from);
  const last = mondayOf(ws.settings.horizon.to);
  const count = Math.max(0, diffDays(last, first) / 7 + 1);
  const weeks: WeekLoad[] = [];
  for (let i = 0; i < count; i++) {
    const byPerson: Record<string, number> = {};
    for (const person of ws.people) byPerson[person.id] = 0;
    weeks.push({ monday: addDays(first, i * 7), byPerson, byTeamRole: {} });
  }

  for (const team of ws.teams) {
    const events = new Map(team.events.map((e) => [e.id, e]));
    for (const occ of occurrences(team, ws.settings, index)) {
      if (occ.skippedHoliday) continue;
      const event = events.get(occ.eventId);
      const week = weeks[diffDays(mondayOf(occ.date), first) / 7];
      if (!event || !week) continue;
      for (const p of event.participants) {
        const hours = occurrenceHours(event, occ.duration, p.share);
        const roles = (week.byTeamRole[team.id] ??= {});
        roles[p.roleId] = (roles[p.roleId] ?? 0) + hours;
        for (const m of team.members) {
          if (m.roleId === p.roleId) {
            week.byPerson[m.personId] = (week.byPerson[m.personId] ?? 0) + hours;
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

/** Flags weeks above warnFactor x personal average and weeks above maxFte. */
export function warnings(weeks: WeekLoad[], ws: Workspace): LoadWarning[] {
  const { warnFactor, maxFte } = ws.settings.thresholds;
  const result: LoadWarning[] = [];
  for (const person of ws.people) {
    const total = weeks.reduce((sum, w) => sum + (w.byPerson[person.id] ?? 0), 0);
    const average = weeks.length > 0 ? total / weeks.length : 0;
    for (const week of weeks) {
      const hours = week.byPerson[person.id] ?? 0;
      if (average > 0 && hours > warnFactor * average) {
        result.push({ monday: week.monday, personId: person.id, kind: 'above-average' });
      }
      if (fte(hours, person.hoursPerWeek) > maxFte) {
        result.push({ monday: week.monday, personId: person.id, kind: 'above-fte' });
      }
    }
  }
  return result.sort(
    (a, b) => a.monday.localeCompare(b.monday) || a.personId.localeCompare(b.personId),
  );
}
