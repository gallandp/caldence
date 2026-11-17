import { areaCosts, unitRow } from './areaCosts';
import { compareCadences } from './areaOverview';
import { capacity } from './load';
import { areaAsTeam, areaOf, type Workspace } from './model';
import type { HolidayIndex } from './regions';

/**
 * What a what-if in present mode changes (persona concept M1). The numbers are those of the
 * selected unit's area (or the team without an area), so a change in one team shows its effect
 * on the whole area: hours in meetings, cost, Terminlast and how many teams are in step.
 */
export interface Effect {
  /** Hours per week of all attendees together, recurring meetings only. */
  hours: number;
  /** Terminlast: hours ÷ weekly hours of the people counted. */
  share: number;
  cost?: { perWeek: number; horizon: number };
  /** Only for an area with a reference cadence. */
  inStep?: { n: number; of: number };
}

/** The scope a what-if is measured in: the unit's area, or the team without one. */
export function effectScope(ws: Workspace, unitId: string): string | undefined {
  if (ws.areas.some((a) => a.id === unitId)) return unitId;
  const team = ws.teams.find((t) => t.id === unitId);
  if (!team) return undefined;
  return areaOf(ws, team.id)?.id ?? team.id;
}

export function whatIfEffect(
  ws: Workspace,
  index: HolidayIndex,
  scopeId: string,
  rate?: number,
): Effect | undefined {
  const area = ws.areas.find((a) => a.id === scopeId);
  if (area) {
    const { total } = areaCosts(ws, index, area, rate);
    const out: Effect = { hours: total.hours, share: total.share };
    if (total.cost) out.cost = total.cost;
    const cmp = compareCadences(ws, area, ws.settings.horizon.from, 1);
    if (cmp.reference && cmp.rows.length > 0)
      out.inStep = { n: cmp.rows.filter((r) => r.inStep).length, of: cmp.rows.length };
    return out;
  }
  const team = ws.teams.find((t) => t.id === scopeId);
  if (!team) return undefined;
  const people = [...new Set(team.members.map((m) => m.personId))];
  const cap = people.reduce((a, p) => a + capacity(ws, p, team.id), 0);
  const row = unitRow(ws, index, team, cap, rate);
  const out: Effect = { hours: row.hours, share: row.share };
  if (row.cost) out.cost = row.cost;
  return out;
}

/**
 * How many things differ from the state when presenting started: each meeting whose duration or
 * rhythm changed, and each team or area whose cadence changed.
 */
export function countChanges(base: Workspace, ws: Workspace): number {
  const before = new Map(
    [...base.teams, ...base.areas.map(areaAsTeam)].map((u) => [u.id, u] as const),
  );
  let n = 0;
  for (const unit of [...ws.teams, ...ws.areas.map(areaAsTeam)]) {
    const old = before.get(unit.id);
    if (!old) continue;
    if (JSON.stringify(old.cadence) !== JSON.stringify(unit.cadence)) n++;
    const events = new Map(old.events.map((e) => [e.id, e] as const));
    for (const e of unit.events) {
      const o = events.get(e.id);
      if (!o) continue;
      if (o.duration !== e.duration || JSON.stringify(o.rule) !== JSON.stringify(e.rule)) n++;
    }
  }
  return n;
}

/**
 * The workspace with people named by number in the order of the people list ("Person 1", ...),
 * for presenting without names (persona concept Q8). `name` makes the label in the UI language.
 */
export function withoutNames(ws: Workspace, name: (n: number) => string): Workspace {
  return { ...ws, people: ws.people.map((p, i) => ({ ...p, name: name(i + 1) })) };
}

/** Puts the real names back, taken from `base` by id. */
export function withNames(ws: Workspace, base: Workspace): Workspace {
  const names = new Map(base.people.map((p) => [p.id, p.name] as const));
  return { ...ws, people: ws.people.map((p) => ({ ...p, name: names.get(p.id) ?? p.name })) };
}
