import { freeFte } from './line';
import {
  ORG_UNIT,
  lineRootName,
  selectedLineUnit,
  lineSubtree,
  type Area,
  type LineUnit,
  type Person,
  type Team,
  type Workspace,
} from './model';

/**
 * The matrix (#396): line teams as rows, products as columns, and in each cell the FTE the line
 * team's people work in the product. A cell is a normal team membership (its hours ÷ the Settings
 * weekly hours), whether an assignment staffed it or not, so the matrix agrees with every other
 * view. "Frei" is #315's free FTE; "Offener Bedarf" is what the product's demands (#318) still ask.
 *
 * The current world's selection filters its own axis: in the product world the columns (and only
 * the line teams with people there), in the line world the rows (all products stay; the ones the
 * rows do not work in are dimmed).
 */

export type MatrixWorld = 'product' | 'line';

/** The world a selection belongs to until the world switch (#393) says it: a line unit is the line. */
export const matrixWorld = (selection: string | undefined): MatrixWorld =>
  selectedLineUnit(selection) !== undefined ? 'line' : 'product';

export interface MatrixColumn {
  team: Team;
  area: Area | undefined;
  /** FTE the product's demands still ask for; undefined when it asks for nobody. */
  open: number | undefined;
  /** Line world: none of the rows works here. */
  dim: boolean;
}

export interface MatrixGroup {
  /** Undefined for the products in no platform. */
  area: Area | undefined;
  columns: MatrixColumn[];
}

export interface MatrixPerson {
  person: Person;
  /** Product id → FTE; products without hours are left out. */
  cells: Record<string, number>;
  /** Contract minus all hours ÷ weekly hours; below 0 overbooked. */
  free: number;
}

export interface MatrixRow {
  unit: LineUnit;
  /** The unit the line team hangs under, if any. */
  group: LineUnit | undefined;
  /** The units above the line team, top-down (#408): with own levels the line can be deep. */
  path: LineUnit[];
  /** Product id → the sum of the shown people's FTE. */
  cells: Record<string, number>;
  /** The sum of the shown people's free FTE. */
  free: number;
  people: MatrixPerson[];
}

/** The members of the shown products without a line unit (product world only). */
export interface MatrixNoLine {
  cells: Record<string, number>;
  people: MatrixPerson[];
}

export interface Matrix {
  world: MatrixWorld;
  groups: MatrixGroup[];
  /** The columns of all groups in order. */
  columns: MatrixColumn[];
  rows: MatrixRow[];
  noLine: MatrixNoLine | undefined;
  /** Some shown product asks the line for people: show the row "Offener Bedarf". */
  hasDemand: boolean;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** FTE a demand list still asks for: each demand counted at most up to what it asks. */
function openDemand(ws: Workspace, team: Team): number | undefined {
  if (!team.demands?.length) return undefined;
  let open = 0;
  for (const d of team.demands) {
    let committed = 0;
    for (const a of ws.assignments ?? [])
      if (a.teamId === team.id && a.demandId === d.id) committed += a.fte;
    open += Math.max(0, d.fte - committed);
  }
  return round2(open);
}

/** The products a product-world selection shows: all, a platform's, or the one product. */
function shownTeams(ws: Workspace, selection: string, world: MatrixWorld): Team[] {
  if (world === 'line' || selection === ORG_UNIT) return ws.teams;
  const area = ws.areas.find((a) => a.id === selection);
  if (area) return ws.teams.filter((t) => area.teamIds.includes(t.id));
  return ws.teams.filter((t) => t.id === selection);
}

/** Line units depth-first in file order, so a group's teams follow it. */
function treeOrder(units: LineUnit[]): LineUnit[] {
  const out: LineUnit[] = [];
  const known = new Set(units.map((u) => u.id));
  const visit = (parent: string | undefined) => {
    for (const u of units)
      if ((u.parentId !== undefined && known.has(u.parentId) ? u.parentId : undefined) === parent) {
        out.push(u);
        visit(u.id);
      }
  };
  visit(undefined);
  return out;
}

export function buildMatrix(
  ws: Workspace,
  selection: string,
  world: MatrixWorld,
  /** The name of the line's root, for the people who sit directly there. */
  rootName = lineRootName(ws, ''),
): Matrix {
  const hpw = ws.settings.hoursPerWeek;
  const teams = shownTeams(ws, selection, world);
  const teamIds = new Set(teams.map((t) => t.id));

  // Person → product → FTE, in one pass over the shown products' members.
  const work = new Map<string, Record<string, number>>();
  for (const t of teams) {
    const seen = new Set<string>();
    for (const m of t.members) {
      if (seen.has(m.personId)) continue;
      seen.add(m.personId);
      const hours = Object.hasOwn(t.memberHours, m.personId) ? t.memberHours[m.personId]! : hpw;
      // A membership without hours commits nothing: no cell, and no reason to show the row.
      if (hours <= 0 || hpw <= 0) continue;
      let cells = work.get(m.personId);
      if (!cells) work.set(m.personId, (cells = {}));
      cells[t.id] = round2(hours / hpw);
    }
  }

  const units = ws.lineUnits ?? [];
  // The line's root holds the people who sit directly there (the managing director).
  const root: LineUnit = { id: ORG_UNIT, name: rootName };
  const unitById = new Map([...units, root].map((u) => [u.id, u]));
  const lineUnit = selectedLineUnit(selection);
  // The whole line (the organisation, or its line root `lineSelection(ORG_UNIT)`) has no limit.
  const inScope =
    world === 'line' && lineUnit !== undefined && lineUnit !== ORG_UNIT
      ? lineSubtree(ws, lineUnit)
      : undefined;
  // The product world narrows to the people who work in the shown products, unless it shows all.
  const narrow = world === 'product' && selection !== ORG_UNIT;

  const byUnit = new Map<string, Person[]>();
  const loose: Person[] = [];
  for (const p of ws.people) {
    const unit = p.lineUnitId !== undefined ? unitById.get(p.lineUnitId) : undefined;
    if (!unit) {
      if (world === 'product' && work.has(p.id)) loose.push(p);
      continue;
    }
    if (inScope && !inScope.has(unit.id)) continue;
    if (narrow && !work.has(p.id)) continue;
    let list = byUnit.get(unit.id);
    if (!list) byUnit.set(unit.id, (list = []));
    list.push(p);
  }

  const personRow = (person: Person): MatrixPerson => ({
    person,
    cells: work.get(person.id) ?? {},
    free: freeFte(ws, person.id),
  });
  const sum = (people: MatrixPerson[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const p of people)
      for (const [id, fte] of Object.entries(p.cells)) out[id] = round2((out[id] ?? 0) + fte);
    return out;
  };

  const pathOf = (unit: LineUnit): LineUnit[] => {
    const out: LineUnit[] = [];
    let at = unit.parentId !== undefined ? unitById.get(unit.parentId) : undefined;
    // The validator rules out cycles; the bound only guards a broken file.
    while (at && out.length < units.length) {
      out.unshift(at);
      at = at.parentId !== undefined ? unitById.get(at.parentId) : undefined;
    }
    return out;
  };
  const rows: MatrixRow[] = [];
  for (const unit of [root, ...treeOrder(units)]) {
    const list = byUnit.get(unit.id);
    if (!list) continue;
    // In the product world a line team shows only when someone of it works in a shown product.
    if (world === 'product' && !list.some((p) => work.has(p.id))) continue;
    const people = list.map(personRow);
    rows.push({
      unit,
      group: unit.parentId !== undefined ? unitById.get(unit.parentId) : undefined,
      path: pathOf(unit),
      cells: sum(people),
      free: round2(people.reduce((s, p) => s + p.free, 0)),
      people,
    });
  }

  const used = new Set(rows.flatMap((r) => Object.keys(r.cells)));
  const column = (team: Team, area: Area | undefined): MatrixColumn => ({
    team,
    area,
    open: openDemand(ws, team),
    dim: world === 'line' && !used.has(team.id),
  });
  const groups: MatrixGroup[] = [];
  const grouped = new Set<string>();
  for (const area of ws.areas) {
    const cols = ws.teams
      .filter((t) => area.teamIds.includes(t.id) && teamIds.has(t.id))
      .map((t) => column(t, area));
    for (const c of cols) grouped.add(c.team.id);
    if (cols.length > 0) groups.push({ area, columns: cols });
  }
  const rest = teams.filter((t) => !grouped.has(t.id)).map((t) => column(t, undefined));
  if (rest.length > 0) groups.push({ area: undefined, columns: rest });
  const columns = groups.flatMap((g) => g.columns);

  let noLine: MatrixNoLine | undefined;
  if (loose.length > 0) {
    const people = loose.map(personRow);
    noLine = { cells: sum(people), people };
  }

  return {
    world,
    groups,
    columns,
    rows,
    noLine,
    hasDemand: columns.some((c) => c.open !== undefined),
  };
}

export interface CellPerson {
  personId: string;
  name: string;
  fte: number;
  /** The skill of the demand their assignment staffs, if any. */
  skill: string | undefined;
}

/** Who is behind a cell: the row's people working in the product, largest share first. */
export function cellPeople(
  ws: Workspace,
  row: { people: MatrixPerson[] },
  teamId: string,
): CellPerson[] {
  const team = ws.teams.find((t) => t.id === teamId);
  const skillOf = (personId: string) => {
    const a = ws.assignments?.find((x) => x.teamId === teamId && x.personId === personId);
    const skillId = team?.demands?.find((d) => d.id === a?.demandId)?.skillId;
    return ws.skills?.find((s) => s.id === skillId)?.name;
  };
  return row.people
    .filter((p) => p.cells[teamId] !== undefined)
    .map((p) => ({
      personId: p.person.id,
      name: p.person.name,
      fte: p.cells[teamId]!,
      skill: skillOf(p.person.id),
    }))
    .sort((a, b) => b.fte - a.fte);
}
