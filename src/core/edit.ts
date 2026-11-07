import { mondayOf, type ISODate } from './date';
import type { CalEvent, Category, Cycle, Person, Role, Settings, Team, Workspace } from './model';
import { validate, type Result, type ValidationError } from './validate';

export type ListKind = 'roles' | 'people' | 'categories';

type ItemData = Omit<Role, 'id'> | Omit<Person, 'id'> | Omit<Category, 'id'>;
type Item = Role | Person | Category;

const PREFIX: Record<ListKind, string> = { roles: 'r', people: 'p', categories: 'c' };

const fail = <T>(path: string, key: string): Result<T> => ({ ok: false, errors: [{ path, key }] });
const failAll = <T>(errors: ValidationError[]): Result<T> => ({ ok: false, errors });

/** `prefix + n` for the smallest n >= 1 that is not taken. */
export function newId(prefix: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  let n = 1;
  while (set.has(prefix + n)) n++;
  return prefix + n;
}

const ids = (list: { id: string }[]): string[] => list.map((x) => x.id);

function mapTeam(ws: Workspace, teamId: string, fn: (t: Team) => Team): Workspace {
  if (!ws.teams.some((t) => t.id === teamId)) return structuredClone(ws);
  const out = structuredClone(ws);
  out.teams = out.teams.map((t) => (t.id === teamId ? fn(t) : t));
  return out;
}

// ---------- roles, people, categories ----------

export function addItem(ws: Workspace, kind: ListKind, data: ItemData): [Workspace, string] {
  const id = newId(PREFIX[kind], ids(ws[kind]));
  const item = { ...structuredClone(data), id } as Item;
  return [{ ...structuredClone(ws), [kind]: [...structuredClone(ws[kind]), item] }, id];
}

type Patch<T> = Partial<Omit<T, 'id'>>;

export function updateItem(ws: Workspace, kind: 'roles', id: string, patch: Patch<Role>): Workspace;
export function updateItem(
  ws: Workspace,
  kind: 'people',
  id: string,
  patch: Patch<Person>,
): Workspace;
export function updateItem(
  ws: Workspace,
  kind: 'categories',
  id: string,
  patch: Patch<Category>,
): Workspace;
export function updateItem(
  ws: Workspace,
  kind: ListKind,
  id: string,
  patch: Patch<Item>,
): Workspace {
  const list = (ws[kind] as Item[]).map((x) =>
    x.id === id
      ? ({ ...structuredClone(x), ...structuredClone(patch), id } as Item)
      : structuredClone(x),
  );
  return { ...structuredClone(ws), [kind]: list };
}

export function moveItem(ws: Workspace, kind: ListKind, id: string, delta: -1 | 1): Workspace {
  const list = ws[kind] as Item[];
  const from = list.findIndex((x) => x.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return structuredClone(ws);
  const next = structuredClone(list);
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return { ...structuredClone(ws), [kind]: next };
}

function uniqueBy<T>(list: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return list.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function mergeParticipants(list: CalEvent['participants']): CalEvent['participants'] {
  const out: CalEvent['participants'] = [];
  for (const p of list) {
    const hit = out.find((o) => o.roleId === p.roleId);
    if (hit) hit.share = Math.min(1, hit.share + p.share);
    else out.push({ ...p });
  }
  return out;
}

export function removeItem(
  ws: Workspace,
  kind: ListKind,
  id: string,
  replacementId?: string,
): Result<Workspace> {
  const index = (ws[kind] as Item[]).findIndex((x) => x.id === id);
  if (index < 0) return fail(`${kind}.${id}`, 'error.ref.unknown');
  const path = `${kind}.${index}`;
  if (
    replacementId !== undefined &&
    (replacementId === id || !ids(ws[kind]).includes(replacementId))
  )
    return fail(path, 'error.ref.unknown');

  const out = structuredClone(ws);
  (out[kind] as Item[]).splice(index, 1);

  if (kind === 'people') {
    for (const t of out.teams) {
      t.members = t.members.flatMap((m) =>
        m.personId !== id ? [m] : replacementId ? [{ ...m, personId: replacementId }] : [],
      );
      t.members = uniqueBy(t.members, (m) => `${m.personId}\u0000${m.roleId}`);
    }
    return { ok: true, value: out };
  }

  const inUse =
    kind === 'roles'
      ? ws.teams.some(
          (t) =>
            t.members.some((m) => m.roleId === id) ||
            t.events.some((e) => e.participants.some((p) => p.roleId === id)),
        )
      : ws.teams.some((t) => t.events.some((e) => e.categoryId === id));
  if (inUse && replacementId === undefined) return fail(path, 'error.ref.inuse');
  if (replacementId === undefined) return { ok: true, value: out };

  for (const t of out.teams) {
    if (kind === 'roles') {
      t.members = uniqueBy(
        t.members.map((m) => (m.roleId === id ? { ...m, roleId: replacementId } : m)),
        (m) => `${m.personId}\u0000${m.roleId}`,
      );
      for (const e of t.events)
        e.participants = mergeParticipants(
          e.participants.map((p) => (p.roleId === id ? { ...p, roleId: replacementId } : p)),
        );
    } else {
      for (const e of t.events) if (e.categoryId === id) e.categoryId = replacementId;
    }
  }
  return { ok: true, value: out };
}

// ---------- teams ----------

export function addTeam(ws: Workspace, name: string, today: ISODate): [Workspace, string] {
  const id = newId('t', ids(ws.teams));
  const team: Team = {
    id,
    name,
    cadence: { kind: 'sprint', lengthWeeks: 2, start: mondayOf(today) },
    members: [],
    assumptions: {},
    cycles: [],
    events: [],
  };
  return [{ ...structuredClone(ws), teams: [...structuredClone(ws.teams), team] }, id];
}

export function updateTeam(
  ws: Workspace,
  teamId: string,
  patch: Partial<Pick<Team, 'name' | 'cadence' | 'members' | 'assumptions'>>,
): Result<Workspace> {
  const ti = ws.teams.findIndex((t) => t.id === teamId);
  if (ti < 0) return fail(`teams.${teamId}`, 'error.ref.unknown');
  const team = ws.teams[ti]!;
  if (patch.assumptions) {
    const errors: ValidationError[] = [];
    const used = new Set(team.events.flatMap((e) => (e.scaling ? [e.scaling.assumption] : [])));
    for (const key of Object.keys(team.assumptions))
      if (used.has(key) && !(key in patch.assumptions))
        errors.push({ path: `teams.${ti}.assumptions.${key}`, key: 'error.ref.inuse' });
    if (errors.length > 0) return failAll(errors);
  }
  const next = mapTeam(ws, teamId, (t) => ({ ...t, ...structuredClone(patch) }));
  const v = validate(next);
  return v.ok ? { ok: true, value: next } : v;
}

export function duplicateTeam(ws: Workspace, teamId: string, name: string): [Workspace, string] {
  const src = ws.teams.find((t) => t.id === teamId);
  if (!src) return [structuredClone(ws), teamId];
  const id = newId('t', ids(ws.teams));
  const copy: Team = { ...structuredClone(src), id, name };
  return [{ ...structuredClone(ws), teams: [...structuredClone(ws.teams), copy] }, id];
}

export function removeTeam(ws: Workspace, teamId: string): Workspace {
  if (!ws.teams.some((t) => t.id === teamId)) return structuredClone(ws);
  return {
    ...structuredClone(ws),
    teams: structuredClone(ws.teams.filter((t) => t.id !== teamId)),
  };
}

/**
 * Renames an assumption key, keeping its value and position, and points the team's scaling rules
 * at the new key. Refuses an existing target key with `error.id.duplicate`.
 */
export function renameAssumption(
  ws: Workspace,
  teamId: string,
  from: string,
  to: string,
): Result<Workspace> {
  const ti = ws.teams.findIndex((t) => t.id === teamId);
  const team = ws.teams[ti];
  if (!team) return fail(`teams.${teamId}`, 'error.ref.unknown');
  const key = to.trim();
  if (!(from in team.assumptions))
    return fail(`teams.${ti}.assumptions.${from}`, 'error.ref.unknown');
  if (key === '') return fail(`teams.${ti}.assumptions.${from}`, 'error.required');
  if (key === from) return { ok: true, value: structuredClone(ws) };
  if (key in team.assumptions) return fail(`teams.${ti}.assumptions.${key}`, 'error.id.duplicate');
  return {
    ok: true,
    value: mapTeam(ws, teamId, (t) => ({
      ...t,
      assumptions: Object.fromEntries(
        Object.entries(t.assumptions).map(([k, v]) => [k === from ? key : k, v]),
      ),
      events: t.events.map((e) =>
        e.scaling?.assumption === from ? { ...e, scaling: { ...e.scaling, assumption: key } } : e,
      ),
    })),
  };
}

// ---------- cycles ----------

/**
 * Adds or replaces a cycle (an empty id creates one). Refuses with `error.ref.inuse` at
 * `teams.<ti>.cycles.<ci>.milestones` when an event's cycle-milestone rule still references a
 * milestone that the new cycle lacks. An unknown team leaves the workspace unchanged.
 */
export function upsertCycle(ws: Workspace, teamId: string, cycle: Cycle): Result<Workspace> {
  const ti = ws.teams.findIndex((t) => t.id === teamId);
  const team = ws.teams[ti];
  if (!team) return { ok: true, value: structuredClone(ws) };
  const ci = team.cycles.findIndex((x) => x.id === cycle.id);
  if (ci >= 0) {
    const have = new Set(cycle.milestones.map((m) => m.id));
    const missing = team.events.some(
      (e) =>
        e.rule.type === 'cycle-milestone' &&
        e.rule.cycleId === cycle.id &&
        !have.has(e.rule.milestoneId),
    );
    if (missing) return fail(`teams.${ti}.cycles.${ci}.milestones`, 'error.ref.inuse');
  }
  return {
    ok: true,
    value: mapTeam(ws, teamId, (t) => {
      const c = structuredClone(cycle);
      if (c.id === '') c.id = newId('cy', ids(t.cycles));
      const i = t.cycles.findIndex((x) => x.id === c.id);
      if (i >= 0) t.cycles[i] = c;
      else t.cycles.push(c);
      return t;
    }),
  };
}

export function removeCycle(ws: Workspace, teamId: string, cycleId: string): Result<Workspace> {
  const ti = ws.teams.findIndex((t) => t.id === teamId);
  const team = ws.teams[ti];
  if (!team) return fail(`teams.${teamId}`, 'error.ref.unknown');
  const ci = team.cycles.findIndex((c) => c.id === cycleId);
  if (ci < 0) return fail(`teams.${ti}.cycles.${cycleId}`, 'error.ref.unknown');
  if (team.events.some((e) => e.rule.type === 'cycle-milestone' && e.rule.cycleId === cycleId))
    return fail(`teams.${ti}.cycles.${ci}`, 'error.ref.inuse');
  return {
    ok: true,
    value: mapTeam(ws, teamId, (t) => ({ ...t, cycles: t.cycles.filter((c) => c.id !== cycleId) })),
  };
}

// ---------- events ----------

export function upsertEvent(ws: Workspace, teamId: string, event: CalEvent): [Workspace, string] {
  let id = event.id;
  const out = mapTeam(ws, teamId, (t) => {
    const e = structuredClone(event);
    if (e.id === '') e.id = newId('e', ids(t.events));
    id = e.id;
    const i = t.events.findIndex((x) => x.id === e.id);
    if (i >= 0) t.events[i] = e;
    else t.events.push(e);
    return t;
  });
  return [out, id];
}

export function duplicateEvent(
  ws: Workspace,
  teamId: string,
  eventId: string,
): [Workspace, string] {
  const src = ws.teams.find((t) => t.id === teamId)?.events.find((e) => e.id === eventId);
  if (!src) return [structuredClone(ws), eventId];
  return upsertEvent(ws, teamId, { ...structuredClone(src), id: '' });
}

export function removeEvent(ws: Workspace, teamId: string, eventId: string): Workspace {
  return mapTeam(ws, teamId, (t) => ({ ...t, events: t.events.filter((e) => e.id !== eventId) }));
}

// ---------- settings ----------

export function updateSettings(ws: Workspace, patch: Partial<Settings>): Workspace {
  return {
    ...structuredClone(ws),
    settings: { ...structuredClone(ws.settings), ...structuredClone(patch) },
  };
}
