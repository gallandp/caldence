import { addDays, diffDays, isoWeek, mondayOf, toMinutes, type ISODate } from './date';
import { capacity, fte, occurrenceHours, weeklyBaseLoad, type LoadWarning } from './load';
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
      : !filter.roleId || p.roleId === filter.roleId,
  );
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
    // Only the participants the filter counts, so an area's "from every team" follows the person.
    const events = unit.events.map((event) => {
      seenCats.add(event.categoryId);
      const counts = counted(ws, unit.id, event, filter);
      const participants = event.participants
        .filter((_, i) => counts[i])
        .map((p) => ({ ...p, share: p.share * heads(ws, unit.id, p, event, filter) }));
      for (const p of participants) seenRoles.add(participantKey(p));
      return { ...event, participants };
    });
    // Every invitation line counts; a role nobody holds on some line is unfilled once per unit.
    const empty = new Set<string>();
    events.forEach((e, i) => {
      // The saved meeting, so people invited by name leave the role rows as in `heads`.
      const saved = unit.events[i]!;
      for (const p of e.participants) {
        const key = participantKey(p);
        const ids = filter.personId ? [filter.personId] : attendees(ws, unit.id, p, saved);
        const set = (holders[key] ??= new Set());
        for (const id of ids) set.add(id);
        if (!filter.personId && nobodyHolds(ws, unit.id, p)) empty.add(key);
      }
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
        const weekly = ids.reduce((sum, id) => sum + capacity(ws, id, scope), empty * hpw);
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

/** Overlapping attended occurrences of a person on the same day, across all teams. */
export function conflicts(
  ws: Workspace,
  index: HolidayIndex,
  personId: string,
): { date: ISODate; a: Occurrence; b: Occurrence }[] {
  const attended = filteredOccurrences(ws, index, { personId })
    .filter((o) => !o.skippedHoliday && o.hours > 0)
    .sort(
      (x, y) =>
        x.date.localeCompare(y.date) ||
        toMinutes(x.start) - toMinutes(y.start) ||
        x.teamId.localeCompare(y.teamId),
    );
  const out: { date: ISODate; a: Occurrence; b: Occurrence }[] = [];
  for (let i = 0; i < attended.length; i++) {
    const a = attended[i]!;
    const aEnd = toMinutes(a.start) + a.duration;
    for (let j = i + 1; j < attended.length; j++) {
      const b = attended[j]!;
      if (b.date !== a.date || toMinutes(b.start) >= aEnd) break;
      out.push({ date: a.date, a, b });
    }
  }
  return out;
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
