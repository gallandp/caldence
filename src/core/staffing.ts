import { demandRows } from './demand';
import { contractFte, freeFte } from './line';
import {
  areaOf,
  linePeople,
  type Area,
  type Demand,
  type Person,
  type Skill,
  type Team,
  type Workspace,
} from './model';

/**
 * The staffing tab of a line team (#319): the line team's people with what they have free, next
 * to the open demands of the line team's skill family, grouped by platform. Assigning itself is
 * #315's `assign`, made through the staffing dialog (#320).
 */

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The skill family of a line unit: its own, else the nearest parent's. */
export function lineFamily(ws: Workspace, unitId: string): string | undefined {
  const units = ws.lineUnits ?? [];
  // At most three levels (validated); the guard stops a malformed cycle all the same.
  for (let at = units.find((u) => u.id === unitId), n = 0; at && n < 10; n++) {
    if (at.skillFamilyId !== undefined) return at.skillFamilyId;
    const parent = at.parentId;
    at = parent === undefined ? undefined : units.find((u) => u.id === parent);
  }
  return undefined;
}

/** A person's skills in the file's skill order; unknown ids are left out. */
export function personSkills(ws: Workspace, person: Person): Skill[] {
  const own = new Set(person.skillIds ?? []);
  return (ws.skills ?? []).filter((s) => own.has(s.id));
}

export interface BoardPerson {
  person: Person;
  contract: number;
  /** #315's free FTE; below 0 overbooked. */
  free: number;
  /** Teams (products) the person is a member of. */
  products: number;
}

/** The line unit's people, most free FTE first, then by name. */
export function boardPeople(ws: Workspace, unitId: string, locale = 'de'): BoardPerson[] {
  const ids = linePeople(ws, unitId);
  return ws.people
    .filter((p) => ids.has(p.id))
    .map((person) => ({
      person,
      contract: contractFte(ws, person.id),
      free: freeFte(ws, person.id),
      products: ws.teams.filter((t) => t.members.some((m) => m.personId === person.id)).length,
    }))
    .sort((a, b) => b.free - a.free || a.person.name.localeCompare(b.person.name, locale));
}

export interface OpenDemand {
  team: Team;
  demand: Demand;
  committed: number;
  /** Requested minus committed, above 0. */
  open: number;
  who: { personId: string; fte: number }[];
}

export interface PlatformGroup {
  /** Missing for products outside any platform. */
  area: Area | undefined;
  rows: OpenDemand[];
  /** Open FTE of all rows. */
  open: number;
}

/**
 * Open demands grouped by platform, in file order (products without a platform last). Without a
 * query only demands whose skill is in `family`; with a query every product whose name or
 * platform name contains it, whatever the family (other families are reached by searching).
 * Without a family and a query, all open demands.
 */
export function openDemands(
  ws: Workspace,
  { family, query }: { family?: string; query?: string },
): PlatformGroup[] {
  const q = query?.trim().toLocaleLowerCase() ?? '';
  const familyOf = new Map((ws.skills ?? []).map((s) => [s.id, s.familyId]));
  const byArea = new Map<string | undefined, OpenDemand[]>();
  for (const team of ws.teams) {
    if (!team.demands?.length) continue;
    const area = areaOf(ws, team.id);
    if (
      q !== '' &&
      !team.name.toLocaleLowerCase().includes(q) &&
      !(area?.name.toLocaleLowerCase().includes(q) ?? false)
    )
      continue;
    for (const row of demandRows(ws, team)) {
      const open = round2(row.demand.fte - row.committed);
      if (open <= 0) continue;
      if (q === '' && family !== undefined) {
        const skill = row.demand.skillId;
        if (skill === undefined || familyOf.get(skill) !== family) continue;
      }
      const list = byArea.get(area?.id) ?? [];
      list.push({ team, demand: row.demand, committed: row.committed, open, who: row.who });
      byArea.set(area?.id, list);
    }
  }
  const order: (Area | undefined)[] = [...ws.areas, undefined];
  return order.flatMap((area) => {
    const rows = byArea.get(area?.id);
    if (!rows) return [];
    return [{ area, rows, open: round2(rows.reduce((s, r) => s + r.open, 0)) }];
  });
}

/** Whether the person has the demand's skill (a role-only demand matches nobody). */
export const fits = (person: Person, demand: Demand): boolean =>
  demand.skillId !== undefined && (person.skillIds?.includes(demand.skillId) ?? false);
