import {
  addDays,
  diffDays,
  fromMinutes,
  isoWeek,
  mondayOf,
  toMinutes,
  weekday,
  type ISODate,
  type Time,
} from './date';
import { capacity, fte, roleBase, occurrenceHours, weeklyBaseLoad, type LoadWarning } from './load';
import {
  areasInScope,
  attendees,
  namedPeople,
  participantKey,
  unfilled as nobodyHolds,
  unitTeamIds,
  type CalEvent,
  type Participant,
  type Settings,
  type Team,
  type Workspace,
  invitesRole,
  participantRoles,
  roleAttendees,
  roleHeads,
} from './model';
import { occurrences, type Occurrence } from './recurrence';
import { record } from './record';
import {
  holidayIndex,
  resolveRegion,
  type HolidayIndex,
  type HolidayName,
  type Region,
} from './regions';

export type Filter = { teamId?: string; roleId?: string; personId?: string };

export type FilteredOccurrence = Occurrence & { hours: number };

export type WeekRow = {
  monday: ISODate;
  week: number;
  cadence: { teamId: string; number: number }[];
  milestones: { teamId: string; cycleId: string; id: string; name: string; date: ISODate }[];
  holidays: { date: ISODate; name: HolidayName }[];
  schoolHoliday?: HolidayName;
  byRole: Record<string, number>;
  total: number;
};

/** Holiday index for the settings horizon; an unknown region gives empty maps. */
export function workspaceIndex(ws: Workspace): HolidayIndex {
  const { region, horizon } = ws.settings;
  const known = resolveRegion(ws, region);
  if (!known) return { holidays: new Map(), schoolHolidays: new Map(), beyondKnown: true };
  return holidayIndex(known, horizon.from, horizon.to);
}

/**
 * The selected region when the horizon runs past its known school holidays, else null.
 * An unknown region gives null: Settings reports it on its own, and there is no date to name.
 */
export function schoolHolidayGap(ws: Workspace, index: HolidayIndex): Region | null {
  if (!index.beyondKnown) return null;
  return resolveRegion(ws, ws.settings.region);
}

/**
 * Teams in scope: with a person filter the teams the person is a member of (teamId is ignored),
 * with a team filter that team or, for an area's id, the area's teams,
 * otherwise the team filter, otherwise all teams.
 */
export function scopeTeams(ws: Workspace, filter: Filter): Team[] {
  const personId = filter.personId;
  if (personId) {
    // Their own teams, and the teams whose meetings invite them by name (#285).
    return ws.teams.filter(
      (t) =>
        t.members.some((m) => m.personId === personId) ||
        t.events.some((e) => namedPeople(e).has(personId)),
    );
  }
  if (!filter.teamId) return ws.teams;
  const ids = new Set(unitTeamIds(ws, filter.teamId));
  return ws.teams.filter((t) => ids.has(t.id));
}

/**
 * Units whose meetings are in scope: the teams of scopeTeams, then the areas of areasInScope
 * (as teams, see areaAsTeam). A selected area brings its teams and itself; a single team never
 * brings its area; a person brings every area they attend a meeting of; no filter brings all.
 */
export function scopeUnits(ws: Workspace, filter: Filter): Team[] {
  return [...scopeTeams(ws, filter), ...areasInScope(ws, filter)];
}

/**
 * The people a filter is about: the selected person, or the members of the units in scope
 * (an area's own people included), each once.
 */
export function scopePeople(ws: Workspace, filter: Filter): Set<string> {
  if (filter.personId) return new Set([filter.personId]);
  return new Set(
    scopeUnits(ws, filter).flatMap((unit) =>
      unit.members
        .filter((m) => !filter.roleId || m.roleId === filter.roleId)
        .map((m) => m.personId),
    ),
  );
}

/**
 * Whether each participant of an event counts for the filter: with a person filter the ones the
 * person attends (an area's "from every team" included), with a role filter that role.
 */
function counted(ws: Workspace, unitId: string, event: CalEvent, filter: Filter): boolean[] {
  const personId = filter.personId;
  return event.participants.map((p) =>
    personId
      ? attendees(ws, unitId, p, event).includes(personId)
      : !filter.roleId || invitesRole(ws, unitId, p, filter.roleId),
  );
}

type RoleRow = { p: Participant; heads: number; ids: string[]; empty: boolean };

/**
 * The rows of the load by role that a meeting's participants give: per participant the selected
 * person, the person invited by name, or one row per role its people come with (its own and the
 * team roles linked to it, #338), each with its heads and people. A role filter keeps that role's
 * rows, so a row reads the same with and without the filter. `empty`: the role nobody holds.
 */
function roleRows(ws: Workspace, unitId: string, event: CalEvent, filter: Filter): RoleRow[] {
  const personId = filter.personId;
  if (personId)
    return event.participants.flatMap((p) =>
      attendees(ws, unitId, p, event).includes(personId)
        ? [{ p, heads: 1, ids: [personId], empty: false }]
        : [],
    );
  return event.participants.flatMap((p): RoleRow[] => {
    if (p.personId !== undefined) {
      if (filter.roleId) return [];
      const ids = attendees(ws, unitId, p, event);
      return [{ p, heads: ids.length, ids, empty: false }];
    }
    return participantRoles(ws, unitId, p)
      .filter((roleId) => !filter.roleId || roleId === filter.roleId)
      .map((roleId) => ({
        p: { ...p, roleId },
        heads: roleHeads(ws, unitId, p, event, roleId),
        ids: roleAttendees(ws, unitId, p, event, roleId),
        empty: roleId === p.roleId && nobodyHolds(ws, unitId, p),
      }));
  });
}

/**
 * People a counted participant stands for: everyone in the role, one if nobody holds it yet (as
 * cost counts them), or just the selected person.
 */
function heads(
  ws: Workspace,
  unitId: string,
  p: Participant,
  event: CalEvent,
  filter: Filter,
): number {
  if (filter.personId) return 1;
  if (filter.roleId) return roleHeads(ws, unitId, p, event, filter.roleId);
  return nobodyHolds(ws, unitId, p) ? 1 : attendees(ws, unitId, p, event).length;
}

/** Ids of the people in scope with a load warning, by Monday (each person once per week). */
export function warnedWeeks(
  ws: Workspace,
  all: LoadWarning[],
  filter: Filter,
): Map<ISODate, string[]> {
  const people = scopePeople(ws, filter);
  const byMonday = new Map<ISODate, string[]>();
  for (const w of all) {
    if (!people.has(w.personId)) continue;
    const ids = byMonday.get(w.monday) ?? [];
    if (!ids.includes(w.personId)) ids.push(w.personId);
    byMonday.set(w.monday, ids);
  }
  return byMonday;
}

type Attributed = { occ: Occurrence; byRole: Record<string, number> };

/** Per-occurrence hours by role, restricted by the filter (person wins over role). */
function attributed(ws: Workspace, index: HolidayIndex, filter: Filter): Attributed[] {
  const out: Attributed[] = [];
  for (const unit of scopeUnits(ws, filter)) {
    const events = new Map(unit.events.map((e) => [e.id, e]));
    const wanted = new Map(unit.events.map((e) => [e.id, counted(ws, unit.id, e, filter)]));
    if (![...wanted.values()].some((w) => w.includes(true))) continue;
    for (const occ of occurrences(unit, ws.settings, index)) {
      const event = events.get(occ.eventId);
      const counts = wanted.get(occ.eventId);
      if (!event || !counts?.includes(true)) continue;
      const byRole = record<number>();
      event.participants.forEach((p, i) => {
        if (!counts[i]) return;
        const hours = occ.skippedHoliday
          ? 0
          : occurrenceHours(event, occ.duration, p.share) * heads(ws, unit.id, p, event, filter);
        const key = participantKey(p);
        byRole[key] = (byRole[key] ?? 0) + hours;
      });
      out.push({ occ, byRole });
    }
  }
  return out;
}

const sum = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);

export function filteredOccurrences(
  ws: Workspace,
  index: HolidayIndex,
  filter: Filter,
): FilteredOccurrence[] {
  return attributed(ws, index, filter).map(({ occ, byRole }) => ({ ...occ, hours: sum(byRole) }));
}

export function dayLoad(ws: Workspace, index: HolidayIndex, filter: Filter): Map<ISODate, number> {
  const days = new Map<ISODate, number>();
  for (const o of filteredOccurrences(ws, index, filter)) {
    days.set(o.date, (days.get(o.date) ?? 0) + o.hours);
  }
  return days;
}

/** 1-based sprint/PI number counted from cadence.start; undefined before the start. */
export function cadenceNumber(team: Team, date: ISODate): number | undefined {
  const length = team.cadence.lengthWeeks * 7;
  const days = diffDays(date, team.cadence.start);
  if (days < 0 || length <= 0) return undefined;
  return Math.floor(days / length) + 1;
}

export function weekRows(ws: Workspace, index: HolidayIndex, filter: Filter): WeekRow[] {
  const first = mondayOf(ws.settings.horizon.from);
  const last = mondayOf(ws.settings.horizon.to);
  const count = Math.max(0, diffDays(last, first) / 7 + 1);
  const teams = scopeUnits(ws, filter);
  const rows: WeekRow[] = [];
  const perWeek: Record<string, number>[] = Array.from({ length: count }, () => record<number>());
  for (const { occ, byRole } of attributed(ws, index, filter)) {
    const bucket = perWeek[diffDays(mondayOf(occ.date), first) / 7];
    if (!bucket) continue;
    for (const [role, h] of Object.entries(byRole)) bucket[role] = (bucket[role] ?? 0) + h;
  }
  for (let i = 0; i < count; i++) {
    const monday = addDays(first, i * 7);
    const days = Array.from({ length: 7 }, (_, d) => addDays(monday, d));
    const row: WeekRow = {
      monday,
      week: isoWeek(monday),
      cadence: [],
      milestones: [],
      holidays: [],
      byRole: perWeek[i] ?? record(),
      total: sum(perWeek[i] ?? record()),
    };
    for (const team of teams) {
      const length = team.cadence.lengthWeeks * 7;
      for (const date of days) {
        const diff = diffDays(date, team.cadence.start);
        if (length > 0 && diff >= 0 && diff % length === 0) {
          row.cadence.push({ teamId: team.id, number: diff / length + 1 });
        }
      }
      for (const cycle of team.cycles) {
        for (const m of cycle.milestones) {
          if (m.date >= monday && m.date <= days[6]!) {
            row.milestones.push({
              teamId: team.id,
              cycleId: cycle.id,
              id: m.id,
              name: m.name,
              date: m.date,
            });
          }
        }
      }
    }
    for (const date of days) {
      const name = index.holidays.get(date);
      if (name) row.holidays.push({ date, name });
      const school = index.schoolHolidays.get(date);
      if (school && !row.schoolHoliday) row.schoolHoliday = school;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Typical week by category and role, counting every person in a role (an unfilled role as one).
 * A role's percent is its hours ÷ the weekly hours of its people (an unfilled role: the default
 * hours), so it is the average share per person; fte is the hours ÷ the default weekly hours.
 */
export function loadSummary(
  ws: Workspace,
  filter: Filter,
): {
  byCategory: { categoryId: string; hours: number }[];
  /** Per role, then per person invited by name: `roleId` is then a participantKey. */
  byRole: {
    roleId: string;
    hours: number;
    /** People in the role (an unfilled role counts as one) and their weekly hours. */
    people: number;
    weekly: number;
    percent: number;
    fte: number;
  }[];
  /** Hours per week by category and role (only entries that exist). */
  matrix: Record<string, Record<string, number>>;
  /** Roles invited where nobody holds them (per unit), each counted as one person. */
  unfilled: number;
} {
  const roleHours = record<number>();
  const catHours = record<number>();
  const matrix = record<Record<string, number>>();
  const seenRoles = new Set<string>();
  const seenCats = new Set<string>();
  /** People holding each role in scope; an unfilled role counts once per unit. */
  const holders = record<Set<string>>();
  const unfilled = record<number>();
  const hpw = ws.settings.hoursPerWeek;
  for (const unit of scopeUnits(ws, filter)) {
    // Only the rows the filter counts, so an area's "from every team" follows the person; a role
    // participant gives one row per role its people come with, filtered or not (#338).
    const empty = new Set<string>();
    const events = unit.events.map((event) => {
      seenCats.add(event.categoryId);
      const participants = roleRows(ws, unit.id, event, filter).map((r) => {
        const key = participantKey(r.p);
        seenRoles.add(key);
        const set = (holders[key] ??= new Set());
        for (const id of r.ids) set.add(id);
        if (r.empty) empty.add(key);
        return { ...r.p, share: r.p.share * r.heads };
      });
      return { ...event, participants };
    });
    for (const roleId of empty) unfilled[roleId] = (unfilled[roleId] ?? 0) + 1;
    const base = weeklyBaseLoad({ ...unit, events });
    for (const [roleId, h] of Object.entries(base.byRole)) {
      roleHours[roleId] = (roleHours[roleId] ?? 0) + h;
    }
    for (const [categoryId, roles] of Object.entries(base.byCategory)) {
      for (const [roleId, h] of Object.entries(roles)) {
        catHours[categoryId] = (catHours[categoryId] ?? 0) + h;
        const row = (matrix[categoryId] ??= record());
        row[roleId] = (row[roleId] ?? 0) + h;
      }
    }
  }
  const scope = filter.personId ? undefined : filter.teamId;
  return {
    matrix,
    unfilled: Object.values(unfilled).reduce((a, b) => a + b, 0),
    byCategory: ws.categories
      .filter((c) => seenCats.has(c.id) || c.id in catHours)
      .map((c) => ({ categoryId: c.id, hours: catHours[c.id] ?? 0 })),
    // Roles first, then the people invited by name (#285), each under its own key.
    byRole: [
      ...ws.roles.map((r) => r.id),
      ...ws.people.map((x) => participantKey({ personId: x.id, share: 1 })),
    ]
      .filter((key) => seenRoles.has(key) || key in roleHours)
      .map((key) => {
        const hours = roleHours[key] ?? 0;
        const ids = [...(holders[key] ?? [])];
        const empty = unfilled[key] ?? 0;
        // A chosen person is measured against their hours in the role, at most the Settings hours
        // (#342, #449).
        const hoursOf = (id: string) =>
          filter.personId ? roleBase(ws, id, key) : capacity(ws, id, scope);
        const weekly = ids.reduce((sum, id) => sum + hoursOf(id), empty * hpw);
        return {
          roleId: key,
          hours,
          people: ids.length + empty,
          weekly,
          percent: weekly > 0 ? (hours / weekly) * 100 : 0,
          fte: fte(hours, hpw),
        };
      }),
  };
}

/** Same-day pairs whose [start, start + duration) overlap; touching edges do not count. */
function overlapping<T extends Occurrence>(list: T[]): { date: ISODate; a: T; b: T }[] {
  const sorted = [...list].sort(
    (x, y) =>
      x.date.localeCompare(y.date) ||
      toMinutes(x.start) - toMinutes(y.start) ||
      x.teamId.localeCompare(y.teamId),
  );
  const out: { date: ISODate; a: T; b: T }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    const aEnd = toMinutes(a.start) + a.duration;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      if (b.date !== a.date || toMinutes(b.start) >= aEnd) break;
      out.push({ date: a.date, a, b });
    }
  }
  return out;
}

/** Overlapping attended occurrences of a person on the same day, across all teams. */
export function conflicts(
  ws: Workspace,
  index: HolidayIndex,
  personId: string,
): { date: ISODate; a: Occurrence; b: Occurrence }[] {
  return overlapping(
    filteredOccurrences(ws, index, { personId }).filter((o) => !o.skippedHoliday && o.hours > 0),
  );
}

export interface Clash {
  personId: string;
  date: ISODate;
  a: Occurrence;
  b: Occurrence;
}

/**
 * The `conflicts` of several people in one pass (#339): every unit's meetings are expanded once
 * and handed to the people who attend them. Sorted by date, then in the order of `personIds`.
 * `from` and `to` keep dates in [from, to); `units` keeps pairs with at least one meeting in them.
 */
export function clashes(
  ws: Workspace,
  index: HolidayIndex,
  personIds: Iterable<string>,
  options: { from?: ISODate; to?: ISODate; units?: ReadonlySet<string> } = {},
): Clash[] {
  const { from, to, units } = options;
  const byPerson = new Map<string, FilteredOccurrence[]>();
  for (const id of personIds) byPerson.set(id, []);
  for (const unit of scopeUnits(ws, {})) {
    // Per meeting: who of them attends, with the shares of the lines that invite them.
    const invited = new Map<string, { event: CalEvent; shares: Map<string, number[]> }>();
    for (const event of unit.events) {
      const shares = new Map<string, number[]>();
      for (const p of event.participants)
        for (const id of attendees(ws, unit.id, p, event))
          if (byPerson.has(id)) shares.set(id, [...(shares.get(id) ?? []), p.share]);
      if (shares.size > 0) invited.set(event.id, { event, shares });
    }
    if (invited.size === 0) continue;
    for (const occ of occurrences(unit, ws.settings, index)) {
      const meeting = invited.get(occ.eventId);
      if (!meeting || occ.skippedHoliday) continue;
      if ((from !== undefined && occ.date < from) || (to !== undefined && occ.date >= to)) continue;
      for (const [id, shares] of meeting.shares) {
        // The hours a person filter counts; meetings worth 0 h are not attended.
        const hours = shares.reduce(
          (sum, share) => sum + occurrenceHours(meeting.event, occ.duration, share),
          0,
        );
        if (hours > 0) byPerson.get(id)!.push({ ...occ, hours });
      }
    }
  }
  const out: Clash[] = [];
  for (const [personId, list] of byPerson)
    for (const c of overlapping(list))
      if (!units || units.has(c.a.teamId) || units.has(c.b.teamId)) out.push({ personId, ...c });
  // A stable sort keeps the people's order within a day.
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

/** When both meetings of a clash run: from the later start to the earlier end. */
export function clashTime(c: { a: Occurrence; b: Occurrence }): { start: Time; end: Time } {
  const start = Math.max(toMinutes(c.a.start), toMinutes(c.b.start));
  const end = Math.min(toMinutes(c.a.start) + c.a.duration, toMinutes(c.b.start) + c.b.duration);
  return { start: fromMinutes(start), end: fromMinutes(end % (24 * 60)) };
}

/** One meeting by its unit and id. */
export interface MeetingRef {
  teamId: string;
  eventId: string;
}

/** The clashes of one pair of meetings, whoever has them (#445). */
export interface OverlapPair {
  key: string;
  /** The meeting that starts first on the first day, then the other. */
  a: MeetingRef;
  b: MeetingRef;
  /** The weekdays (1 = Monday) on which they overlap, ascending. */
  weekdays: number[];
  /** When both run on the first day. */
  start: Time;
  end: Time;
  /** The people affected, in the order of the clashes. */
  people: string[];
  /** The days affected, ascending, each once. */
  dates: ISODate[];
  /** The first clash: the example that opens its week. */
  first: { date: ISODate; personId: string };
}

/**
 * The clashes grouped by the pair of meetings that causes them (#445): the unit that Meeting load
 * and the area Overview count. The pair with the most days comes first, otherwise the earlier.
 */
export function overlapPairs(found: readonly Clash[]): OverlapPair[] {
  const ref = (o: Occurrence) => `${o.teamId}/${o.eventId}`;
  const byKey = new Map<string, OverlapPair>();
  for (const c of found) {
    const key = [ref(c.a), ref(c.b)].sort().join(' × ');
    let pair = byKey.get(key);
    if (!pair) {
      const time = clashTime(c);
      pair = {
        key,
        a: { teamId: c.a.teamId, eventId: c.a.eventId },
        b: { teamId: c.b.teamId, eventId: c.b.eventId },
        weekdays: [],
        start: time.start,
        end: time.end,
        people: [],
        dates: [],
        first: { date: c.date, personId: c.personId },
      };
      byKey.set(key, pair);
    }
    if (!pair.people.includes(c.personId)) pair.people.push(c.personId);
    // `clashes` comes sorted by date, so a new day is the last one or none.
    if (pair.dates[pair.dates.length - 1] !== c.date) pair.dates.push(c.date);
    const day = weekday(c.date);
    if (!pair.weekdays.includes(day)) pair.weekdays.push(day);
  }
  const pairs = [...byKey.values()];
  for (const p of pairs) p.weekdays.sort((x, y) => x - y);
  // A stable sort keeps the earlier pair first among equals.
  return pairs.sort((x, y) => y.dates.length - x.dates.length);
}

/** Neighbouring weekdays as runs, [first, last]: [1, 2, 3, 5] gives [[1, 3], [5, 5]]. */
export function weekdayRuns(days: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const d of days) {
    const last = out[out.length - 1];
    if (last && last[1] === d - 1) last[1] = d;
    else out.push([d, d]);
  }
  return out;
}

/** Weeks in the window of the area Overview and of the overlaps in Meeting load. */
export const WINDOW_WEEKS = 12;

/**
 * The window of the area Overview (#168), also the period of the overlaps (#445): it starts in the
 * week of `today`, inside the horizon, and holds up to WINDOW_WEEKS weeks of it. Near the end of
 * the horizon it ends with it instead of shrinking.
 */
export function overviewWindow(
  horizon: { from: ISODate; to: ISODate },
  today: ISODate,
): { from: ISODate; weeks: number } {
  const week = mondayOf(today);
  const first = mondayOf(horizon.from);
  const last = mondayOf(horizon.to);
  const latest = addDays(last, -(WINDOW_WEEKS - 1) * 7);
  const end = latest > first ? latest : first;
  const from = week < first ? first : week > end ? end : week;
  const weeks = Math.max(1, Math.min(WINDOW_WEEKS, diffDays(last, from) / 7 + 1));
  return { from, weeks };
}

/**
 * The next date, on or after `today`, on which each of the team's events takes place inside
 * the horizon. Occurrences dropped for a holiday don't count, nor do today's that ended by
 * `minutes` (minutes since midnight). Events with no date left are absent.
 */
export function nextDates(
  team: Team,
  settings: Settings,
  index: HolidayIndex,
  today: ISODate,
  minutes = 0,
): Map<string, ISODate> {
  // Days before today never count, so the expansion starts there.
  const from = settings.horizon.from > today ? settings.horizon.from : today;
  const upcoming = { ...settings, horizon: { ...settings.horizon, from } };
  const next = new Map<string, ISODate>();
  for (const o of occurrences(team, upcoming, index)) {
    if (o.skippedHoliday || next.has(o.eventId)) continue;
    if (o.date === today && toMinutes(o.start) + o.duration <= minutes) continue;
    next.set(o.eventId, o.date);
    if (next.size === team.events.length) break;
  }
  return next;
}
