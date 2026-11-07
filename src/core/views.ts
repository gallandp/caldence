import { REGIONS } from '../data/regions';
import { addDays, diffDays, isoWeek, mondayOf, toMinutes, type ISODate } from './date';
import { fte, occurrenceHours, weeklyBaseLoad } from './load';
import type { Team, Workspace } from './model';
import { occurrences, type Occurrence } from './recurrence';
import { holidayIndex, type HolidayIndex, type HolidayName } from './regions';

export type Filter = { teamId?: string; roleId?: string; personId?: string };

export type FilteredOccurrence = Occurrence & { hours: number };

export type WeekRow = {
  monday: ISODate;
  week: number;
  cadence: { teamId: string; number: number }[];
  milestones: { teamId: string; name: string; date: ISODate }[];
  holidays: { date: ISODate; name: HolidayName }[];
  schoolHoliday?: HolidayName;
  byRole: Record<string, number>;
  total: number;
};

/** Holiday index for the settings horizon; an unknown region gives empty maps. */
export function workspaceIndex(ws: Workspace): HolidayIndex {
  const { region, horizon } = ws.settings;
  const known = REGIONS[region];
  if (!known) return { holidays: new Map(), schoolHolidays: new Map(), beyondKnown: true };
  return holidayIndex(known, horizon.from, horizon.to);
}

/** Teams in scope: the person filter spans all teams and ignores teamId. */
function scopedTeams(ws: Workspace, filter: Filter): Team[] {
  if (filter.personId || !filter.teamId) return ws.teams;
  return ws.teams.filter((t) => t.id === filter.teamId);
}

type Attributed = { occ: Occurrence; byRole: Record<string, number> };

/** Per-occurrence hours by role, restricted by the filter (person wins over role). */
function attributed(ws: Workspace, index: HolidayIndex, filter: Filter): Attributed[] {
  const out: Attributed[] = [];
  for (const team of scopedTeams(ws, filter)) {
    const events = new Map(team.events.map((e) => [e.id, e]));
    const personRoles = filter.personId
      ? new Set(team.members.filter((m) => m.personId === filter.personId).map((m) => m.roleId))
      : undefined;
    if (personRoles?.size === 0) continue;
    for (const occ of occurrences(team, ws.settings, index)) {
      const event = events.get(occ.eventId);
      if (!event) continue;
      const byRole: Record<string, number> = {};
      let attends = false;
      for (const p of event.participants) {
        if (personRoles ? !personRoles.has(p.roleId) : filter.roleId && p.roleId !== filter.roleId)
          continue;
        attends = true;
        const hours = occ.skippedHoliday ? 0 : occurrenceHours(event, occ.duration, p.share);
        byRole[p.roleId] = (byRole[p.roleId] ?? 0) + hours;
      }
      if (attends) out.push({ occ, byRole });
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
  const teams = scopedTeams(ws, { teamId: filter.teamId });
  const rows: WeekRow[] = [];
  const perWeek: Record<string, number>[] = Array.from({ length: count }, () => ({}));
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
      byRole: perWeek[i] ?? {},
      total: sum(perWeek[i] ?? {}),
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
            row.milestones.push({ teamId: team.id, name: m.name, date: m.date });
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

export function loadSummary(
  ws: Workspace,
  filter: Filter,
): {
  byCategory: { categoryId: string; hours: number }[];
  byRole: { roleId: string; hours: number; percent: number; fte: number }[];
} {
  const roleHours: Record<string, number> = {};
  const catHours: Record<string, number> = {};
  const seenRoles = new Set<string>();
  const seenCats = new Set<string>();
  const hpw = ws.settings.hoursPerWeek;
  for (const team of scopedTeams(ws, filter)) {
    const personRoles = filter.personId
      ? new Set(team.members.filter((m) => m.personId === filter.personId).map((m) => m.roleId))
      : undefined;
    if (personRoles?.size === 0) continue;
    const wanted = (roleId: string): boolean =>
      personRoles ? personRoles.has(roleId) : !filter.roleId || roleId === filter.roleId;
    for (const event of team.events) {
      seenCats.add(event.categoryId);
      for (const p of event.participants) if (wanted(p.roleId)) seenRoles.add(p.roleId);
    }
    const base = weeklyBaseLoad(team);
    for (const [roleId, h] of Object.entries(base.byRole)) {
      if (wanted(roleId)) roleHours[roleId] = (roleHours[roleId] ?? 0) + h;
    }
    for (const [categoryId, roles] of Object.entries(base.byCategory)) {
      for (const [roleId, h] of Object.entries(roles)) {
        if (wanted(roleId)) catHours[categoryId] = (catHours[categoryId] ?? 0) + h;
      }
    }
  }
  return {
    byCategory: ws.categories
      .filter((c) => seenCats.has(c.id) || c.id in catHours)
      .map((c) => ({ categoryId: c.id, hours: catHours[c.id] ?? 0 })),
    byRole: ws.roles
      .filter((r) => seenRoles.has(r.id) || r.id in roleHours)
      .map((r) => {
        const hours = roleHours[r.id] ?? 0;
        return {
          roleId: r.id,
          hours,
          percent: hpw > 0 ? (hours / hpw) * 100 : 0,
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
