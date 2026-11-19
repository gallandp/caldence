import { randomId } from './id';
import { addDays, type ISODate, type Time } from './date';
import type { LevelNames } from './levels';
import type { Region } from './regions';

export const CURRENT_SCHEMA = 8;
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
  /**
   * `contextSwitch`: from this many teams a person is in, a context-switch hint shows (#321);
   * missing means 3.
   */
  thresholds: { warnFactor: number; maxFte: number; contextSwitch?: number };
  /** Optional euros per person and hour; without it no costs are shown. */
  hourlyRate?: number;
  /** Names of the two levels; without it Bereich/Team (Area/Team). */
  levelNames?: LevelNames;
  /**
   * Own names of the line levels (#315, #399): company, specialist group and line team. Without it
   * Gesellschaft/Fachgruppe/Linienteam (Company/Specialist group/Line team).
   */
  lineLevelNames?: { group: string; team: string; company?: string };
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
  /** The line team or specialist group the person belongs to (#315). */
  lineUnitId?: string;
  /** Contracted share of a full week, 0.1 to 1.0; missing means 1.0. */
  contractFte?: number;
  skillIds?: string[];
  companyId?: string;
  /**
   * Stands for a real person kept in a line file (#333); always with `lineUnitId`. Otherwise a
   * normal person. There is no personnel number and no free text about a person in the file.
   */
  pseudonymous?: true;
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
  /**
   * Context-switch hints that were overridden on purpose (#321), per person in this team. An
   * entry holds while the person is in exactly `teams` teams and their membership here does not
   * change; otherwise it is dropped (see pruneContextOverrides).
   */
  contextOverrides?: Record<string, ContextOverride>;
  assumptions: Record<string, number>;
  cycles: Cycle[];
  events: CalEvent[];
  /** What the team needs from the line (#315): a skill or only a role, and how much. */
  demands?: Demand[];
  /** Owner set-up of the team (#331); missing means a tandem ('both'). */
  ownerMode?: OwnerMode;
}

/** A team's need, e.g. "Java · 2.0 FTE" in the development team role. */
export interface Demand {
  id: string;
  /** Missing for a role-only demand ("Scrum Master · 0.5"). */
  skillId?: string;
  fte: number;
  roleId: string;
}

/**
 * A person staffed on a team's demand (#315). Mirrored into the team's `members` (person + the
 * demand's role) and `memberHours` (fte × hoursPerWeek), so every existing view keeps working.
 * At most one per person and team. No dates: a what-if is a copy of the file.
 */
export interface Assignment {
  id: string;
  personId: string;
  teamId: string;
  demandId: string;
  fte: number;
  // An overridden context-switch hint lives on the membership (`team.contextOverrides`, #321).
}

/** A node of the line tree (at most three levels); without `parentId` it hangs under the organisation. */
export interface LineUnit {
  id: string;
  name: string;
  /**
   * The unit's level (#399), chosen when it is created. Without it the level is derived as before:
   * a unit with units below it is a group, one without a team.
   */
  kind?: LineKind;
  /** A company unit is the company of #315 for the people below it. */
  companyId?: string;
  parentId?: string;
  managerPersonId?: string;
  skillFamilyId?: string;
}

export interface SkillFamily {
  id: string;
  name: string;
}

export interface Skill {
  id: string;
  name: string;
  familyId: string;
}

/** The level of a line unit (#399); a company only sits at the top, below the organisation. */
export type LineKind = 'company' | 'group' | 'team';

/**
 * An affiliated company of the group: a person attribute, and the company a company line unit
 * stands for (#399).
 */
export interface Company {
  id: string;
  name: string;
}

/** An overridden context-switch hint on one person's membership in a team (#321). */
export interface ContextOverride {
  /** The number of teams the person was in when the hint was overridden. */
  teams: number;
  /** Optional, about the product or the planning, never about the person. */
  reason?: string;
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
  /** The skill family of the platform (#315). */
  skillFamilyId?: string;
  /** Owner set-up of the area (#331); missing means a tandem ('both'). */
  ownerMode?: OwnerMode;
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
  /** Line organisation and staffing (#315, Caldence 2); all optional, no schema bump. */
  lineUnits?: LineUnit[];
  skillFamilies?: SkillFamily[];
  skills?: Skill[];
  companies?: Company[];
  assignments?: Assignment[];
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

// ---------- a line unit as the selection (#316) ----------

/**
 * A selected line unit is `@line:` + its id: line ids have their own space and must not be
 * mistaken for a team or area id.
 */
export const LINE_PREFIX = '@line:';
export const lineSelection = (unitId: string): string => LINE_PREFIX + unitId;
/** The line unit a selection stands for, if it is one. */
export function selectedLineUnit(selection: string | null | undefined): string | undefined {
  return selection?.startsWith(LINE_PREFIX) ? selection.slice(LINE_PREFIX.length) : undefined;
}

/** Per workspace object: line unit id → its people, sub-units included. Workspaces are never
    changed in place, so the same object means the same answer. */
const linePeopleCache = new WeakMap<Workspace, Map<string, Set<string>>>();

/**
 * The whole line below the organisation (#395): the root of the line world, as the organisation
 * is the root of the product world.
 */
export const LINE_ROOT = lineSelection(ORG_UNIT);

/** The line unit and all its sub-units; for the organisation every line unit. */
export function lineSubtree(ws: Workspace, unitId: string): Set<string> {
  const out = new Set<string>([unitId]);
  const units = ws.lineUnits ?? [];
  if (unitId === ORG_UNIT) for (const u of units) out.add(u.id);
  // At most three levels (validated), so a few passes collect the subtree.
  for (let grew = true; grew;) {
    grew = false;
    for (const u of units)
      if (u.parentId !== undefined && out.has(u.parentId) && !out.has(u.id)) {
        out.add(u.id);
        grew = true;
      }
  }
  return out;
}

/** The people of a line unit and its sub-units. */
export function linePeople(ws: Workspace, unitId: string): Set<string> {
  let byUnit = linePeopleCache.get(ws);
  if (!byUnit) linePeopleCache.set(ws, (byUnit = new Map()));
  let set = byUnit.get(unitId);
  if (!set) {
    const units = lineSubtree(ws, unitId);
    set = new Set(
      ws.people.filter((p) => p.lineUnitId && units.has(p.lineUnitId)).map((p) => p.id),
    );
    byUnit.set(unitId, set);
  }
  return set;
}

/** The people a selection is limited to: a line unit's people, else undefined (no limit). */
export function selectionPeople(
  ws: Workspace,
  selection: string | undefined,
): Set<string> | undefined {
  const line = selectedLineUnit(selection);
  return line === undefined ? undefined : linePeople(ws, line);
}

/**
 * The teams a selected unit stands for: all teams, an area's teams, the team itself, or for a
 * line unit the teams its people are members of.
 */
export function unitTeamIds(ws: Workspace, unitId: string): string[] {
  if (unitId === ORG_UNIT) return ws.teams.map((t) => t.id);
  const people = selectionPeople(ws, unitId);
  // Their teams, and the teams whose meetings invite one of them by name (#285).
  if (people)
    return ws.teams
      .filter(
        (t) =>
          t.members.some((m) => people.has(m.personId)) ||
          t.events.some((e) => e.participants.some((p) => p.personId && people.has(p.personId))),
      )
      .map((t) => t.id);
  return ws.areas.find((a) => a.id === unitId)?.teamIds ?? [unitId];
}

/**
 * The units whose hours a selected unit counts: every unit for the organisation, an area's teams
 * and the area itself (its own meetings), or the team itself. Keys of WeekLoad.byTeamPerson.
 */
export function unitLoadIds(ws: Workspace, unitId: string): string[] {
  if (unitId === ORG_UNIT) return [...ws.teams.map((t) => t.id), ...ws.areas.map((a) => a.id)];
  // A line unit: its people's teams and the areas whose meetings they attend.
  if (selectedLineUnit(unitId) !== undefined)
    return [...unitTeamIds(ws, unitId), ...areasInScope(ws, { teamId: unitId }).map((a) => a.id)];
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
  // The same object for the same area, so per-unit caches (occurrences) hit for areas too.
  const known = asTeam.get(area);
  if (
    known &&
    known.name === area.name &&
    known.cadence === (area.cadence ?? NO_CADENCE) &&
    known.members === area.members &&
    known.memberHours === area.memberHours &&
    known.cycles === area.cycles &&
    known.events === area.events
  )
    return known;
  const team: Team = {
    id: area.id,
    name: area.name,
    cadence: area.cadence ?? NO_CADENCE,
    members: area.members,
    memberHours: area.memberHours,
    assumptions: {},
    cycles: area.cycles,
    events: area.events,
  };
  asTeam.set(area, team);
  return team;
}
const asTeam = new WeakMap<Area, Team>();

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
  // Views ask this thousands of times per update (#315 budget): a role's holders are kept per
  // member list, checked against the lists' identity and length and the area's role links
  // (#338), so a replaced or grown list or a changed link is read again.
  const unitKey = `${unitId}\u0000${p.fromTeams ? 1 : 0}`;
  const area = ws.areas.find((a) => a.id === unitId);
  const own = area ?? ws.teams.find((t) => t.id === unitId);
  const lists = [own?.members ?? []];
  const teamIds: string[] = [];
  if (area && p.fromTeams)
    for (const t of ws.teams)
      if (area.teamIds.includes(t.id)) {
        lists.push(t.members);
        teamIds.push(t.id);
      }
  const links = area?.roleLinks;
  const known = roleHolderCache.get(lists[0]!)?.get(`${unitKey}\u0000${p.roleId}`);
  if (
    known &&
    known.links === links &&
    known.lists.length === lists.length &&
    known.lists.every((l, i) => l === lists[i] && l.length === known.lengths[i])
  )
    return known.ids;
  const all = lists[0]!.flatMap((m) => (m.roleId === p.roleId ? [m.personId] : []));
  teamIds.forEach((teamId, i) => {
    const roles = teamRolesFor(area!, teamId, p.roleId);
    for (const m of lists[i + 1]!) if (roles.includes(m.roleId)) all.push(m.personId);
  });
  const ids = [...new Set(all)];
  let byRole = roleHolderCache.get(lists[0]!);
  if (!byRole) roleHolderCache.set(lists[0]!, (byRole = new Map()));
  byRole.set(`${unitKey}\u0000${p.roleId}`, {
    lists,
    lengths: lists.map((l) => l.length),
    links,
    ids,
  });
  return ids;
}
type Members = Team['members'];
const roleHolderCache = new WeakMap<
  Members,
  Map<string, { lists: Members[]; lengths: number[]; links: Area['roleLinks']; ids: string[] }>
>();

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
  const area = ws.areas.find((a) => a.id === unitId);
  return !!area?.roleLinks?.some((l) => l.roleId === p.roleId && l.teamRoleId === roleId);
}

/**
 * The roles a role participant's people come with (#338): its own role and, "from every team" in
 * an area, the team roles linked to it. Each is a row of its own in the load by role.
 */
export function participantRoles(ws: Workspace, unitId: string, p: Participant): string[] {
  if (p.personId !== undefined) return [];
  if (!p.fromTeams) return [p.roleId];
  const area = ws.areas.find((a) => a.id === unitId);
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
  const area = ws.areas.find((a) => a.id === unitId);
  const own = area ?? ws.teams.find((t) => t.id === unitId);
  const ids = new Set(
    p.roleId === roleId
      ? (own?.members ?? []).flatMap((m) => (m.roleId === roleId ? [m.personId] : []))
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
 * the organisation) all.
 */
export function areasInScope(
  ws: Workspace,
  filter: { teamId?: string; personId?: string },
): Team[] {
  const { personId, teamId } = filter;
  const people = personId ? undefined : selectionPeople(ws, teamId);
  return ws.areas
    .filter((a) =>
      personId
        ? a.events.some((e) => eventAttendees(ws, a.id, e).includes(personId))
        : people
          ? a.members.some((m) => people.has(m.personId)) ||
            a.events.some((e) => eventAttendees(ws, a.id, e).some((id) => people.has(id)))
          : teamId === undefined || teamId === ORG_UNIT || a.id === teamId,
    )
    .map(areaAsTeam);
}
