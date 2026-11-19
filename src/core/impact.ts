import {
  minCommitmentOf,
  productMeetings,
  type MinCommitment,
  type ProductMeeting,
} from './demand';
import { overMax, personLoad, type WeekLoad } from './load';
import type { Workspace } from './model';

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
  /**
   * Meeting hours of the demand's role ÷ hours in the product; 1 when there are no hours. A member
   * with a second role there has that role's meetings in their overall share only.
   */
  share: number;
  state: ImpactState;
  min: MinCommitment | undefined;
  meetings: ProductMeeting[];
}

export interface OverallLoad {
  /** Average meeting hours per week in the planning horizon, all teams and areas. */
  hours: number;
  /** All the person's hours, at most the weekly hours (`loadBase`). */
  base: number;
  share: number;
  /** "über Grenze": the rule and numbers of the Terminlast people table. */
  over: boolean;
}

const EPS = 1e-9;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The person's overall status after the change, measured exactly like the Terminlast people table
 * (`personLoad` over the horizon), so "über Grenze" means the same in both places.
 */
export function overallLoad(ws: Workspace, weeks: WeekLoad[], personId: string): OverallLoad {
  const { hours, base, share } = personLoad(ws, weeks, personId);
  return { hours, base, share, over: overMax(hours, base, ws.settings.thresholds.maxFte) };
}

/** The state of `hours` in a product whose role meetings take `meetingHours` (#320). */
export function impactState(
  hours: number,
  meetingHours: number,
  min: MinCommitment | undefined,
): ImpactState {
  if (meetingHours > 0 && hours <= meetingHours + EPS) return 'meetingsOnly';
  // Member hours are stored to 0.01 h (`assign`): the Mindestzusage counts the same way.
  if (min && hours < round2(min.hours) - EPS) return 'under';
  return 'enough';
}

/**
 * The effect check for a person in a role of a product, on the workspace as it would be. The
 * person's hours in the product are their member hours there (or the weekly hours without an
 * entry), 0 when they are not a member. Cheap: no load over the horizon (see `overallLoad`).
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
  const min = minCommitmentOf(ws, meetingHours);
  return {
    hours,
    meetingHours,
    left: Math.max(0, hours - meetingHours),
    share: hours > 0 ? meetingHours / hours : 1,
    state: impactState(hours, meetingHours, min),
    min,
    meetings,
  };
}
