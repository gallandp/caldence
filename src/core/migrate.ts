import { randomId } from './id';
import { CURRENT_SCHEMA, FORMAT2_SCHEMA_BASE } from './model';
import { record } from './record';
import { isBuiltinRegion } from './regions';

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
    return out;
  },
  // 4 -> 5: teams can be grouped into areas; existing files have none.
  4: (w) => ({ ...(w as Record<string, unknown>), areas: [] }),
  // 5 -> 6: meetings can invite people by name (#285); existing files only have roles, so
  // nothing changes but the version, which keeps older apps from misreading new files.
  5: (w) => w,
  // 6 -> 7: meetings can take place on site with a travel time (#309); existing meetings are
  // remote, so only the version changes, which keeps older apps from ignoring travel time.
  6: (w) => w,
};

export type MigrateResult =
  | { ok: true; value: unknown }
  | { ok: false; key: 'error.schema.newer' | 'error.schema.unknown' | 'error.schema.v2' };

export function migrate(input: unknown): MigrateResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, key: 'error.schema.unknown' };
  }
  const raw = (input as Record<string, unknown>).schemaVersion;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return { ok: false, key: 'error.schema.unknown' };
  }
  // Caldence 2 (#344): a format 2 file stores 1000 + schema; a format 1 file (1.x) the schema
  // itself. Both migrate the same way; in memory the workspace always holds the plain schema,
  // and only saving to a file adds the 1000 again (see toFile).
  const version = raw >= FORMAT2_SCHEMA_BASE ? raw - FORMAT2_SCHEMA_BASE : raw;
  if (version < 1) return { ok: false, key: 'error.schema.unknown' };
  if (version > CURRENT_SCHEMA) return { ok: false, key: 'error.schema.newer' };

  let value: unknown = structuredClone(input);
  (value as Record<string, unknown>).schemaVersion = version;
  for (let v = version; v < CURRENT_SCHEMA; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, key: 'error.schema.unknown' };
    value = step(value);
    (value as Record<string, unknown>).schemaVersion = v + 1;
  }
  return { ok: true, value: unshadowRegions(value) };
}

/**
 * An imported region whose id a newer app version bundles (Caldence once bundled only `de-sn`,
 * now every German state, #23) gets a new id ending in `-imported`, and a selection of it follows,
 * so the file still opens and keeps its own holidays instead of being refused or overridden.
 */
function unshadowRegions(value: unknown): unknown {
  const ws = value as Record<string, unknown>;
  if (!Array.isArray(ws.customRegions)) return value;
  const regions = ws.customRegions as unknown[];
  const taken = new Set(
    regions.map((r) => (r as { id?: unknown } | null)?.id).filter((id) => typeof id === 'string'),
  );
  const settings = ws.settings as Record<string, unknown> | undefined;
  ws.customRegions = regions.map((r) => {
    const id = (r as { id?: unknown } | null)?.id;
    if (typeof id !== 'string' || !isBuiltinRegion(id)) return r;
    let next = `${id}-imported`;
    for (let n = 2; taken.has(next) || isBuiltinRegion(next); n++) next = `${id}-imported-${n}`;
    taken.add(next);
    if (settings && settings.region === id) settings.region = next;
    return { ...(r as object), id: next };
  });
  return value;
}

/** The workspace as Caldence 2 writes it to a file: format 2, `schemaVersion` 1000 + schema. */
export function toFile<T extends { schemaVersion: number }>(ws: T): T {
  return { ...ws, schemaVersion: FORMAT2_SCHEMA_BASE + ws.schemaVersion };
}
