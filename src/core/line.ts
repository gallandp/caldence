import type { Assignment, Team, Workspace } from './model';
import { record } from './record';
import { validate, type Result } from './validate';

/**
 * Line organisation and staffing (#315). An assignment is a normal team membership: assigning
 * writes the member (person + the demand's role) and their hours, and `syncAssignments` keeps the
 * assignments in line with the members after any edit of a team. Members are the one source of
 * truth for hours; an assignment's FTE follows them.
 */

const fail = <T>(path: string, key: string): Result<T> => ({ ok: false, errors: [{ path, key }] });
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The person's contract share of a full week; missing means a full week. */
export function contractFte(ws: Workspace, personId: string): number {
  return ws.people.find((p) => p.id === personId)?.contractFte ?? 1;
}

/** The person's weekly limit: contract FTE × the Settings weekly hours (#291/#301). */
export function weeklyLimit(ws: Workspace, personId: string): number {
  return contractFte(ws, personId) * ws.settings.hoursPerWeek;
}

const hoursInTeam = (ws: Workspace, team: Team, personId: string): number =>
  Object.hasOwn(team.memberHours, personId)
    ? team.memberHours[personId]!
    : ws.settings.hoursPerWeek;

/**
 * Drops assignments whose team, person or demand is gone or whose member was removed, and sets
 * each remaining FTE from the member's hours in the team. Run after every edit that can touch
 * members, hours, demands or the weekly hours.
 */
export function syncAssignments(ws: Workspace): Workspace {
  if (!ws.assignments) return ws;
  const people = new Set(ws.people.map((p) => p.id));
  const hpw = ws.settings.hoursPerWeek;
  ws.assignments = ws.assignments.flatMap((a) => {
    const team = ws.teams.find((t) => t.id === a.teamId);
    const roleId = team?.demands?.find((d) => d.id === a.demandId)?.roleId;
    if (!team || roleId === undefined || !people.has(a.personId)) return [];
    if (!team.members.some((m) => m.personId === a.personId && m.roleId === roleId)) return [];
    return [{ ...a, fte: round2(hoursInTeam(ws, team, a.personId) / hpw) }];
  });
  return ws;
}

/** Staffs a person on a team's demand; refused when they already have an assignment there. */
export function assign(ws: Workspace, data: Omit<Assignment, 'id'>): Result<[Workspace, string]> {
  const list = ws.assignments ?? [];
  if (list.some((a) => a.personId === data.personId && a.teamId === data.teamId))
    return fail(`assignments.${list.length}`, 'error.assignment.duplicate');
  // A member already has hours in the team; staffing them would overwrite those (one number per
  // person and team), and unassigning would remove a membership it did not add.
  if (ws.teams.find((t) => t.id === data.teamId)?.members.some((m) => m.personId === data.personId))
    return fail(`assignments.${list.length}.personId`, 'error.assignment.member');
  const out = structuredClone(ws);
  const team = out.teams.find((t) => t.id === data.teamId);
  const demand = team?.demands?.find((d) => d.id === data.demandId);
  if (!team || !demand) return fail(`assignments.${list.length}.demandId`, 'error.ref.unknown');
  const taken = new Set(list.map((a) => a.id));
  let n = 1;
  while (taken.has(`as${n}`)) n++;
  const id = `as${n}`;
  team.members.push({ personId: data.personId, roleId: demand.roleId });
  team.memberHours = Object.assign(record<number>(), team.memberHours, {
    [data.personId]: round2(data.fte * out.settings.hoursPerWeek),
  });
  out.assignments = [...(out.assignments ?? []), { ...structuredClone(data), id }];
  syncAssignments(out);
  const v = validate(out);
  return v.ok ? { ok: true, value: [out, id] } : v;
}

/**
 * Ends an assignment: the person leaves the demand's role in the team, and with their last role
 * there also their hours.
 */
export function unassign(ws: Workspace, assignmentId: string): Workspace {
  const out = structuredClone(ws);
  const a = out.assignments?.find((x) => x.id === assignmentId);
  if (!a) return out;
  const team = out.teams.find((t) => t.id === a.teamId);
  const roleId = team?.demands?.find((d) => d.id === a.demandId)?.roleId;
  if (team) {
    team.members = team.members.filter((m) => !(m.personId === a.personId && m.roleId === roleId));
    if (!team.members.some((m) => m.personId === a.personId)) delete team.memberHours[a.personId];
  }
  out.assignments = out.assignments!.filter((x) => x.id !== assignmentId);
  return out;
}

/** The assignment behind a member (person in a role) of a team, if the membership is staffed. */
export function assignmentOf(
  ws: Workspace,
  teamId: string,
  personId: string,
  roleId: string,
): Assignment | undefined {
  const team = ws.teams.find((t) => t.id === teamId);
  return ws.assignments?.find(
    (a) =>
      a.teamId === teamId &&
      a.personId === personId &&
      team?.demands?.find((d) => d.id === a.demandId)?.roleId === roleId,
  );
}

/**
 * Free FTE: the contract minus all of the person's hours in all teams and areas ÷ the weekly
 * hours, whether they come from an assignment or not. A member without an hours entry counts the
 * weekly hours, as everywhere. Below 0 the person is overbooked (shown as "überbucht").
 */
export function freeFte(ws: Workspace, personId: string): number {
  const hpw = ws.settings.hoursPerWeek;
  let used = 0;
  for (const t of ws.teams)
    if (t.members.some((m) => m.personId === personId)) used += hoursInTeam(ws, t, personId);
  for (const a of ws.areas)
    if (Object.hasOwn(a.memberHours, personId)) used += a.memberHours[personId]!;
  return round2(contractFte(ws, personId) - used / hpw);
}

// ---------- deleting line data without orphans ----------

/** Deletes a team's demand and its assignments, with their memberships. */
export function removeDemand(ws: Workspace, teamId: string, demandId: string): Workspace {
  let out = ws;
  for (const a of ws.assignments ?? [])
    if (a.teamId === teamId && a.demandId === demandId) out = unassign(out, a.id);
  out = structuredClone(out);
  const team = out.teams.find((t) => t.id === teamId);
  if (team?.demands) team.demands = team.demands.filter((d) => d.id !== demandId);
  return out;
}

/** Deletes a skill: people lose it, demands keep their role and FTE without it. */
export function removeSkill(ws: Workspace, skillId: string): Workspace {
  const out = structuredClone(ws);
  out.skills = out.skills?.filter((s) => s.id !== skillId);
  for (const p of out.people)
    if (p.skillIds) p.skillIds = p.skillIds.filter((id) => id !== skillId);
  for (const t of out.teams)
    for (const d of t.demands ?? []) if (d.skillId === skillId) delete d.skillId;
  return out;
}

/** Deletes a skill family with its skills; platforms and line units no longer name it. */
export function removeSkillFamily(ws: Workspace, familyId: string): Workspace {
  let out = ws;
  for (const s of ws.skills ?? []) if (s.familyId === familyId) out = removeSkill(out, s.id);
  out = structuredClone(out);
  out.skillFamilies = out.skillFamilies?.filter((f) => f.id !== familyId);
  for (const a of out.areas) if (a.skillFamilyId === familyId) delete a.skillFamilyId;
  for (const u of out.lineUnits ?? []) if (u.skillFamilyId === familyId) delete u.skillFamilyId;
  return out;
}

/** Deletes a company; its people stay, without a company. */
export function removeCompany(ws: Workspace, companyId: string): Workspace {
  const out = structuredClone(ws);
  out.companies = out.companies?.filter((c) => c.id !== companyId);
  for (const p of out.people) if (p.companyId === companyId) delete p.companyId;
  return out;
}

/**
 * Deletes a line unit: its sub-units move up to its parent, its people keep working in their
 * teams without a line unit, and a pseudonymous person (who only exists through a line file)
 * stops being pseudonymous.
 */
export function removeLineUnit(ws: Workspace, unitId: string): Workspace {
  const out = structuredClone(ws);
  const gone = out.lineUnits?.find((u) => u.id === unitId);
  if (!gone) return out;
  out.lineUnits = out.lineUnits!.filter((u) => u.id !== unitId);
  for (const u of out.lineUnits) {
    if (u.parentId !== unitId) continue;
    if (gone.parentId === undefined) delete u.parentId;
    else u.parentId = gone.parentId;
  }
  for (const p of out.people) {
    if (p.lineUnitId !== unitId) continue;
    delete p.lineUnitId;
    delete p.pseudonymous;
  }
  return out;
}

/** What a person's removal also deletes from the line data: assignments and manager entries. */
export function forgetPerson(ws: Workspace, personId: string): void {
  if (ws.assignments) ws.assignments = ws.assignments.filter((a) => a.personId !== personId);
  for (const u of ws.lineUnits ?? []) if (u.managerPersonId === personId) delete u.managerPersonId;
}

/** True when the file holds line data that exports leave out unless asked (#315 data rules). */
export function hasLineData(ws: Workspace): boolean {
  return (
    (ws.skills?.length ?? 0) > 0 ||
    (ws.companies?.length ?? 0) > 0 ||
    ws.people.some((p) => p.contractFte !== undefined || (p.skillIds?.length ?? 0) > 0)
  );
}
