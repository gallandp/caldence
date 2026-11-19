import { contextHint, type ContextHint } from './contextSwitch';
import { contractFte, freeFte } from './line';
import { capacity, warnings, type WeekLoad } from './load';
import {
  ORG_UNIT,
  linePeople,
  lineSubtree,
  type LineKind,
  type LineUnit,
  type Person,
  type Workspace,
} from './model';

/**
 * The line team page (#316): a line unit's staff with their contract, what they are committed to
 * and what is free, and the hints about them. Every figure here is one that other views show
 * too: free FTE is #315's, "über Grenze" is the Load view's (all meetings ÷ all hours), and the
 * context switch is #321's.
 */

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A team or area a person works in, with their share of the week and their meetings there. */
export interface Commitment {
  unitId: string;
  name: string;
  area: boolean;
  /** Weekly hours there (their entry, or the Settings weekly hours in a team without one). */
  hours: number;
  /** hours ÷ the Settings weekly hours. */
  fte: number;
  /** Average meeting hours per week there over the horizon. */
  meetings: number;
}

export interface StaffRow {
  person: Person;
  contract: number;
  commitments: Commitment[];
  /** Average meeting hours a week over all teams and areas: the Load view's figure. */
  meetings: number;
  /** Contract minus all hours ÷ weekly hours; below 0 overbooked. */
  free: number;
  /** Over the Load view's limit in some week: all meetings ÷ all hours above the limit. */
  overLimit: boolean;
  /** #321, only while it is not overridden. */
  context: ContextHint | null;
}

/** People over the limit in some week, as the Load view judges them. */
export function overLimitPeople(weeks: WeekLoad[], ws: Workspace): Set<string> {
  return new Set(
    warnings(weeks, ws)
      .filter((w) => w.kind === 'above-fte')
      .map((w) => w.personId),
  );
}

/** The person's teams and areas with hours and average meeting hours. */
export function commitments(ws: Workspace, personId: string, weeks: WeekLoad[]): Commitment[] {
  const hpw = ws.settings.hoursPerWeek;
  const avg = (id: string) =>
    weeks.length > 0
      ? weeks.reduce((sum, w) => sum + (w.byTeamPerson[id]?.[personId] ?? 0), 0) / weeks.length
      : 0;
  const out: Commitment[] = [];
  for (const t of ws.teams) {
    if (!t.members.some((m) => m.personId === personId)) continue;
    const hours = capacity(ws, personId, t.id);
    out.push({
      unitId: t.id,
      name: t.name,
      area: false,
      hours,
      fte: round2(hours / hpw),
      meetings: avg(t.id),
    });
  }
  for (const a of ws.areas) {
    const hours = Object.hasOwn(a.memberHours, personId) ? a.memberHours[personId]! : 0;
    // An area counts with its hours, or without when the person attends its meetings (#307).
    if (hours <= 0 && avg(a.id) <= 0) continue;
    out.push({
      unitId: a.id,
      name: a.name,
      area: true,
      hours,
      fte: round2(hours / hpw),
      meetings: avg(a.id),
    });
  }
  return out;
}

/** One row per person of the line unit and its sub-units, in people order. */
export function staffRows(
  ws: Workspace,
  unitId: string,
  weeks: WeekLoad[],
  over: Set<string> = overLimitPeople(weeks, ws),
): StaffRow[] {
  const ids = linePeople(ws, unitId);
  return ws.people
    .filter((p) => ids.has(p.id))
    .map((person) => {
      const hint = contextHint(ws, person.id);
      return {
        person,
        contract: contractFte(ws, person.id),
        commitments: commitments(ws, person.id, weeks),
        meetings:
          weeks.length > 0
            ? weeks.reduce((sum, w) => sum + (w.byPerson[person.id] ?? 0), 0) / weeks.length
            : 0,
        free: freeFte(ws, person.id),
        overLimit: over.has(person.id),
        context: hint && !hint.overriddenIn ? hint : null,
      };
    });
}

/** A person needs a look: overbooked, over the limit or switching between too many teams. */
export const hasHint = (r: StaffRow): boolean => r.free < 0 || r.overLimit || r.context !== null;

export interface UnitStats {
  people: number;
  contract: number;
  /** Hours in all teams and areas ÷ weekly hours, summed. */
  committed: number;
  /** Contract minus committed, summed: overbooked people count negative. */
  free: number;
  hinted: number;
}

export function unitStats(rows: StaffRow[]): UnitStats {
  let contract = 0;
  let free = 0;
  let hinted = 0;
  for (const r of rows) {
    contract += r.contract;
    free += r.free;
    if (hasHint(r)) hinted++;
  }
  return {
    people: rows.length,
    contract: round2(contract),
    committed: round2(contract - free),
    free: round2(free),
    hinted,
  };
}

/** The direct sub-units of a line unit, or the top units for none. */
export function childUnits(ws: Workspace, parentId?: string): LineUnit[] {
  // The organisation is the root of the line (#395): its children are the top units.
  if (parentId === ORG_UNIT) parentId = undefined;
  return (ws.lineUnits ?? []).filter((u) => u.parentId === parentId);
}

/** A line unit with sub-units is a group (Fachgruppe); one without is a line team. */
export const isLineGroup = (ws: Workspace, unitId: string): boolean =>
  (ws.lineUnits ?? []).some((u) => u.parentId === unitId);

/**
 * The level of a line unit (#399): the one chosen for it, else derived as before (a unit with
 * units below it is a group, one without a team).
 */
export function lineKind(ws: Workspace, unitId: string): LineKind | 'org' {
  if (unitId === ORG_UNIT) return 'org';
  const unit = ws.lineUnits?.find((u) => u.id === unitId);
  return unit?.kind ?? (isLineGroup(ws, unitId) ? 'group' : 'team');
}

/**
 * A person's company: the one set on the person, else the company of the nearest company unit
 * above their line unit (#399).
 */
export function personCompanyId(ws: Workspace, person: Person): string | undefined {
  if (person.companyId !== undefined) return person.companyId;
  const units = ws.lineUnits ?? [];
  for (let id = person.lineUnitId, steps = 0; id !== undefined && steps < 10; steps++) {
    const unit = units.find((u) => u.id === id);
    if (unit?.kind === 'company' && unit.companyId) return unit.companyId;
    id = unit?.parentId;
  }
  return undefined;
}

/** The line units in tree order (parents before their children), with their depth from 0. */
export function lineTree(ws: Workspace): { unit: LineUnit; depth: number }[] {
  const out: { unit: LineUnit; depth: number }[] = [];
  const walk = (parentId: string | undefined, depth: number) => {
    for (const u of childUnits(ws, parentId)) {
      out.push({ unit: u, depth });
      walk(u.id, depth + 1);
    }
  };
  walk(undefined, 0);
  return out;
}

/** Units a unit may move under: not itself or its subtree, and the result stays three levels. */
export function parentChoices(
  ws: Workspace,
  unitId: string | undefined,
  maxLevels = 3,
): LineUnit[] {
  const own = unitId === undefined ? new Set<string>() : lineSubtree(ws, unitId);
  const depthOf = (id: string | undefined): number => {
    let d = 0;
    for (let at = id; at !== undefined; at = ws.lineUnits?.find((u) => u.id === at)?.parentId) d++;
    return d;
  };
  /** Levels below and including the unit. */
  const height = (id: string): number =>
    1 + Math.max(0, ...childUnits(ws, id).map((c) => height(c.id)));
  const needs = unitId === undefined ? 1 : height(unitId);
  // A unit chosen as line team takes no units below it (#399).
  return (ws.lineUnits ?? []).filter(
    (u) => u.kind !== 'team' && !own.has(u.id) && depthOf(u.id) + needs <= maxLevels,
  );
}

/**
 * The line units that supply a product or area (#397): the line units of its members, in the
 * order of the line, each once.
 */
export function supplyingUnits(ws: Workspace, unitId: string): LineUnit[] {
  const unit = [...ws.teams, ...ws.areas].find((u) => u.id === unitId);
  if (!unit) return [];
  const ids = new Set(
    unit.members.map((m) => ws.people.find((p) => p.id === m.personId)?.lineUnitId),
  );
  return (ws.lineUnits ?? []).filter((u) => ids.has(u.id));
}
