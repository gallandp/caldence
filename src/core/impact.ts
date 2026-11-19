import { minCommitment, productMeetings, type MinCommitment, type ProductMeeting } from './demand';
import { loadBase, occurrenceHours, occurrencesPerWeek, overMax } from './load';
import { attendees, units, type Workspace } from './model';
import { effectiveDuration } from './recurrence';

/**
 * Effect check (#320): what a person's commitment to a product leaves after the product's
 * meetings, and their overall meeting share. Two different questions with two words: per product
 * "davon in X: n % in Terminen" against the Mindestzusage, overall "über Grenze" (all meeting
 * hours ÷ all hours, as everywhere, #273). Evaluated on the workspace as it would be (a what-if
 * built by `assign` or a member edit), so hours already in the product count.
 */

/** reicht: at or above the Mindestzusage; unter Mindestzusage; deckt nur Termine. */
export type ImpactState = 'enough' | 'under' | 'meetingsOnly';

export interface Impact {
  /** The person's weekly hours in the product. */
  hours: number;
  /** Hours per typical week in the product's meetings for the role. */
  meetingHours: number;
  /** Hours left for product work: hours − meetings, at least 0. */
  left: number;
  /** Meeting hours ÷ hours in the product; 1 when there are no hours. */
  share: number;
  state: ImpactState;
  min: MinCommitment | undefined;
  meetings: ProductMeeting[];
  overall: OverallLoad;
}

export interface OverallLoad {
  /** Meeting hours of a typical week in all teams and areas. */
  hours: number;
  /** All the person's hours, at most the weekly hours (`loadBase`). */
  base: number;
  share: number;
  /** "über Grenze": the same rule as Terminlast. */
  over: boolean;
}

const EPS = 1e-9;

/**
 * A person's meeting hours in a typical week in all their teams and areas: the analytical average
 * (no horizon, no holidays), counted like `weeklyHoursByPerson`. Only units the person can attend
 * are read: their teams, their areas and the areas of their teams.
 */
export function personWeeklyMeetingHours(ws: Workspace, personId: string): number {
  const teams = new Set(
    ws.teams.filter((t) => t.members.some((m) => m.personId === personId)).map((t) => t.id),
  );
  const relevant = new Set(teams);
  for (const a of ws.areas)
    if (
      a.teamIds.some((id) => teams.has(id)) ||
      a.members.some((m) => m.personId === personId) ||
      a.events.some((e) => e.participants.some((p) => p.personId === personId))
    )
      relevant.add(a.id);
  for (const t of ws.teams)
    if (t.events.some((e) => e.participants.some((p) => p.personId === personId)))
      relevant.add(t.id);
  let sum = 0;
  for (const unit of units(ws)) {
    if (!relevant.has(unit.id)) continue;
    for (const event of unit.events) {
      const perWeek = occurrencesPerWeek(event.rule, unit);
      if (perWeek === 0) continue;
      const minutes = effectiveDuration(event, unit);
      for (const p of event.participants)
        if (attendees(ws, unit.id, p, event).includes(personId))
          sum += perWeek * occurrenceHours(event, minutes, p.share);
    }
  }
  return sum;
}

export function overallLoad(ws: Workspace, personId: string): OverallLoad {
  const hours = personWeeklyMeetingHours(ws, personId);
  const base = loadBase(ws, personId);
  return {
    hours,
    base,
    share: base > 0 ? hours / base : hours > 0 ? 1 : 0,
    over: overMax(hours, base, ws.settings.thresholds.maxFte),
  };
}

/** The state of `hours` in a product whose role meetings take `meetingHours` (#320). */
export function impactState(
  hours: number,
  meetingHours: number,
  min: MinCommitment | undefined,
): ImpactState {
  if (meetingHours > 0 && hours <= meetingHours + EPS) return 'meetingsOnly';
  if (min && hours < min.hours - EPS) return 'under';
  return 'enough';
}

/**
 * The effect check for a person in a role of a product, on the workspace as it would be. The
 * person's hours in the product are their member hours there (or the weekly hours without an
 * entry), 0 when they are not a member.
 */
export function commitmentImpact(
  ws: Workspace,
  teamId: string,
  personId: string,
  roleId: string,
): Impact | undefined {
  const team = ws.teams.find((t) => t.id === teamId);
  if (!team) return undefined;
  const member = team.members.some((m) => m.personId === personId);
  const hours = !member
    ? 0
    : Object.hasOwn(team.memberHours, personId)
      ? team.memberHours[personId]!
      : ws.settings.hoursPerWeek;
  const meetings = productMeetings(ws, team, roleId);
  const meetingHours = meetings.reduce((s, m) => s + m.hours, 0);
  const min = minCommitment(ws, team, roleId);
  return {
    hours,
    meetingHours,
    left: Math.max(0, hours - meetingHours),
    share: hours > 0 ? meetingHours / hours : 1,
    state: impactState(hours, meetingHours, min),
    min,
    meetings,
    overall: overallLoad(ws, personId),
  };
}
