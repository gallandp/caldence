import { addDays, diffDays, mondayOf, nthWeekdayOfMonth, weekday, toMinutes } from './date';
import type { ISODate, Time } from './date';
import type { CalEvent, Settings, Team } from './model';
import type { HolidayIndex, HolidayName } from './regions';

export interface Occurrence {
  eventId: string;
  teamId: string;
  date: ISODate;
  start: Time;
  duration: number;
  skippedHoliday?: HolidayName;
}

/** Duration in minutes; scaled durations are rounded up to the grid (grid <= 0: no rounding). */
export function effectiveDuration(event: CalEvent, team: Team): number {
  const s = event.scaling;
  if (!s) return event.duration;
  // Own keys only: an assumption named `constructor` must not read Object.prototype (#40).
  const units = Object.hasOwn(team.assumptions, s.assumption) ? team.assumptions[s.assumption] : 0;
  const raw = s.base + s.perUnit * (units ?? 0);
  return s.grid > 0 ? Math.ceil(raw / s.grid) * s.grid : raw;
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

function matches(event: CalEvent, team: Team, date: ISODate): boolean {
  const rule = event.rule;
  switch (rule.type) {
    case 'weekly':
      return weekday(date) === rule.weekday;
    case 'weekdays':
      return rule.weekdays.includes(weekday(date));
    case 'every-n-weeks': {
      if (weekday(date) !== rule.weekday || rule.n < 1) return false;
      const weeks = diffDays(mondayOf(date), mondayOf(rule.anchor)) / 7;
      return mod(weeks, rule.n) === 0;
    }
    case 'monthly-nth-weekday':
      return (
        nthWeekdayOfMonth(
          Number(date.slice(0, 4)),
          Number(date.slice(5, 7)),
          rule.weekday,
          rule.nth,
        ) === date
      );
    case 'cadence-day': {
      const length = team.cadence.lengthWeeks * 7;
      if (rule.day < 0 || rule.day >= length) return false;
      return mod(diffDays(date, team.cadence.start), length) === rule.day;
    }
    case 'cycle-milestone': {
      const milestone = team.cycles
        .find((c) => c.id === rule.cycleId)
        ?.milestones.find((m) => m.id === rule.milestoneId);
      return !!milestone && addDays(milestone.date, rule.offsetDays) === date;
    }
    case 'once':
      return rule.date === date;
  }
}

/** All occurrences of a team's events inside the horizon, sorted by date then time. */
export function occurrences(team: Team, settings: Settings, index: HolidayIndex): Occurrence[] {
  const from =
    settings.horizon.from > team.cadence.start ? settings.horizon.from : team.cadence.start;
  const to = settings.horizon.to;
  const out: Occurrence[] = [];
  if (from > to) return out;
  const days = diffDays(to, from);
  const durations = new Map(team.events.map((e) => [e.id, effectiveDuration(e, team)]));
  for (let i = 0; i <= days; i++) {
    const date = addDays(from, i);
    for (const event of team.events) {
      if (!matches(event, team, date)) continue;
      const occ: Occurrence = {
        eventId: event.id,
        teamId: team.id,
        date,
        start: event.time,
        duration: durations.get(event.id) ?? event.duration,
      };
      const holiday = settings.skipHolidays ? index.holidays.get(date) : undefined;
      if (holiday) occ.skippedHoliday = holiday;
      out.push(occ);
    }
  }
  return out.sort((a, b) =>
    a.date === b.date ? toMinutes(a.start) - toMinutes(b.start) : a.date < b.date ? -1 : 1,
  );
}
