import { mondayOf, type ISODate } from './date';
import {
  areaAsTeam,
  participantKey,
  type Cadence,
  type CalEvent,
  type Category,
  type Cycle,
  type Person,
  type Role,
  type Settings,
  type Team,
  type Workspace,
} from './model';
import { NEW_CATEGORY_COLOUR, type ImportCandidate } from './icsImport';
import { record } from './record';
import { isBuiltinRegion, type Region } from './regions';
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

/** Team and area ids share one space (load keys hours by either), so a new id avoids both. */
export const unitIds = (ws: Workspace): string[] => [...ids(ws.teams), ...ids(ws.areas)];

function mapTeam(ws: Workspace, teamId: string, fn: (t: Team) => Team): Workspace {
  if (!ws.teams.some((t) => t.id === teamId)) return structuredClone(ws);
  const out = structuredClone(ws);
  out.teams = out.teams.map((t) => (t.id === teamId ? fn(t) : t));
  return out;
}

/**
 * Like mapTeam for a team or an area: an area is handed over as a team (see areaAsTeam), and its
 * cycles and events are taken back. Meetings and cycles are edited the same way in both.
 */
function mapUnit(ws: Workspace, unitId: string, fn: (t: Team) => Team): Workspace {
  if (ws.teams.some((t) => t.id === unitId)) return mapTeam(ws, unitId, fn);
  const out = structuredClone(ws);
  out.areas = out.areas.map((a) => {
    if (a.id !== unitId) return a;
    const { cycles, events } = fn(areaAsTeam(a));
    return { ...a, cycles, events };
  });
  return out;
}

/** A team or area with the path of its list in the file, e.g. `areas.0`. */
function findUnit(ws: Workspace, unitId: string): { unit: Team; path: string } | undefined {
  const ti = ws.teams.findIndex((t) => t.id === unitId);
  if (ti >= 0) return { unit: ws.teams[ti]!, path: `teams.${ti}` };
  const ai = ws.areas.findIndex((a) => a.id === unitId);
  if (ai >= 0) return { unit: areaAsTeam(ws.areas[ai]!), path: `areas.${ai}` };
  return undefined;
}

// ---------- roles, people, categories ----------

export function addItem(ws: Workspace, kind: ListKind, data: ItemData): [Workspace, string] {
  const id = newId(PREFIX[kind], ids(ws[kind]));
  const item = { ...structuredClone(data), id } as Item;
  return [{ ...structuredClone(ws), [kind]: [...structuredClone(ws[kind]), item] }, id];
}

/** The role with this name (ignoring case and spaces), or a new one with that name and colour. */
export function roleByName(ws: Workspace, name: string, colour: string): [Workspace, string] {
  const key = name.trim().toLowerCase();
  const known = ws.roles.find((r) => r.name.trim().toLowerCase() === key);
  return known ? [ws, known.id] : addItem(ws, 'roles', { name: name.trim(), colour });
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
    const hit = out.find((o) => participantKey(o) === participantKey(p));
    // One person invited twice by name attends once, with the larger share.
    if (hit && p.personId !== undefined) hit.share = Math.max(hit.share, p.share);
    else if (hit) {
      hit.share = Math.min(1, hit.share + p.share);
      // "From every team" reaches the area's members too, so the merged entry keeps it.
      if (p.fromTeams) hit.fromTeams = true;
    } else out.push({ ...p });
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

  // Teams and areas hold members, hours and events the same way.
  const units = [...out.teams, ...out.areas];

  if (kind === 'people') {
    for (const t of units) {
      // A replacement that is already a member keeps its own hours (an entry or the default).
      const wasMember = t.members.some((m) => m.personId === replacementId);
      t.members = t.members.flatMap((m) =>
        m.personId !== id ? [m] : replacementId ? [{ ...m, personId: replacementId }] : [],
      );
      t.members = uniqueBy(t.members, (m) => `${m.personId}\u0000${m.roleId}`);
      const hours = Object.hasOwn(t.memberHours, id) ? t.memberHours[id] : undefined;
      delete t.memberHours[id];
      if ('contextOverrides' in t && t.contextOverrides) {
        delete t.contextOverrides[id];
        if (Object.keys(t.contextOverrides).length === 0) delete t.contextOverrides;
      }
      if (replacementId && hours !== undefined && !wasMember)
        t.memberHours = Object.assign(record<number>(), t.memberHours, { [replacementId]: hours });
      // Meetings that invite the person by name invite the replacement, or no longer them.
      for (const e of t.events)
        e.participants = mergeParticipants(
          e.participants.flatMap((p) =>
            p.personId !== id ? [p] : replacementId ? [{ ...p, personId: replacementId }] : [],
          ),
        );
    }
    return { ok: true, value: out };
  }

  const inUse =
    kind === 'roles'
      ? units.some(
          (t) =>
            t.members.some((m) => m.roleId === id) ||
            t.events.some((e) => e.participants.some((p) => p.roleId === id)),
        )
      : units.some((t) => t.events.some((e) => e.categoryId === id));
  if (inUse && replacementId === undefined) return fail(path, 'error.ref.inuse');
  if (kind === 'roles') {
    // Role links follow the replacement; without one, a link to the role goes (#338).
    for (const a of out.areas) {
      if (!a.roleLinks) continue;
      a.roleLinks = uniqueBy(
        a.roleLinks.flatMap((l) => {
          const roleId = l.roleId === id ? replacementId : l.roleId;
          const teamRoleId = l.teamRoleId === id ? replacementId : l.teamRoleId;
          return roleId && teamRoleId ? [{ ...l, roleId, teamRoleId }] : [];
        }),
        (l) => `${l.teamId}\u0000${l.roleId}`,
      );
    }
    dropStaleLinks(out);
  }
  if (replacementId === undefined) return { ok: true, value: out };

  for (const t of units) {
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
  const id = newId('t', unitIds(ws));
  const team: Team = {
    id,
    name,
    cadence: { kind: 'sprint', lengthWeeks: 2, start: mondayOf(today) },
    members: [],
    memberHours: {},
    assumptions: {},
    cycles: [],
    events: [],
  };
  return [{ ...structuredClone(ws), teams: [...structuredClone(ws.teams), team] }, id];
}

export function updateTeam(
  ws: Workspace,
  teamId: string,
  patch: Partial<Pick<Team, 'name' | 'cadence' | 'members' | 'memberHours' | 'assumptions'>>,
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
  const id = newId('t', unitIds(ws));
  const copy: Team = { ...structuredClone(src), id, name };
  const out = { ...structuredClone(ws), teams: [...structuredClone(ws.teams), copy] };
  // The copy joins the area of its source, with the same role links (#338).
  for (const a of out.areas)
    if (a.teamIds.includes(teamId)) {
      a.teamIds.push(id);
      const links = (a.roleLinks ?? []).filter((l) => l.teamId === teamId);
      if (links.length > 0)
        a.roleLinks = [...a.roleLinks!, ...links.map((l) => ({ ...l, teamId: id }))];
    }
  return [out, id];
}

export function removeTeam(ws: Workspace, teamId: string): Workspace {
  if (!ws.teams.some((t) => t.id === teamId)) return structuredClone(ws);
  const out = structuredClone(ws);
  out.teams = out.teams.filter((t) => t.id !== teamId);
  for (const a of out.areas) a.teamIds = a.teamIds.filter((id) => id !== teamId);
  dropStaleLinks(out);
  return out;
}

/** Removes role links whose team left the area or that link a role to itself (#338). */
function dropStaleLinks(ws: Workspace): void {
  for (const a of ws.areas) {
    if (!a.roleLinks) continue;
    a.roleLinks = a.roleLinks.filter(
      (l) => a.teamIds.includes(l.teamId) && l.roleId !== l.teamRoleId,
    );
    if (a.roleLinks.length === 0) delete a.roleLinks;
  }
}

// ---------- areas ----------

/** Adds an area with these teams; a team that was in another area moves to the new one. */
export function addArea(
  ws: Workspace,
  name: string,
  teamIds: string[],
): Result<[Workspace, string]> {
  const id = newId('a', unitIds(ws));
  const out = structuredClone(ws);
  out.areas.push({ id, name, teamIds: [], members: [], memberHours: {}, cycles: [], events: [] });
  const result = setAreaTeams(out, id, teamIds, false);
  return result.ok ? { ok: true, value: [result.value, id] } : result;
}

/** Renames an area. */
export function renameArea(ws: Workspace, areaId: string, name: string): Result<Workspace> {
  if (!ws.areas.some((a) => a.id === areaId)) return fail(`areas.${areaId}`, 'error.ref.unknown');
  const out = structuredClone(ws);
  for (const a of out.areas) if (a.id === areaId) a.name = name;
  const v = validate(out);
  return v.ok ? { ok: true, value: out } : v;
}

/** Names the organisation (#313); an empty name removes it, so the level's name shows again. */
export function renameOrganisation(ws: Workspace, name: string): Result<Workspace> {
  const out = structuredClone(ws);
  const text = name.trim();
  if (text === '') delete out.organisation;
  else out.organisation = { name: text };
  const v = validate(out);
  return v.ok ? { ok: true, value: out } : v;
}

/**
 * Sets an area's teams, in the order of the workspace's teams. A team can be in one area only:
 * one that was in another area leaves it. Unknown team ids are refused.
 */
export function setAreaTeams(
  ws: Workspace,
  areaId: string,
  teamIds: string[],
  copy = true,
): Result<Workspace> {
  if (!ws.areas.some((a) => a.id === areaId)) return fail(`areas.${areaId}`, 'error.ref.unknown');
  const wanted = new Set(teamIds);
  for (const id of wanted)
    if (!ws.teams.some((t) => t.id === id))
      return fail(`areas.${areaId}.teamIds`, 'error.ref.unknown');
  // addArea passes its own fresh copy.
  const out = copy ? structuredClone(ws) : ws;
  for (const a of out.areas)
    a.teamIds =
      a.id === areaId
        ? out.teams.filter((t) => wanted.has(t.id)).map((t) => t.id)
        : a.teamIds.filter((id) => !wanted.has(id));
  dropStaleLinks(out);
  const v = validate(out);
  return v.ok ? { ok: true, value: out } : v;
}

/** Sets or clears an area's own cadence; without one, its meetings cannot follow a cadence. */
export function setAreaCadence(
  ws: Workspace,
  areaId: string,
  cadence: Cadence | undefined,
): Result<Workspace> {
  if (!ws.areas.some((a) => a.id === areaId)) return fail(`areas.${areaId}`, 'error.ref.unknown');
  const out = structuredClone(ws);
  for (const a of out.areas) {
    if (a.id !== areaId) continue;
    if (cadence) a.cadence = structuredClone(cadence);
    else delete a.cadence;
  }
  return validate(out);
}

/**
 * New 0-based days of the cadence-day meetings that move when the cadence length changes: those in
 * the second half keep their distance to the end, so Review and Retro stay at the end of the
 * sprint. One that would land before the start stays put (and then does not fit).
 */
export function shiftedDays(
  events: CalEvent[],
  fromWeeks: number,
  toWeeks: number,
): Map<string, number> {
  const delta = (toWeeks - fromWeeks) * 7;
  const out = new Map<string, number>();
  for (const e of events) {
    if (e.rule.type !== 'cadence-day' || delta === 0) continue;
    const day = e.rule.day + delta;
    if (2 * e.rule.day >= fromWeeks * 7 && day >= 0) out.set(e.id, day);
  }
  return out;
}

/**
 * Sets the cadence length of a team or an area and moves its meetings by `shiftedDays`. Refuses
 * with `team.cadence.dayBeyond` (name, 1-based day, weeks) when a cadence-day meeting does not fit.
 */
export function setCadenceLength(ws: Workspace, unitId: string, weeks: number): Result<Workspace> {
  const out = structuredClone(ws);
  const unit = out.teams.find((t) => t.id === unitId) ?? out.areas.find((a) => a.id === unitId);
  if (!unit?.cadence) return fail(`teams.${unitId}`, 'error.ref.unknown');
  const days = shiftedDays(unit.events, unit.cadence.lengthWeeks, weeks);
  const beyond = unit.events.find(
    (e) => e.rule.type === 'cadence-day' && (days.get(e.id) ?? e.rule.day) >= weeks * 7,
  );
  if (beyond?.rule.type === 'cadence-day') {
    const params = { name: beyond.name, day: beyond.rule.day + 1, weeks };
    return {
      ok: false,
      errors: [{ path: 'cadence.lengthWeeks', key: 'team.cadence.dayBeyond', params }],
    };
  }
  unit.cadence.lengthWeeks = weeks;
  unit.events = unit.events.map((e) => {
    const day = days.get(e.id);
    return day === undefined ? e : { ...e, rule: { type: 'cadence-day', day } };
  });
  return validate(out);
}

/** Removes an area with its own people, cycles and meetings; its teams stay, without an area. */
export function removeArea(ws: Workspace, areaId: string): Workspace {
  const out = structuredClone(ws);
  out.areas = out.areas.filter((a) => a.id !== areaId);
  return out;
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
  if (!Object.hasOwn(team.assumptions, from))
    return fail(`teams.${ti}.assumptions.${from}`, 'error.ref.unknown');
  if (key === '') return fail(`teams.${ti}.assumptions.${from}`, 'error.required');
  if (key === from) return { ok: true, value: structuredClone(ws) };
  if (Object.hasOwn(team.assumptions, key))
    return fail(`teams.${ti}.assumptions.${key}`, 'error.id.duplicate');
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
  const found = findUnit(ws, teamId);
  if (!found) return { ok: true, value: structuredClone(ws) };
  const { unit: team, path } = found;
  const ci = team.cycles.findIndex((x) => x.id === cycle.id);
  if (ci >= 0) {
    const have = new Set(cycle.milestones.map((m) => m.id));
    const missing = team.events.some(
      (e) =>
        e.rule.type === 'cycle-milestone' &&
        e.rule.cycleId === cycle.id &&
        !have.has(e.rule.milestoneId),
    );
    if (missing) return fail(`${path}.cycles.${ci}.milestones`, 'error.ref.inuse');
  }
  return {
    ok: true,
    value: mapUnit(ws, teamId, (t) => {
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
  const found = findUnit(ws, teamId);
  if (!found) return fail(`teams.${teamId}`, 'error.ref.unknown');
  const { unit: team, path } = found;
  const ci = team.cycles.findIndex((c) => c.id === cycleId);
  if (ci < 0) return fail(`${path}.cycles.${cycleId}`, 'error.ref.unknown');
  if (team.events.some((e) => e.rule.type === 'cycle-milestone' && e.rule.cycleId === cycleId))
    return fail(`${path}.cycles.${ci}`, 'error.ref.inuse');
  return {
    ok: true,
    value: mapUnit(ws, teamId, (t) => ({ ...t, cycles: t.cycles.filter((c) => c.id !== cycleId) })),
  };
}

// ---------- events ----------

/** Adds or replaces a meeting of a team or area (an empty id creates one). */
export function upsertEvent(ws: Workspace, teamId: string, event: CalEvent): [Workspace, string] {
  let id = event.id;
  const out = mapUnit(ws, teamId, (t) => {
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
  const src = findUnit(ws, teamId)?.unit.events.find((e) => e.id === eventId);
  if (!src) return [structuredClone(ws), eventId];
  return upsertEvent(ws, teamId, { ...structuredClone(src), id: '' });
}

export function removeEvent(ws: Workspace, teamId: string, eventId: string): Workspace {
  return mapUnit(ws, teamId, (t) => ({ ...t, events: t.events.filter((e) => e.id !== eventId) }));
}

/**
 * Adds the chosen import candidates as events of the team, each with the roles at share 1 and no
 * preparation; an untitled candidate gets `untitledName`. A workspace without any category first
 * gets one named `newCategoryName`, which all items then use. One clone, validated once.
 */
export function importEvents(
  ws: Workspace,
  teamId: string,
  items: { candidate: ImportCandidate; categoryId: string }[],
  opts: { roleIds: string[]; newCategoryName: string; untitledName: string },
): Result<Workspace> {
  const out = structuredClone(ws);
  const team = out.teams.find((t) => t.id === teamId);
  if (!team) return fail(`teams.${teamId}`, 'error.ref.unknown');
  let fallback: string | null = null;
  if (out.categories.length === 0) {
    fallback = newId(PREFIX.categories, []);
    out.categories.push({ id: fallback, name: opts.newCategoryName, colour: NEW_CATEGORY_COLOUR });
  }
  const taken = new Set(ids(team.events));
  let n = 1;
  for (const { candidate: c, categoryId } of items) {
    while (taken.has(`e${n}`)) n++;
    const id = `e${n}`;
    taken.add(id);
    team.events.push({
      id,
      name: c.untitled || c.name.trim() === '' ? opts.untitledName : c.name,
      categoryId: fallback ?? categoryId,
      rule: structuredClone(c.rule),
      time: c.time,
      duration: c.duration,
      participants: opts.roleIds.map((roleId) => ({ roleId, share: 1 })),
      preparation: 0,
    });
  }
  return validate(out);
}

// ---------- settings ----------

export function updateSettings(ws: Workspace, patch: Partial<Settings>): Workspace {
  const settings = { ...structuredClone(ws.settings), ...structuredClone(patch) };
  // An emptied hourly rate turns costs off: the key goes, rather than staying as undefined.
  if (settings.hourlyRate === undefined) delete settings.hourlyRate;
  if (settings.levelNames === undefined) delete settings.levelNames;
  return { ...structuredClone(ws), settings };
}

// ---------- imported regions ----------

/** Adds an imported region; its id must differ from every built-in and imported region. */
export function addCustomRegion(ws: Workspace, region: Region): Result<Workspace> {
  const path = `customRegions.${ws.customRegions.length}.id`;
  if (isBuiltinRegion(region.id)) return fail(path, 'error.region.builtin');
  if (ws.customRegions.some((r) => r.id === region.id)) return fail(path, 'error.region.duplicate');
  const out = structuredClone(ws);
  out.customRegions.push(structuredClone(region));
  return { ok: true, value: out };
}

/** Removes an imported region that is not the workspace's region. */
export function removeCustomRegion(ws: Workspace, id: string): Result<Workspace> {
  const index = ws.customRegions.findIndex((r) => r.id === id);
  if (index < 0) return fail(`customRegions.${id}`, 'error.ref.unknown');
  if (ws.settings.region === id) return fail(`customRegions.${index}`, 'error.region.inUse');
  const out = structuredClone(ws);
  out.customRegions.splice(index, 1);
  return { ok: true, value: out };
}
