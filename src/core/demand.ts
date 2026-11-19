import { syncAssignments } from './line';
import { occurrenceHours, occurrencesPerWeek } from './load';
import {
  areaAsTeam,
  areaOf,
  teamRolesFor,
  type CalEvent,
  type Demand,
  type Skill,
  type Team,
  type Workspace,
} from './model';
import { effectiveDuration } from './recurrence';
import { validate, type Result } from './validate';

/**
 * A product's demand (#318): what a Product Owner asks the line for (a skill and FTE, or a role
 * only), what is committed, and the Mindestzusage: the smallest commitment per person that leaves
 * them more than the meetings of their role in the product.
 */

const fail = <T>(path: string, key: string): Result<T> => ({ ok: false, errors: [{ path, key }] });

/** Role ids the bundled templates and the example give the people who build the product. */
const BUILDER_ROLES = ['r-dev', 'r-team', 'role-dev'];

/**
 * The role a demand starts with: "development team". That is the builder role of the templates
 * when the file has one, else the role most members of the team hold (no owner role), else the
 * first role that is not an owner role.
 */
export function defaultDemandRole(ws: Workspace, team: Team): string | undefined {
  const known = BUILDER_ROLES.find((id) => ws.roles.some((r) => r.id === id));
  if (known) return known;
  const plain = new Set(ws.roles.filter((r) => !r.owner).map((r) => r.id));
  const count = new Map<string, number>();
  for (const m of team.members)
    if (plain.has(m.roleId)) count.set(m.roleId, (count.get(m.roleId) ?? 0) + 1);
  let best: string | undefined;
  for (const [id, n] of count) if (best === undefined || n > count.get(best)!) best = id;
  return best ?? ws.roles.find((r) => !r.owner)?.id;
}

/** Skills for a demand: the platform's skill family first, all other skills second. */
export function skillChoices(ws: Workspace, teamId: string): { own: Skill[]; other: Skill[] } {
  const family = areaOf(ws, teamId)?.skillFamilyId;
  const byName = (a: Skill, b: Skill) => a.name.localeCompare(b.name);
  const all = [...(ws.skills ?? [])].sort(byName);
  return {
    own: all.filter((s) => family !== undefined && s.familyId === family),
    other: all.filter((s) => family === undefined || s.familyId !== family),
  };
}

export function addDemand(
  ws: Workspace,
  teamId: string,
  data: Omit<Demand, 'id'>,
): Result<[Workspace, string]> {
  const out = structuredClone(ws);
  const team = out.teams.find((t) => t.id === teamId);
  if (!team) return fail(`teams.${teamId}`, 'error.ref.unknown');
  const taken = new Set((team.demands ?? []).map((d) => d.id));
  let n = 1;
  while (taken.has(`d${n}`)) n++;
  const id = `d${n}`;
  const demand: Demand = { id, fte: data.fte, roleId: data.roleId };
  if (data.skillId !== undefined) demand.skillId = data.skillId;
  team.demands = [...(team.demands ?? []), demand];
  const v = validate(out);
  return v.ok ? { ok: true, value: [out, id] } : v;
}

/**
 * Changes a demand's skill, FTE or role. A new role moves the people staffed on it into that
 * role, so their membership and assignment stay one.
 */
export function updateDemand(
  ws: Workspace,
  teamId: string,
  demandId: string,
  patch: Partial<Omit<Demand, 'id'>> & { skillId?: string | undefined },
): Result<Workspace> {
  const out = structuredClone(ws);
  const team = out.teams.find((t) => t.id === teamId);
  const demand = team?.demands?.find((d) => d.id === demandId);
  if (!team || !demand) return fail(`teams.${teamId}.demands`, 'error.ref.unknown');
  if (patch.roleId !== undefined && patch.roleId !== demand.roleId) {
    const from = demand.roleId;
    const to = patch.roleId;
    const staffed = new Set(
      (out.assignments ?? [])
        .filter((a) => a.teamId === teamId && a.demandId === demandId)
        .map((a) => a.personId),
    );
    // Someone staffed who already holds the new role: the assignment would take over a membership
    // it did not add, and ending it would remove that one (as `assign` refuses).
    if (team.members.some((m) => m.roleId === to && staffed.has(m.personId)))
      return fail(`teams.${teamId}.demands`, 'error.demand.roleHeld');
    team.members = team.members.map((m) =>
      m.roleId === from && staffed.has(m.personId) ? { ...m, roleId: to } : m,
    );
    demand.roleId = to;
  }
  if (patch.fte !== undefined) demand.fte = patch.fte;
  if ('skillId' in patch) {
    if (patch.skillId === undefined) delete demand.skillId;
    else demand.skillId = patch.skillId;
  }
  syncAssignments(out);
  const v = validate(out);
  return v.ok ? { ok: true, value: out } : v;
}

export interface DemandRow {
  demand: Demand;
  /** FTE of the people staffed on it. */
  committed: number;
  who: { personId: string; fte: number }[];
}

export function demandRows(ws: Workspace, team: Team): DemandRow[] {
  return (team.demands ?? []).map((demand) => {
    const who = (ws.assignments ?? [])
      .filter((a) => a.teamId === team.id && a.demandId === demand.id)
      .map((a) => ({ personId: a.personId, fte: a.fte }));
    const committed = Math.round(who.reduce((s, x) => s + x.fte, 0) * 100) / 100;
    return { demand, committed, who };
  });
}

/**
 * The team's recurring meetings a role is invited to, with the hours one person in the role spends
 * in each in a typical week: the analytical average Terminlast and the meetings table use
 * (preparation and travel included). One-off meetings and cycle milestones do not recur.
 */
export function roleMeetings(team: Team, roleId: string): { event: CalEvent; hours: number }[] {
  const out: { event: CalEvent; hours: number }[] = [];
  for (const event of team.events) {
    const perWeek = occurrencesPerWeek(event.rule, team);
    if (perWeek === 0) continue;
    const minutes = effectiveDuration(event, team);
    const hours = event.participants
      .filter((p) => p.personId === undefined && p.roleId === roleId)
      .reduce((s, p) => s + perWeek * occurrenceHours(event, minutes, p.share), 0);
    if (hours > 0) out.push({ event, hours });
  }
  return out;
}

export interface ProductMeeting {
  event: CalEvent;
  /** The team itself, or its platform (area) for a meeting that invites the role from every team. */
  unitId: string;
  hours: number;
}

/**
 * The meetings one person in a role attends because of a product (#320): the team's own recurring
 * meetings for the role and the platform's recurring meetings that invite the role "from every
 * team" (directly or through a role link, #338). Hours per typical week, counted as `roleMeetings`.
 */
export function productMeetings(ws: Workspace, team: Team, roleId: string): ProductMeeting[] {
  const out: ProductMeeting[] = roleMeetings(team, roleId).map((m) => ({ ...m, unitId: team.id }));
  const area = areaOf(ws, team.id);
  if (!area) return out;
  const unit = areaAsTeam(area);
  for (const event of area.events) {
    const perWeek = occurrencesPerWeek(event.rule, unit);
    if (perWeek === 0) continue;
    const minutes = effectiveDuration(event, unit);
    const hours = event.participants
      .filter(
        (p) =>
          p.personId === undefined &&
          p.fromTeams &&
          teamRolesFor(area, team.id, p.roleId).includes(roleId),
      )
      .reduce((s, p) => s + perWeek * occurrenceHours(event, minutes, p.share), 0);
    if (hours > 0) out.push({ event, unitId: area.id, hours });
  }
  return out;
}

export interface MinCommitment {
  /** Meeting hours of one person in the role in a typical week. */
  meetingHours: number;
  /** Smallest commitment in FTE, rounded up to 0.1. */
  fte: number;
  /** The same in hours: fte × the Settings weekly hours. */
  hours: number;
}

/**
 * Mindestzusage (#318): the role's meeting hours in the product (its own and its platform's
 * meetings, #320) ÷ the Grenze (share of the weekly hours in meetings), rounded up to 0.1 FTE. Below it, a person spends more than the Grenze of their time
 * in this team in meetings. Undefined when the role has no recurring meetings in the team.
 */
export function minCommitment(
  ws: Workspace,
  team: Team,
  roleId: string,
): MinCommitment | undefined {
  const meetingHours = productMeetings(ws, team, roleId).reduce((s, m) => s + m.hours, 0);
  const { hoursPerWeek } = ws.settings;
  const { maxFte } = ws.settings.thresholds;
  if (meetingHours <= 0 || hoursPerWeek <= 0 || maxFte <= 0) return undefined;
  // The epsilon keeps 0.3 at 0.3 where floating point makes it 0.30000000000000004.
  const fte = Math.ceil((meetingHours / maxFte / hoursPerWeek) * 10 - 1e-9) / 10;
  return { meetingHours, fte, hours: fte * hoursPerWeek };
}
