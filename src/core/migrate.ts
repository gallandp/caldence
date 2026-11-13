import { randomId } from './id';
import { CURRENT_SCHEMA } from './model';
import { record } from './record';

/** Migration `n` upgrades a workspace from schema `n` to `n + 1`. */
export const MIGRATIONS: Record<number, (w: unknown) => unknown> = {
  // 1 -> 2: every workspace gets a stable id.
  1: (w) => ({ ...(w as Record<string, unknown>), id: randomId() }),
  // 2 -> 3: imported region files are stored in the workspace.
  2: (w) => ({ ...(w as Record<string, unknown>), customRegions: [] }),
  // 3 -> 4: weekly hours move from the person to each of their teams, split evenly.
  3: (w) => {
    const ws = w as Record<string, unknown>;
    const people = Array.isArray(ws.people) ? (ws.people as Record<string, unknown>[]) : [];
    const teams = Array.isArray(ws.teams) ? (ws.teams as Record<string, unknown>[]) : [];
    const ids = (t: Record<string, unknown>): Set<unknown> =>
      new Set(
        Array.isArray(t.members)
          ? t.members.map((m) => (m as { personId?: unknown }).personId)
          : [],
      );
    const teamCount = new Map<unknown, number>();
    for (const t of teams) for (const id of ids(t)) teamCount.set(id, (teamCount.get(id) ?? 0) + 1);
    const hours = new Map<unknown, unknown>(people.map((p) => [p.id, p.hoursPerWeek]));
    const out: Record<string, unknown> = { ...ws };
    if (Array.isArray(ws.people))
      out.people = people.map((p) => {
        const rest = { ...p };
        delete rest.hoursPerWeek;
        return rest;
      });
    if (Array.isArray(ws.teams))
      out.teams = teams.map((t) => {
        const memberHours = record<number>();
        for (const id of ids(t)) {
          const h = hours.get(id);
          if (typeof id === 'string' && typeof h === 'number')
            memberHours[id] = Math.round((h / teamCount.get(id)!) * 100) / 100;
        }
        return { ...t, memberHours };
      });
    if (ws.team !== null && typeof ws.team === 'object' && !Array.isArray(ws.team))
      out.team = { ...(ws.team as object), memberHours: {} };
    return out;
  },
};

export type MigrateResult =
  { ok: true; value: unknown } | { ok: false; key: 'error.schema.newer' | 'error.schema.unknown' };

export function migrate(input: unknown): MigrateResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, key: 'error.schema.unknown' };
  }
  const version = (input as Record<string, unknown>).schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, key: 'error.schema.unknown' };
  }
  if (version > CURRENT_SCHEMA) return { ok: false, key: 'error.schema.newer' };

  let value: unknown = structuredClone(input);
  for (let v = version; v < CURRENT_SCHEMA; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, key: 'error.schema.unknown' };
    value = step(value);
    (value as Record<string, unknown>).schemaVersion = v + 1;
  }
  return { ok: true, value };
}
