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

/**
 * `matches` for a walk over the days from `from`: day `i` is `from` + i, `wd` its weekday. The
 * day arithmetic of the frequent rules is done once per meeting instead of once per day, which
 * keeps a file at the target scale of #315 (600 meetings, one year) within its time budget.
 */
function dayMatcher(
  event: CalEvent,
  team: Team,
  from: ISODate,
): (i: number, wd: number, date: ISODate) => boolean {
  const rule = event.rule;
  switch (rule.type) {
    case 'weekly':
      return (_, wd) => wd === rule.weekday;
    case 'weekdays':
      return (_, wd) => rule.weekdays.includes(wd);
    case 'every-n-weeks': {
      if (rule.n < 1) return () => false;
      // Day index of the anchor's Monday; a day's Monday is i - (wd - 1).
      const anchor = diffDays(mondayOf(rule.anchor), from);
      return (i, wd) => wd === rule.weekday && mod((i - (wd - 1) - anchor) / 7, rule.n) === 0;
    }
    case 'cadence-day': {
      const length = team.cadence.lengthWeeks * 7;
      if (rule.day < 0 || rule.day >= length) return () => false;
      const start = diffDays(team.cadence.start, from);
      return (i) => mod(i - start, length) === rule.day;
    }
    case 'monthly-nth-weekday':
      return (_, wd, date) => wd === rule.weekday && matches(event, team, date);
    default:
      return (_, __, date) => matches(event, team, date);
  }
}

/**
 * All occurrences of a team's events inside the horizon, sorted by date then time. With `range`
 * only those inside it too (the calendar's visible month, #315 budget).
 */
export function occurrences(
  team: Team,
  settings: Settings,
  index: HolidayIndex,
  range?: { from: ISODate; to: ISODate },
): Occurrence[] {
  // Load, weeks and calendar expand the same unit in one update. Workspaces are never changed in
  // place, so the same team and settings objects mean the same answer; callers only read it.
  // One entry per range and horizon, so the calendar's month and the full horizon both stay.
  const key = `${range?.from}/${range?.to}/${settings.horizon.from}/${settings.horizon.to}`;
  let byKey = cache.get(team);
  if (!byKey) cache.set(team, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit && hit.settings === settings && hit.index === index) return hit.value;
  const value = expand(team, settings, index, range);
  if (byKey.size > 8) byKey.clear();
  byKey.set(key, { settings, index, value });
  return value;
}

const cache = new WeakMap<
  Team,
  Map<string, { settings: Settings; index: HolidayIndex; value: Occurrence[] }>
>();

/** The dates `from`, `from` + 1, ...: most units share them, so they are made once (#315). */
const dateLists = new Map<ISODate, ISODate[]>();
function datesFrom(from: ISODate, count: number): ISODate[] {
  let list = dateLists.get(from);
  if (!list) {
    if (dateLists.size > 50) dateLists.clear();
    dateLists.set(from, (list = []));
  }
  for (let i = list.length; i < count; i++) list.push(addDays(from, i));
  return list;
}

function expand(
  team: Team,
  settings: Settings,
  index: HolidayIndex,
  range?: { from: ISODate; to: ISODate },
): Occurrence[] {
  const starts = [settings.horizon.from, team.cadence.start, range?.from ?? ''];
  const from = starts.reduce((a, b) => (a > b ? a : b));
  const to = range && range.to < settings.horizon.to ? range.to : settings.horizon.to;
  const out: Occurrence[] = [];
  if (from > to) return out;
  const days = diffDays(to, from);
  const durations = new Map(team.events.map((e) => [e.id, effectiveDuration(e, team)]));
  const tests = team.events.map((e) => dayMatcher(e, team, from));
  const firstWd = weekday(from);
  const dates = datesFrom(from, days + 1);
  const minutes = team.events.map((e) => toMinutes(e.time));
  const events = team.events;
  const today: number[] = [];
  // Days come in order, so sorting each day's meetings by time sorts the whole list.
  for (let i = 0; i <= days; i++) {
    const date = dates[i]!;
    const wd = ((firstWd - 1 + i) % 7) + 1;
    today.length = 0;
    for (let k = 0; k < events.length; k++) if (tests[k]!(i, wd, date)) today.push(k);
    if (today.length > 1) today.sort((a, b) => minutes[a]! - minutes[b]!);
    const holiday = settings.skipHolidays ? index.holidays.get(date) : undefined;
    for (const k of today) {
      const event = events[k]!;
      const occ: Occurrence = {
        eventId: event.id,
        teamId: team.id,
        date,
        start: event.time,
        duration: durations.get(event.id) ?? event.duration,
      };
      if (holiday) occ.skippedHoliday = holiday;
      out.push(occ);
    }
  }
  return out;
}
