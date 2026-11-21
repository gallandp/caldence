import { headCount } from './cost';
import { addDays, diffDays, weekday, type ISODate } from './date';
import {
  capacity,
  fte,
  loadBase,
  occurrenceHours,
  occurrencesPerWeek,
  overMax,
  type WeekLoad,
} from './load';
import {
  areaAsTeam,
  attendees,
  orgArea,
  unfilled,
  type Area,
  type Cadence,
  type Team,
  type Workspace,
} from './model';
import { effectiveDuration } from './recurrence';
import { areaStructure } from './structure';

/**
 * The area overview (#168): team cadences compared with the area cadence, and the load of each
 * team per week. It only compares; nothing here changes a cadence.
 */

/** Why a team is out of step. `weekday` and `length` carry what the text needs. */
export type StepReason =
  | { kind: 'weekday'; weekday: number }
  | { kind: 'length'; weeks: number; reference: number }
  | { kind: 'offset'; weeks: number };

export interface Segment {
  /** First day of the period, possibly before the window. */
  start: ISODate;
  /** Index of the window week it is drawn from, and how many weeks it is drawn over. */
  fromWeek: number;
  span: number;
  number: number;
  /** The period crosses a reference period start or starts on another weekday. */
  off: boolean;
}

export interface CadenceRow {
  teamId: string;
  cadence: Cadence;
  inStep: boolean;
  reasons: StepReason[];
  segments: Segment[];
}

export interface CadenceComparison {
  /** The reference: the area's own cadence, or (without one) the cadence most teams share. */
  reference?: { cadence: Cadence; fromArea: boolean; teamId?: string };
  /** Teams whose cadence equals the peer reference (1 when no two share one); 0 without one. */
  sharing: number;
  /** The area's own periods in the window; empty without an area cadence. */
  areaSegments: Segment[];
  rows: CadenceRow[];
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** The periods of a cadence that overlap the window of `weeks` weeks from `from` (a Monday). */
export function segments(cadence: Cadence, from: ISODate, weeks: number): Segment[] {
  const length = cadence.lengthWeeks * 7;
  const out: Segment[] = [];
  if (length <= 0 || weeks <= 0) return out;
  const end = addDays(from, weeks * 7);
  // The first period that ends after the window starts (never before the cadence starts).
  const offset = diffDays(from, cadence.start);
  let n = offset <= 0 ? 0 : Math.floor(offset / length);
  for (;;) {
    const start = addDays(cadence.start, n * length);
    if (start >= end) break;
    const first = start < from ? from : start;
    out.push({
      start,
      fromWeek: Math.floor(diffDays(first, from) / 7),
      span: 1,
      number: n + 1,
      off: false,
    });
    n++;
  }
  // A period fills the weeks up to the week the next one starts in (periods are whole weeks long,
  // so a period that starts mid-week is drawn from the week it starts in).
  out.forEach((s, i) => (s.span = (out[i + 1]?.fromWeek ?? weeks) - s.fromWeek));
  return out;
}

function sameCadence(a: Cadence, b: Cadence): boolean {
  return (
    a.lengthWeeks === b.lengthWeeks &&
    a.lengthWeeks > 0 &&
    mod(diffDays(a.start, b.start), a.lengthWeeks * 7) === 0
  );
}

/** Without an area cadence: the cadence most teams share (on a tie the first team's). */
function peerReference(teams: Team[]): Team | undefined {
  let best: Team | undefined;
  let bestCount = 0;
  for (const team of teams) {
    const count = teams.filter((t) => sameCadence(t.cadence, team.cadence)).length;
    if (count > bestCount) [best, bestCount] = [team, count];
  }
  return best;
}

/**
 * In step with an area cadence: the team's period length divides the area period and its period
 * starts fall on area period starts. Against a peer reference: same length and same starts.
 */
export function stepReasons(team: Cadence, reference: Cadence, fromArea: boolean): StepReason[] {
  const reasons: StepReason[] = [];
  const t = team.lengthWeeks;
  const r = reference.lengthWeeks;
  if (t <= 0 || r <= 0) return reasons;
  if (weekday(team.start) !== weekday(reference.start)) {
    reasons.push({ kind: 'weekday', weekday: weekday(team.start) });
  }
  const fits = fromArea ? r % t === 0 : r === t;
  if (!fits) reasons.push({ kind: 'length', weeks: t, reference: r });
  if (reasons.length === 0) {
    const days = mod(diffDays(team.start, reference.start), t * 7);
    // Same weekday here, so the offset is whole weeks.
    if (days !== 0) reasons.push({ kind: 'offset', weeks: Math.min(days, t * 7 - days) / 7 });
  }
  return reasons;
}

/**
 * `base` is the saved file while a what-if is active (#470): the peer reference comes from it, so
 * a what-if on the reference team shows that team as differing instead of moving the reference.
 * Only when the what-ifs make more teams share another cadence does that one become the reference.
 */
export function compareCadences(
  ws: Workspace,
  area: Area,
  from: ISODate,
  weeks: number,
  base: Workspace = ws,
): CadenceComparison {
  const teams = area.teamIds.flatMap((id) => ws.teams.filter((t) => t.id === id));
  const sharing = (c: Cadence) => teams.filter((t) => sameCadence(t.cadence, c)).length;
  const peer = area.cadence ? undefined : peerReference(teams);
  const saved = area.cadence
    ? undefined
    : peerReference(area.teamIds.flatMap((id) => base.teams.filter((t) => t.id === id)));
  // The saved reference stays unless a what-if makes more teams (two at least) share another.
  const kept =
    saved && !(peer && sharing(peer.cadence) > Math.max(1, sharing(saved.cadence)))
      ? { cadence: saved.cadence, teamId: saved.id }
      : peer && { cadence: peer.cadence, teamId: peer.id };
  const reference = area.cadence
    ? { cadence: area.cadence, fromArea: true }
    : kept && { ...kept, fromArea: false };
  const areaSegments = area.cadence ? segments(area.cadence, from, weeks) : [];
  const refLength = (reference?.cadence.lengthWeeks ?? 0) * 7;
  const rows = teams.map((team): CadenceRow => {
    const reasons = reference
      ? stepReasons(team.cadence, reference.cadence, reference.fromArea)
      : [];
    const inStep = reasons.length === 0;
    const segs = segments(team.cadence, from, weeks).map((s) => {
      if (inStep || !reference || refLength <= 0) return s;
      if (!reference.fromArea) return { ...s, off: true };
      // A period is off when it starts on another weekday or runs over an area period start.
      const length = team.cadence.lengthWeeks * 7;
      const o = mod(diffDays(s.start, reference.cadence.start), refLength);
      const crosses = o === 0 ? length > refLength : o + length > refLength;
      return { ...s, off: weekday(s.start) !== weekday(reference.cadence.start) || crosses };
    });
    return { teamId: team.id, cadence: team.cadence, inStep, reasons, segments: segs };
  });
  return { reference, sharing: kept ? sharing(kept.cadence) : 0, areaSegments, rows };
}

/** The organisation's comparison, with what its lead line needs (#450). */
export interface OrgComparison extends CadenceComparison {
  /** Teams judged by their area's cadence. */
  byArea: number;
  /** Teams compared with the reference, the cadence most teams share. */
  others: number;
}

/**
 * Alignment of all teams for the organisation's page (#450). A team in an area with a cadence
 * takes the verdict of that area's Overview; every other team is compared with the cadence most
 * teams of the organisation share (on a tie the first team's), as in an area without a cadence.
 * Rows keep the order of the teams; there are no area segments.
 */
export function compareOrgCadences(
  ws: Workspace,
  from: ISODate,
  weeks: number,
  base: Workspace = ws,
): OrgComparison {
  const all = compareCadences(ws, orgArea(ws), from, weeks, base);
  const byArea = new Map<string, CadenceRow>();
  for (const area of ws.areas)
    if (area.cadence)
      for (const row of compareCadences(ws, area, from, weeks).rows) byArea.set(row.teamId, row);
  return {
    ...all,
    rows: all.rows.map((row) => byArea.get(row.teamId) ?? row),
    byArea: byArea.size,
    others: all.rows.length - byArea.size,
  };
}

export interface LoadCell {
  monday: ISODate;
  /**
   * Meeting hours of all members in the team's meetings that week ÷ their weekly hours there:
   * the same pooled share as "Meetings in the team" in the cost table, but for the real week,
   * one-off meetings included (#262).
   */
  share: number;
  /**
   * At least one member is over the limit (thresholds.maxFte), judged like the people table and
   * Warnings on all their meetings that week ÷ their hours in all their teams and areas (#294,
   * #307), not on this team alone.
   */
  warn: boolean;
}

/** One row of the strip: meeting hours in a unit ÷ weekly hours there (people, unfilled roles). */
function unitLoad(
  ws: Workspace,
  unitId: string,
  people: string[],
  weeks: WeekLoad[],
  roles: string[] = [],
): LoadCell[] {
  const capTotal =
    people.reduce((sum, p) => sum + capacity(ws, p, unitId), 0) +
    roles.length * ws.settings.hoursPerWeek;
  const allHours = new Map(people.map((p) => [p, loadBase(ws, p)]));
  const { maxFte } = ws.settings.thresholds;
  return weeks.map((week) => {
    const total =
      people.reduce((sum, p) => sum + (week.byTeamPerson[unitId]?.[p] ?? 0), 0) +
      roles.reduce((sum, r) => sum + (week.byTeamRole[unitId]?.[r] ?? 0), 0);
    const warn = people.some((p) => overMax(week.byPerson[p] ?? 0, allHours.get(p) ?? 0, maxFte));
    const share = capTotal > 0 ? fte(total, capTotal) : total > 0 ? 1 : 0;
    return { monday: week.monday, share, warn };
  });
}

/**
 * A team's load in each week, pooled like the cost table: the members' meeting hours in the team
 * ÷ their weekly hours there; a role nobody holds counts as one person with the default weekly
 * hours (#360). Meetings without any weekly hours to measure them against count as full. `warn`
 * is per person, on all their teams and areas (#294), so never from an unfilled role.
 */
export function teamLoad(ws: Workspace, team: Team, weeks: WeekLoad[]): LoadCell[] {
  const roles = new Set(
    team.events.flatMap((e) =>
      e.participants.flatMap((p) =>
        p.roleId !== undefined && unfilled(ws, team.id, p) ? [p.roleId] : [],
      ),
    ),
  );
  const people = [...new Set(team.members.map((m) => m.personId))];
  return unitLoad(ws, team.id, people, weeks, [...roles]);
}

/**
 * Members with 0 h in the team (#446): their meetings count in "Meetings in the team", but their
 * hours do not, so the share reads higher than for a team without such members.
 */
export function zeroHourMembers(ws: Workspace, team: Team): string[] {
  const people = [...new Set(team.members.map((m) => m.personId))];
  return people.filter((p) => capacity(ws, p, team.id) === 0);
}

/** People of the area in none of its teams, such as the head of area (the "only in" group). */
export function areaOnlyPeople(ws: Workspace, area: Area): string[] {
  return areaStructure(ws, area)
    .people.filter((p) => p.group === 'area')
    .map((p) => p.personId);
}

/**
 * The load of the people only in the area (#334): their meetings in the area ÷ their area hours,
 * and `warn` on all their meetings ÷ all their weekly hours, like a team row.
 */
export function areaOnlyLoad(ws: Workspace, area: Area, weeks: WeekLoad[]): LoadCell[] {
  return unitLoad(ws, area.id, areaOnlyPeople(ws, area), weeks);
}

export interface AreaMeetingHours {
  eventId: string;
  /** Hours per week of all attendees together (a role nobody holds as one); 0 if not recurring. */
  perWeek: number;
  /** Whether the meeting comes back on its own (it has a weekly average). */
  recurring: boolean;
  /** Attendees per participant line, in the event's order. */
  attendees: string[][];
  /** Roles the meeting invites that nobody holds; each counts as one person (#360). */
  unfilled: string[];
}

/** Each area meeting's weekly hours (recurring average, all attendees) and who attends. */
export function areaMeetingHours(ws: Workspace, area: Area): AreaMeetingHours[] {
  const unit = areaAsTeam(area);
  return area.events.map((event) => {
    const perWeek = occurrencesPerWeek(event.rule, unit);
    const minutes = effectiveDuration(event, unit);
    const lists = event.participants.map((p) => attendees(ws, area.id, p, event));
    // A role nobody holds counts as one person, like the area row of the cost table (#360).
    const hours = event.participants.reduce(
      (sum, p) =>
        sum + perWeek * occurrenceHours(event, minutes, p.share) * headCount(ws, area.id, p, event),
      0,
    );
    return {
      eventId: event.id,
      perWeek: hours,
      recurring: perWeek > 0,
      attendees: lists,
      unfilled: event.participants.flatMap((p) =>
        p.roleId !== undefined && unfilled(ws, area.id, p) ? [p.roleId] : [],
      ),
    };
  });
}
