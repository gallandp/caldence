import { addDays, diffDays, weekday, type ISODate } from './date';
import { capacity, fte, type WeekLoad } from './load';
import type { Area, Cadence, Team, Workspace } from './model';

/**
 * The area overview (#168): team cadences compared with the area cadence, and the load of each
 * team per week. It only compares; nothing here changes a cadence.
 */

/** Why a team is out of step. `weekday` and `length` carry what the text needs. */
export type StepReason =
  | { kind: 'weekday'; weekday: number }
  | { kind: 'length'; weeks: number; reference: number }
  | { kind: 'offset'; days: number };

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
    if (days !== 0) reasons.push({ kind: 'offset', days: Math.min(days, t * 7 - days) });
  }
  return reasons;
}

export function compareCadences(
  ws: Workspace,
  area: Area,
  from: ISODate,
  weeks: number,
): CadenceComparison {
  const teams = area.teamIds.flatMap((id) => ws.teams.filter((t) => t.id === id));
  const peer = area.cadence ? undefined : peerReference(teams);
  const reference = area.cadence
    ? { cadence: area.cadence, fromArea: true }
    : peer && { cadence: peer.cadence, fromArea: false, teamId: peer.id };
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
      const crosses = Array.from({ length: length - 1 }, (_, d) => d + 1).some(
        (d) => mod(diffDays(addDays(s.start, d), reference.cadence.start), refLength) === 0,
      );
      return { ...s, off: weekday(s.start) !== weekday(reference.cadence.start) || crosses };
    });
    return { teamId: team.id, cadence: team.cadence, inStep, reasons, segments: segs };
  });
  return { reference, areaSegments, rows };
}

export interface LoadCell {
  monday: ISODate;
  /** Average share of the members' weekly hours spent in the team's meetings (0..1+). */
  share: number;
  /** At least one member is above the maximum share (thresholds.maxFte). */
  warn: boolean;
}

/**
 * A team's load in each week: the average over its members of their meeting hours in the team
 * divided by their weekly hours there. A member without hours who has meetings counts as full
 * and over the maximum, like the warnings in Load.
 */
export function teamLoad(ws: Workspace, team: Team, weeks: WeekLoad[]): LoadCell[] {
  const people = [...new Set(team.members.map((m) => m.personId))];
  const hours = new Map(people.map((p) => [p, capacity(ws, p, team.id)]));
  const { maxFte } = ws.settings.thresholds;
  return weeks.map((week) => {
    let total = 0;
    let warn = false;
    for (const p of people) {
      const h = week.byTeamPerson[team.id]?.[p] ?? 0;
      const cap = hours.get(p) ?? 0;
      const share = cap > 0 ? fte(h, cap) : h > 0 ? 1 : 0;
      total += share;
      if (h > 0 && (cap > 0 ? share > maxFte : true)) warn = true;
    }
    return { monday: week.monday, share: people.length > 0 ? total / people.length : 0, warn };
  });
}
