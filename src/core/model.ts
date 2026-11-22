import { randomId } from './id';
import { addDays, type ISODate, type Time } from './date';
import type { LevelNames } from './levels';
import { NO_HOLIDAYS, type Region } from './regions';

export const CURRENT_SCHEMA = 10;
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
}

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
 * invites everyone with the role in every team of the area ("Product Owner from every team"); in
 * the organisation, in every team, and `fromAreas` everyone with the role in every area (#328).
 */
export interface RoleParticipant {
  roleId: string;
  share: number;
  fromTeams?: boolean;
  fromAreas?: boolean;
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
  fromAreas?: undefined;
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
  /**
   * Where the meeting is held (#442): a room for on site, a link for remote; free text, written
   * to the .ics export as LOCATION (and URL when it is a web link). Missing or empty means none.
   */
  place?: string;
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
  /**
   * Area roles a team calls by another name, e.g. a Scrum team's "Developers" for SAFe's "Agile
   * Team" (#338). Meetings that invite a role "from every team" also invite these team roles.
   */
  roleLinks?: RoleLink[];
}

/** In team `teamId`, the people with `teamRoleId` attend where the area invites `roleId`. */
export interface RoleLink {
  teamId: string;
  roleId: string;
  teamRoleId: string;
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

/**
 * The organisation (#313) with, like an area, people with a role at its level and meetings of
 * its own (#328). Every field is optional: a file without them has none. Its hours are extra to
 * team and area time, so a missing entry means 0 hours. See `orgArea` for the area it acts as.
 */
export interface Organisation {
  name?: string;
  members?: { personId: string; roleId: string }[];
  memberHours?: Record<string, number>;
  events?: CalEvent[];
}

/**
 * The unit id of the organisation in the selection (the `activeTeamId` store and the saved view).
 * Never a team or area id: the validator rejects it there.
 */
export const ORG_UNIT = '@organisation';

/**
 * The organisation is a choice once there is something to group (an area or two teams), or while
 * it has people or meetings of its own (#328), so they never become unreachable.
 */
export function hasOrgLevel(ws: Workspace): boolean {
  return ws.areas.length > 0 || ws.teams.length >= 2 || orgHasOwn(ws);
}

/**
 * The name of a team, an area or the organisation, or '' for an unknown id. `org` is the
 * organisation's level word, its name while it has none.
 */
export function unitName(ws: Workspace, id: string | null | undefined, org: string): string {
  if (id === ORG_UNIT) return orgName(ws, org);
  return [...ws.teams, ...ws.areas].find((u) => u.id === id)?.name ?? '';
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
      // Not chosen yet: no meetings drop on holidays, and the setup wizard asks (#508).
      region: NO_HOLIDAYS,
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

/**
 * The organisation seen as an area (#328), so that people, meetings, load and cost code treat it
 * as one more area: its teams are all teams, and it takes the role links of every area, so that
 * "from every team" reaches a team's linked role as in its own area. It has no cadence or cycles.
 */
export function orgArea(ws: Workspace): Area {
  const o = ws.organisation;
  return {
    id: ORG_UNIT,
    name: o?.name ?? '',
    teamIds: ws.teams.map((t) => t.id),
    members: o?.members ?? [],
    memberHours: o?.memberHours ?? {},
    cycles: [],
    events: o?.events ?? [],
    roleLinks: ws.areas.flatMap((a) => a.roleLinks ?? []),
  };
}

/**
 * Writes the people and meetings of an organisation seen as an area (see `orgArea`) back to the
 * workspace, in place. Empty lists are left out, and an organisation without anything is removed,
 * so a file only holds what was set.
 */
export function storeOrg(ws: Workspace, area: Area): void {
  const o: Organisation = {};
  if (ws.organisation?.name) o.name = ws.organisation.name;
  if (area.members.length > 0) o.members = area.members;
  if (Object.keys(area.memberHours).length > 0) o.memberHours = area.memberHours;
  if (area.events.length > 0) o.events = area.events;
  if (Object.keys(o).length > 0) ws.organisation = o;
  else delete ws.organisation;
}

/** The organisation has people or meetings of its own. */
export function orgHasOwn(ws: Workspace): boolean {
  const o = ws.organisation;
  return !!(o?.members?.length || o?.events?.length || Object.keys(o?.memberHours ?? {}).length);
}

/** The areas, then the organisation as an area once it has people or meetings of its own. */
export function areaUnits(ws: Workspace): Area[] {
  return orgHasOwn(ws) ? [...ws.areas, orgArea(ws)] : ws.areas;
}

/** An area by id; ORG_UNIT gives the organisation as an area. */
export function findArea(ws: Workspace, id: string | null | undefined): Area | undefined {
  return id === ORG_UNIT ? orgArea(ws) : ws.areas.find((a) => a.id === id);
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
  if (unitId === ORG_UNIT)
    return [...ws.teams.map((t) => t.id), ...ws.areas.map((a) => a.id), ORG_UNIT];
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

/** Every unit with meetings: the teams, then the areas (and the organisation) seen as teams. */
export function units(ws: Workspace): Team[] {
  return [...ws.teams, ...areaUnits(ws).map(areaAsTeam)];
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
  const area = findArea(ws, unitId);
  const own = area ?? ws.teams.find((t) => t.id === unitId);
  const ids = (own?.members ?? []).flatMap((m) => (m.roleId === p.roleId ? [m.personId] : []));
  if (area && p.fromTeams)
    for (const t of ws.teams) {
      if (!area.teamIds.includes(t.id)) continue;
      const roles = teamRolesFor(area, t.id, p.roleId);
      for (const m of t.members) if (roles.includes(m.roleId)) ids.push(m.personId);
    }
  if (unitId === ORG_UNIT && p.fromAreas)
    for (const a of ws.areas)
      for (const m of a.members) if (m.roleId === p.roleId) ids.push(m.personId);
  return [...new Set(ids)];
}

/** The team roles that stand for an area role in one of its teams: the role and its link. */
export function teamRolesFor(area: Area, teamId: string, roleId: string): string[] {
  const link = area.roleLinks?.find((l) => l.teamId === teamId && l.roleId === roleId);
  return link ? [roleId, link.teamRoleId] : [roleId];
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

/**
 * Whether a participant counts for a role filter: it invites the role, or, "from every team" in
 * an area, a role that a team has linked to `roleId` (#338).
 */
export function invitesRole(
  ws: Workspace,
  unitId: string,
  p: Participant,
  roleId: string,
): boolean {
  if (p.roleId === roleId) return true;
  if (p.personId !== undefined || !p.fromTeams) return false;
  const area = findArea(ws, unitId);
  return !!area?.roleLinks?.some((l) => l.roleId === p.roleId && l.teamRoleId === roleId);
}

/**
 * The roles a role participant's people come with (#338): its own role and, "from every team" in
 * an area, the team roles linked to it. Each is a row of its own in the load by role.
 */
export function participantRoles(ws: Workspace, unitId: string, p: Participant): string[] {
  if (p.personId !== undefined) return [];
  if (!p.fromTeams) return [p.roleId];
  const area = findArea(ws, unitId);
  const linked = (area?.roleLinks ?? []).flatMap((l) =>
    l.roleId === p.roleId && area!.teamIds.includes(l.teamId) ? [l.teamRoleId] : [],
  );
  return [...new Set([p.roleId, ...linked])];
}

/**
 * The attendees of a participant who hold `roleId` where it reaches them (#338): with the
 * participant's own role, or "from every team" with a team role linked to it. So the people of a
 * linked team role count under that team role, never under the area's role.
 */
export function roleAttendees(
  ws: Workspace,
  unitId: string,
  p: Participant,
  event: CalEvent,
  roleId: string,
): string[] {
  if (p.personId !== undefined || !invitesRole(ws, unitId, p, roleId)) return [];
  const area = findArea(ws, unitId);
  const own = area ?? ws.teams.find((t) => t.id === unitId);
  const ids = new Set(
    p.roleId === roleId
      ? [
          ...(own?.members ?? []),
          ...(unitId === ORG_UNIT && p.fromAreas ? ws.areas.flatMap((a) => a.members) : []),
        ].flatMap((m) => (m.roleId === roleId ? [m.personId] : []))
      : [],
  );
  if (area && p.fromTeams)
    for (const t of ws.teams) {
      if (!area.teamIds.includes(t.id) || !teamRolesFor(area, t.id, p.roleId).includes(roleId))
        continue;
      for (const m of t.members) if (m.roleId === roleId) ids.add(m.personId);
    }
  const named = namedPeople(event);
  return [...ids].filter((id) => !named.has(id));
}

/** Heads a participant counts for a role filter; the role itself unfilled counts one person. */
export function roleHeads(
  ws: Workspace,
  unitId: string,
  p: Participant,
  event: CalEvent,
  roleId: string,
): number {
  if (p.roleId === roleId && unfilled(ws, unitId, p)) return 1;
  return roleAttendees(ws, unitId, p, event, roleId).length;
}

/** A role participant that nobody holds in the unit: it counts as one person for the cost. */
export function unfilled(ws: Workspace, unitId: string, p: Participant): boolean {
  return p.personId === undefined && holders(ws, unitId, p).length === 0;
}

/** Everyone a meeting counts in a unit, each once. */
export function eventAttendees(ws: Workspace, unitId: string, event: CalEvent): string[] {
  return [...new Set(event.participants.flatMap((p) => attendees(ws, unitId, p, event)))];
}

/**
 * Teams of the area in which nobody holds a role that the meeting invites "from every team"; in
 * the organisation also areas without a role it invites "from every area" (`teamId` is the area).
 */
export function missingRoles(
  ws: Workspace,
  area: Area,
  event: CalEvent,
): { teamId: string; roleId: string }[] {
  const out: { teamId: string; roleId: string }[] = [];
  for (const p of event.participants) {
    if (p.personId !== undefined) continue;
    if (area.id === ORG_UNIT && p.fromAreas)
      for (const a of ws.areas)
        if (!a.members.some((m) => m.roleId === p.roleId))
          out.push({ teamId: a.id, roleId: p.roleId });
    if (!p.fromTeams) continue;
    for (const t of ws.teams) {
      if (!area.teamIds.includes(t.id)) continue;
      const roles = teamRolesFor(area, t.id, p.roleId);
      if (!t.members.some((m) => roles.includes(m.roleId)))
        out.push({ teamId: t.id, roleId: p.roleId });
    }
  }
  return out;
}

/**
 * The areas whose own meetings a filter counts: with a person filter the areas where the person
 * attends a meeting, with a team filter the selected area (none for a team), otherwise (also for
 * the organisation) all. The organisation counts as an area once it has its own (#328).
 */
export function areasInScope(
  ws: Workspace,
  filter: { teamId?: string; personId?: string },
): Team[] {
  const { personId, teamId } = filter;
  return areaUnits(ws)
    .filter((a) =>
      personId
        ? a.events.some((e) => eventAttendees(ws, a.id, e).includes(personId))
        : teamId === undefined || teamId === ORG_UNIT || a.id === teamId,
    )
    .map(areaAsTeam);
}
