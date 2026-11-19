import { areaHours, capacity } from './load';
import { attendees, type Area, type Workspace } from './model';

/** The three groups of people around an area, named the same in every view. */
export type Group = 'area' | 'both' | 'team';

export interface StructurePerson {
  personId: string;
  group: Group;
  /** Roles the person has at area level (head of area, RTE), in member order. */
  areaRoleIds: string[];
  /** Weekly hours in the area; 0 without an entry. */
  areaHours: number;
  /** The area's teams the person is in, with their roles and weekly hours there. */
  teams: { teamId: string; roleIds: string[]; hours: number }[];
  /** Weekly hours in teams outside this area, summed. */
  otherHours: number;
  /** Area + its teams + other teams. */
  total: number;
  /**
   * In the area only because a meeting invites them, as "role X from every team" or by name,
   * without area hours.
   */
  invitedOnly: boolean;
}

export interface StructureTeam {
  teamId: string;
  /** People in this team and in the area, then people only in this team (person ids). */
  both: string[];
  only: string[];
}

export interface Structure {
  people: StructurePerson[];
  teams: StructureTeam[];
  counts: Record<Group, number>;
  /** All area hours per week (people only in the area and people from the teams). */
  areaHours: number;
}

/** Person ids of a list of members, each once, in member order. */
const personIds = (members: { personId: string }[]): string[] => [
  ...new Set(members.map((m) => m.personId)),
];

const hoursOf = (ws: Workspace, area: Area, personId: string): number =>
  areaHours(ws, area.id, personId);

/**
 * The structure of an area: who works only in the area, in a team and in the area, or only in a
 * team, with their hours. A team member belongs to the area when they have an area role, area
 * hours, or a meeting of the area invites them as "role X from every team" or by name.
 */
export function areaStructure(ws: Workspace, area: Area): Structure {
  const teams = area.teamIds.flatMap((id) => ws.teams.filter((t) => t.id === id));
  const invited = new Set(
    area.events.flatMap((e) =>
      e.participants
        .filter((p) => p.fromTeams || p.fromAreas || p.personId !== undefined)
        .flatMap((p) => attendees(ws, area.id, p, e)),
    ),
  );
  const areaMembers = personIds(area.members);
  const inArea = new Set([
    ...areaMembers,
    ...Object.keys(area.memberHours).filter((id) => hoursOf(ws, area, id) > 0),
    ...invited,
  ]);
  const teamPeople = personIds(teams.flatMap((t) => t.members));
  const inTeams = new Set(teamPeople);
  // Area-only people first; one with hours but no role who is in no team counts as area-only.
  const order = new Set([
    ...areaMembers.filter((id) => !inTeams.has(id)),
    ...teamPeople,
    ...inArea,
  ]);
  const known = new Set(ws.people.map((p) => p.id));
  const own = new Set(area.teamIds);

  const people = [...order]
    .filter((id) => known.has(id))
    .map((personId): StructurePerson => {
      const mine = teams
        .filter((t) => t.members.some((m) => m.personId === personId))
        .map((t) => ({
          teamId: t.id,
          roleIds: t.members.filter((m) => m.personId === personId).map((m) => m.roleId),
          hours: capacity(ws, personId, t.id),
        }));
      const otherHours = ws.teams
        .filter((t) => !own.has(t.id) && t.members.some((m) => m.personId === personId))
        .reduce((sum, t) => sum + capacity(ws, personId, t.id), 0);
      const areaHours = hoursOf(ws, area, personId);
      const areaRoleIds = area.members.filter((m) => m.personId === personId).map((m) => m.roleId);
      const group: Group = mine.length === 0 ? 'area' : inArea.has(personId) ? 'both' : 'team';
      return {
        personId,
        group,
        areaRoleIds,
        areaHours,
        teams: mine,
        otherHours,
        total: areaHours + mine.reduce((s, x) => s + x.hours, 0) + otherHours,
        invitedOnly: areaRoleIds.length === 0 && areaHours === 0 && invited.has(personId),
      };
    });

  const groupOf = new Map(people.map((p) => [p.personId, p.group]));
  return {
    people,
    teams: teams.map((t) => {
      const ids = personIds(t.members).filter((id) => groupOf.has(id));
      return {
        teamId: t.id,
        both: ids.filter((id) => groupOf.get(id) === 'both'),
        only: ids.filter((id) => groupOf.get(id) === 'team'),
      };
    }),
    counts: {
      area: people.filter((p) => p.group === 'area').length,
      both: people.filter((p) => p.group === 'both').length,
      team: people.filter((p) => p.group === 'team').length,
    },
    areaHours: people.reduce((s, p) => s + p.areaHours, 0),
  };
}
