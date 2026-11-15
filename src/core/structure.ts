import { capacity } from './load';
import type { Area, CalEvent, Workspace } from './model';

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
  /** In the area only because a meeting invites "role X from every team", without area hours. */
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

const hoursOf = (area: Area, personId: string): number =>
  Object.hasOwn(area.memberHours, personId) ? area.memberHours[personId]! : 0;

/**
 * Who a participant of an area meeting reaches: area members with the role and, for "role X from
 * every team", the members with that role in every team of the area. Person ids, each once.
 */
export function reach(ws: Workspace, area: Area, p: CalEvent['participants'][number]): string[] {
  const out = new Set(area.members.filter((m) => m.roleId === p.roleId).map((m) => m.personId));
  if (p.fromTeams)
    for (const team of ws.teams)
      if (area.teamIds.includes(team.id))
        for (const m of team.members) if (m.roleId === p.roleId) out.add(m.personId);
  return [...out];
}

/** Everyone an area meeting invites, and the teams that lack an invited "from every team" role. */
export function meetingReach(
  ws: Workspace,
  area: Area,
  event: CalEvent,
): { personIds: Set<string>; missing: { teamId: string; roleId: string }[] } {
  const ids = new Set(event.participants.flatMap((p) => reach(ws, area, p)));
  const missing: { teamId: string; roleId: string }[] = [];
  for (const p of event.participants) {
    if (!p.fromTeams) continue;
    for (const teamId of area.teamIds) {
      const team = ws.teams.find((t) => t.id === teamId);
      if (team && !team.members.some((m) => m.roleId === p.roleId))
        missing.push({ teamId, roleId: p.roleId });
    }
  }
  return { personIds: ids, missing };
}

/**
 * The structure of an area: who works only in the area, in a team and in the area, or only in a
 * team, with their hours. A team member belongs to the area when they have an area role, area
 * hours, or a meeting of the area invites them as "role X from every team".
 */
export function areaStructure(ws: Workspace, area: Area): Structure {
  const teams = area.teamIds.flatMap((id) => ws.teams.filter((t) => t.id === id));
  const invited = new Set(
    area.events.flatMap((e) =>
      e.participants.filter((p) => p.fromTeams).flatMap((p) => reach(ws, area, p)),
    ),
  );
  const areaMembers = personIds(area.members);
  const inArea = new Set([
    ...areaMembers,
    ...Object.keys(area.memberHours).filter((id) => hoursOf(area, id) > 0),
    ...invited,
  ]);
  const teamPeople = personIds(teams.flatMap((t) => t.members));
  const order = [...areaMembers.filter((id) => !teamPeople.includes(id)), ...teamPeople];
  // A person with hours but no role who is in none of the teams still counts as area-only.
  for (const id of inArea) if (!order.includes(id)) order.push(id);

  const people = order
    .filter((id) => ws.people.some((p) => p.id === id))
    .map((personId): StructurePerson => {
      const own = teams
        .filter((t) => t.members.some((m) => m.personId === personId))
        .map((t) => ({
          teamId: t.id,
          roleIds: t.members.filter((m) => m.personId === personId).map((m) => m.roleId),
          hours: capacity(ws, personId, t.id),
        }));
      const otherHours = ws.teams
        .filter(
          (t) => !area.teamIds.includes(t.id) && t.members.some((m) => m.personId === personId),
        )
        .reduce((sum, t) => sum + capacity(ws, personId, t.id), 0);
      const areaHours = hoursOf(area, personId);
      const areaRoleIds = area.members.filter((m) => m.personId === personId).map((m) => m.roleId);
      const group: Group = own.length === 0 ? 'area' : inArea.has(personId) ? 'both' : 'team';
      return {
        personId,
        group,
        areaRoleIds,
        areaHours,
        teams: own,
        otherHours,
        total: areaHours + own.reduce((s, x) => s + x.hours, 0) + otherHours,
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
