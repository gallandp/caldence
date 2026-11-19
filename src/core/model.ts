import { randomId } from './id';
import { addDays, type ISODate, type Time } from './date';
import type { LevelNames } from './levels';
import type { Region } from './regions';

export const CURRENT_SCHEMA = 7;
/**
 * Caldence 2 (branch release/v2, served at /v2/) writes `schemaVersion` 1000 + n (#344). 1.x
 * never opens such a file and says where it belongs, so its new data is never lost on save.
 */
export const FORMAT2_SCHEMA_BASE = 1000;

export interface Settings {
  locale: 'de' | 'en';
  region: string;
  timezone: string;
  workdays: number[];
  hoursPerWeek: number;
  horizon: { from: ISODate; to: ISODate };
  skipHolidays: boolean;
  thresholds: { warnFactor: number; maxFte: number };
  /** Optional euros per person and hour; without it no costs are shown. */
  hourlyRate?: number;
  /** Names of the two levels; without it Bereich/Team (Area/Team). */
  levelNames?: LevelNames;
}

export interface Role {
  id: string;
  name: string;
  colour: string;
  /**
   * Marks the role as one half of an owner tandem (#331): the business ("fachlich") or technical
   * owner of the unit whose member holds it, e.g. business Product Owner of a team.
   */
  owner?: OwnerHalf;
}

/** The two halves of an owner tandem (#331). */
export type OwnerHalf = 'business' | 'technical';
/** Which owners a unit wants: a tandem of both (the default) or deliberately only one. */
export type OwnerMode = 'both' | OwnerHalf;

export interface Person {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  colour: string;
}

export interface Cadence {
  kind: 'sprint' | 'flow' | 'pi';
  lengthWeeks: number;
  start: ISODate;
}

export interface Cycle {
  id: string;
  name: string;
  milestones: { id: string; name: string; date: ISODate }[];
}

export type Weekday = number;

export type Rule =
  | { type: 'weekly'; weekday: Weekday }
  /** Non-empty, unique, 1-7. */
  | { type: 'weekdays'; weekdays: Weekday[] }
  | { type: 'every-n-weeks'; weekday: Weekday; n: number; anchor: ISODate }
  | { type: 'monthly-nth-weekday'; weekday: Weekday; nth: 1 | 2 | 3 | 4 | 5 | -1 }
  /** day: 0-based day within the cadence period (0 = start day) */
  | { type: 'cadence-day'; day: number }
  | { type: 'cycle-milestone'; cycleId: string; milestoneId: string; offsetDays: number }
  | { type: 'once'; date: ISODate };

/**
 * A role invited to a meeting: everyone with the role in the unit. In an area, `fromTeams` also
 * invites everyone with the role in every team of the area ("Product Owner from every team").
 */
export interface RoleParticipant {
  roleId: string;
  share: number;
  fromTeams?: boolean;
  personId?: undefined;
}

/**
 * One person invited by name, from any team or area (#285). They count once, with this share,
 * also when one of their roles is invited to the same meeting.
 */
export interface PersonParticipant {
  personId: string;
  share: number;
  roleId?: undefined;
  fromTeams?: undefined;
}

/** Who attends a meeting: a role or one person. */
export type Participant = RoleParticipant | PersonParticipant;

/** Prefix of a person's key in per-role figures: role and person ids may be equal in a file. */
const PERSON_KEY = 'person:';

/** The key a participant's hours are listed under in per-role figures: the role, or the person. */
export function participantKey(p: Participant): string {
  return p.personId !== undefined ? PERSON_KEY + p.personId : p.roleId;
}

/** The name behind a key of participantKey: the role's, or the person's. */
export function keyName(ws: Workspace, key: string): string {
  const person = key.startsWith(PERSON_KEY) ? key.slice(PERSON_KEY.length) : undefined;
  const hit =
    person !== undefined
      ? ws.people.find((x) => x.id === person)
      : ws.roles.find((x) => x.id === key);
  return hit?.name ?? person ?? key;
}

/** The name a participant is shown with: the role's, or the person's. */
export function participantName(ws: Workspace, p: Participant): string {
  return keyName(ws, participantKey(p));
}

export interface CalEvent {
  id: string;
  name: string;
  categoryId: string;
  rule: Rule;
  time: Time;
  duration: number;
  scaling?: { base: number; perUnit: number; assumption: string; grid: number };
  participants: Participant[];
  preparation: number;
  /**
   * Set when the meeting takes place on site (#309); missing means remote. Everyone attending
   * travels `travel` minutes per occurrence, there and back together.
   */
  onSite?: { travel: number };
}

export interface Team {
  id: string;
  name: string;
  templateId?: string;
  cadence: Cadence;
  members: { personId: string; roleId: string }[];
  /** Weekly hours of a person in this team; a missing entry means settings.hoursPerWeek. */
  memberHours: Record<string, number>;
  assumptions: Record<string, number>;
  cycles: Cycle[];
  events: CalEvent[];
  /** Owner set-up of the team (#331); missing means a tandem ('both'). */
  ownerMode?: OwnerMode;
}

/**
 * A group of teams (default name "Bereich" / "Area"), shaped like a team so that recurrence, load
 * and cost code can treat it as one more unit. A team is in at most one area; areas do not nest.
 */
export interface Area {
  id: string;
  name: string;
  teamIds: string[];
  /** Optional reference cadence, e.g. a planning interval of 10 weeks. */
  cadence?: Cadence;
  /** People with a role at area level, e.g. head of area. */
  members: { personId: string; roleId: string }[];
  /**
   * Weekly hours of a person in the area. Unlike a team, a missing entry means 0 hours: area time
   * is extra to team time and has to be set on purpose.
   */
  memberHours: Record<string, number>;
  cycles: Cycle[];
  events: CalEvent[];
  /** Owner set-up of the area (#331); missing means a tandem ('both'). */
  ownerMode?: OwnerMode;
}

export interface Workspace {
  /** UUID v4, stable for the life of the workspace. */
  id: string;
  schemaVersion: number;
  settings: Settings;
  roles: Role[];
  people: Person[];
  categories: Category[];
  teams: Team[];
  areas: Area[];
  /** Region files imported into this workspace; ids never equal a built-in region id. */
  customRegions: Region[];
  /**
   * The organisation the file maps (#313): the top of the tree organisation → areas → teams. One
   * file is one organisation; without this entry it is shown with its level name.
   */
  organisation?: Organisation;
  /**
   * Where the file was looking when it was saved, so it opens there again (persona concept Q5):
   * the selected team or area, the view and the area page. Unknown values are ignored on open.
   */
  view?: SavedView;
}

export interface Organisation {
  name: string;
}

/**
 * The unit id of the organisation in the selection (the `activeTeamId` store and the saved view).
 * Never a team or area id: the validator rejects it there.
 */
export const ORG_UNIT = '@organisation';

/** The organisation is a choice once there is something to group: an area or two teams. */
export function hasOrgLevel(ws: Workspace): boolean {
  return ws.areas.length > 0 || ws.teams.length >= 2;
}

/** The organisation's name, or the level's name (`fallback`) while it has none. */
export function orgName(ws: Workspace, fallback: string): string {
  return ws.organisation?.name || fallback;
}

export interface SavedView {
  /** Id of the selected team or area, or ORG_UNIT. */
  unit?: string;
  /** The view: calendar, load, meetings, team, templates, settings, exchange or help. */
  page?: string;
  /** The area's page: structure or overview. */
  areaPage?: string;
}

export function emptyWorkspace(today: ISODate): Workspace {
  return {
    schemaVersion: CURRENT_SCHEMA,
    id: randomId(),
    settings: {
      locale: 'en',
      region: 'de-sn',
      timezone: 'Europe/Berlin',
      workdays: [1, 2, 3, 4, 5],
      hoursPerWeek: 40,
      horizon: { from: today, to: addDays(today, 365) },
      skipHolidays: true,
      thresholds: { warnFactor: 1.5, maxFte: 0.6 },
    },
    roles: [],
    people: [],
    categories: [],
    teams: [],
    areas: [],
    customRegions: [],
  };
}

/** The teams a selected unit stands for: all teams, an area's teams, or the team itself. */
export function unitTeamIds(ws: Workspace, unitId: string): string[] {
  if (unitId === ORG_UNIT) return ws.teams.map((t) => t.id);
  return ws.areas.find((a) => a.id === unitId)?.teamIds ?? [unitId];
}

/**
 * The units whose hours a selected unit counts: every unit for the organisation, an area's teams
 * and the area itself (its own meetings), or the team itself. Keys of WeekLoad.byTeamPerson.
 */
export function unitLoadIds(ws: Workspace, unitId: string): string[] {
  if (unitId === ORG_UNIT) return [...ws.teams.map((t) => t.id), ...ws.areas.map((a) => a.id)];
  const area = ws.areas.find((a) => a.id === unitId);
  return area ? [...area.teamIds, area.id] : [unitId];
}

/** The area a team belongs to, if any. */
export function areaOf(ws: Workspace, teamId: string): Area | undefined {
  return ws.areas.find((a) => a.teamIds.includes(teamId));
}

/** A cadence that never starts a period: an area without its own cadence. */
const NO_CADENCE: Cadence = { kind: 'flow', lengthWeeks: 0, start: '0001-01-01' };

/**
 * An area seen as a team, so recurrence, load and cost code can expand and count its meetings.
 * Without a cadence of its own no cadence-day rule matches; areas have no assumptions.
 */
export function areaAsTeam(area: Area): Team {
  return {
    id: area.id,
    name: area.name,
    cadence: area.cadence ?? NO_CADENCE,
    members: area.members,
    memberHours: area.memberHours,
    assumptions: {},
    cycles: area.cycles,
    events: area.events,
  };
}

/** Every unit with meetings: the teams, then the areas seen as teams. */
export function units(ws: Workspace): Team[] {
  return [...ws.teams, ...ws.areas.map(areaAsTeam)];
}

/**
 * The people with a role participant's role in a unit, each once: the unit's members with the
 * role and, for "from every team" in an area, the members with the role in each of its teams.
 * Resolved on every call, so it follows the teams as they change. A person participant: the
 * person, if they still exist.
 */
export function holders(ws: Workspace, unitId: string, p: Participant): string[] {
  if (p.personId !== undefined)
    return ws.people.some((x) => x.id === p.personId) ? [p.personId] : [];
  const area = ws.areas.find((a) => a.id === unitId);
  const own = area ?? ws.teams.find((t) => t.id === unitId);
  const lists = [own?.members ?? []];
  if (area && p.fromTeams)
    for (const t of ws.teams) if (area.teamIds.includes(t.id)) lists.push(t.members);
  const ids = lists.flat().flatMap((m) => (m.roleId === p.roleId ? [m.personId] : []));
  return [...new Set(ids)];
}

/** People the meeting invites by name. */
export function namedPeople(event: CalEvent): Set<string> {
  return new Set(event.participants.flatMap((p) => (p.personId !== undefined ? [p.personId] : [])));
}

/**
 * The people a participant of `event` counts in a unit: its holders, without the people the
 * meeting also invites by name (they count once, on their own row, #285).
 */
export function attendees(
  ws: Workspace,
  unitId: string,
  p: Participant,
  event: CalEvent,
): string[] {
  const ids = holders(ws, unitId, p);
  if (p.personId !== undefined) return ids;
  const named = namedPeople(event);
  return named.size === 0 ? ids : ids.filter((id) => !named.has(id));
}

/** A role participant that nobody holds in the unit: it counts as one person for the cost. */
export function unfilled(ws: Workspace, unitId: string, p: Participant): boolean {
  return p.personId === undefined && holders(ws, unitId, p).length === 0;
}

/** Everyone a meeting counts in a unit, each once. */
export function eventAttendees(ws: Workspace, unitId: string, event: CalEvent): string[] {
  return [...new Set(event.participants.flatMap((p) => attendees(ws, unitId, p, event)))];
}

/** Teams of the area in which nobody holds a role that the meeting invites "from every team". */
export function missingRoles(
  ws: Workspace,
  area: Area,
  event: CalEvent,
): { teamId: string; roleId: string }[] {
  const out: { teamId: string; roleId: string }[] = [];
  for (const p of event.participants) {
    if (p.personId !== undefined || !p.fromTeams) continue;
    for (const t of ws.teams) {
      if (area.teamIds.includes(t.id) && !t.members.some((m) => m.roleId === p.roleId))
        out.push({ teamId: t.id, roleId: p.roleId });
    }
  }
  return out;
}

/**
 * The areas whose own meetings a filter counts: with a person filter the areas where the person
 * attends a meeting, with a team filter the selected area (none for a team), otherwise (also for
 * the organisation) all.
 */
export function areasInScope(
  ws: Workspace,
  filter: { teamId?: string; personId?: string },
): Team[] {
  const { personId, teamId } = filter;
  return ws.areas
    .filter((a) =>
      personId
        ? a.events.some((e) => eventAttendees(ws, a.id, e).includes(personId))
        : teamId === undefined || teamId === ORG_UNIT || a.id === teamId,
    )
    .map(areaAsTeam);
}
