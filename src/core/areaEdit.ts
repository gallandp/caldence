import { ORG_UNIT, orgArea, storeOrg, type Area, type RoleLink, type Workspace } from './model';
import { record } from './record';
import { validate, type Result } from './validate';

const unknown = <T>(areaId: string): Result<T> => ({
  ok: false,
  errors: [{ path: `areas.${areaId}`, key: 'error.ref.unknown' }],
});

/** A copy of the workspace with one area changed; refuses an unknown area or an invalid result. */
function mapArea(ws: Workspace, areaId: string, fn: (a: Area) => void): Result<Workspace> {
  if (areaId === ORG_UNIT) {
    // The organisation's people are edited as an area's (#328).
    const out = structuredClone(ws);
    const org = orgArea(out);
    fn(org);
    storeOrg(out, org);
    return validate(out);
  }
  if (!ws.areas.some((a) => a.id === areaId)) return unknown(areaId);
  const out = structuredClone(ws);
  for (const a of out.areas) if (a.id === areaId) fn(a);
  return validate(out);
}

function withHours(a: Area, personId: string, hours: number | null): void {
  const next = Object.assign(record<number>(), a.memberHours);
  if (hours === null) delete next[personId];
  else next[personId] = hours;
  a.memberHours = next;
}

/**
 * Gives a person one role at area level (replacing the roles they had there), or none with
 * `roleId` null. Their area hours stay.
 */
export function setAreaRole(
  ws: Workspace,
  areaId: string,
  personId: string,
  roleId: string | null,
): Result<Workspace> {
  return mapArea(ws, areaId, (a) => {
    const at = a.members.findIndex((m) => m.personId === personId);
    const rest = a.members.filter((m) => m.personId !== personId);
    if (roleId !== null) rest.splice(at < 0 ? rest.length : at, 0, { personId, roleId });
    a.members = rest;
  });
}

/** Sets a person's weekly hours in the area. */
export function setAreaHours(
  ws: Workspace,
  areaId: string,
  personId: string,
  hours: number,
): Result<Workspace> {
  return mapArea(ws, areaId, (a) => withHours(a, personId, hours));
}

/**
 * Adds a person to the area with a role and, if given, weekly hours. A person who is already
 * there keeps their other roles, and their hours when `hours` is null.
 */
export function addAreaPerson(
  ws: Workspace,
  areaId: string,
  personId: string,
  roleId: string,
  hours: number | null,
): Result<Workspace> {
  return mapArea(ws, areaId, (a) => {
    if (!a.members.some((m) => m.personId === personId && m.roleId === roleId))
      a.members = [...a.members, { personId, roleId }];
    if (hours !== null) withHours(a, personId, hours);
  });
}

/** Removes a person's area roles and area hours; their teams stay as they are. */
export function removeFromArea(ws: Workspace, areaId: string, personId: string): Result<Workspace> {
  return mapArea(ws, areaId, (a) => {
    a.members = a.members.filter((m) => m.personId !== personId);
    withHours(a, personId, null);
  });
}

/** The roles a team stands for: those its members hold and those its own meetings invite. */
export function teamRoleIds(ws: Workspace, teamId: string): string[] {
  const team = ws.teams.find((t) => t.id === teamId);
  if (!team) return [];
  const used = new Set([
    ...team.members.map((m) => m.roleId),
    ...team.events.flatMap((e) => e.participants.flatMap((p) => p.roleId ?? [])),
  ]);
  return ws.roles.flatMap((r) => (used.has(r.id) ? [r.id] : []));
}

/**
 * The roles the area invites "from every team" that a team does not have, in meeting order,
 * e.g. SAFe's "Agile Team" in a Scrum team (#338). Each can be linked to one of the team's roles.
 */
export function unmatchedRoles(ws: Workspace, area: Area, teamId: string): string[] {
  const own = new Set(teamRoleIds(ws, teamId));
  const invited = area.events.flatMap((e) =>
    e.participants.flatMap((p) => (p.fromTeams && p.roleId !== undefined ? [p.roleId] : [])),
  );
  return [...new Set(invited)].filter((id) => !own.has(id));
}

/**
 * Whether a "No X in team" note can offer the role mapping (#362, #433): a saved meeting of the
 * area invites X from every team, the team does not have X, and it has roles to choose from. The
 * organisation takes its teams' links from their areas; it keeps none of its own (#328).
 */
export function canLinkRole(ws: Workspace, area: Area, teamId: string, roleId: string): boolean {
  return (
    area.id !== ORG_UNIT &&
    teamRoleIds(ws, teamId).length > 0 &&
    unmatchedRoles(ws, area, teamId).includes(roleId)
  );
}

const words = (name: string) =>
  name
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== '');
const key = (name: string) => words(name).join(' ');
/** The parts of a combined role name, e.g. "Scrum Master" and "Team Coach". */
const parts = (name: string) => name.split('/').map(key);

/**
 * Whether two role names are alike (#362): one is a "/" part of the other ("Scrum Master" in
 * "Scrum Master/Team Coach"), or all words of the shorter one, at least two, appear in the
 * longer one ("Delivery Manager" in "Service Delivery Manager"). A single generic word such as
 * "Team" or "Engineer" is never enough.
 */
function alike(a: string, b: string): boolean {
  if (parts(a).includes(key(b)) || parts(b).includes(key(a))) return true;
  const [short, long] = [words(a), words(b)].sort((x, y) => x.length - y.length) as [
    string[],
    string[],
  ];
  return short.length >= 2 && short.every((w) => long.includes(w));
}

/**
 * The team role that obviously stands for an area role (#362): the one with the same name
 * (ignoring case, spaces and punctuation), otherwise the only one whose name is alike.
 * Nothing when no role or several roles match; the coach still confirms.
 */
export function matchingRole(
  name: string,
  candidates: readonly { id: string; name: string }[],
): string | undefined {
  if (key(name) === '') return undefined;
  const same = candidates.filter((c) => key(c.name) === key(name));
  if (same.length > 0) return same.length === 1 ? same[0]!.id : undefined;
  const partial = candidates.filter((c) => key(c.name) !== '' && alike(name, c.name));
  return partial.length === 1 ? partial[0]!.id : undefined;
}

/** Replaces the area's role links (#338); an empty list removes them. */
export function setRoleLinks(ws: Workspace, areaId: string, links: RoleLink[]): Result<Workspace> {
  return mapArea(ws, areaId, (a) => {
    if (links.length > 0) a.roleLinks = structuredClone(links);
    else delete a.roleLinks;
  });
}
