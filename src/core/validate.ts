import { isValidDate, isValidTime } from './date';
import { migrate } from './migrate';
import { CURRENT_SCHEMA, type Workspace } from './model';
import { validateRegion } from './regionFile';
import { isBuiltinRegion } from './regions';

export type ValidationError = { path: string; key: string };
export type Result<T> = { ok: true; value: T } | { ok: false; errors: ValidationError[] };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

class Checker {
  errors: ValidationError[] = [];

  err(path: string, key: string): void {
    this.errors.push({ path, key });
  }

  obj(v: unknown, path: string): Obj | undefined {
    if (v === undefined) this.err(path, 'error.required');
    else if (!isObj(v)) this.err(path, 'error.type');
    else return v;
    return undefined;
  }

  arr(v: unknown, path: string): unknown[] | undefined {
    if (v === undefined) this.err(path, 'error.required');
    else if (!Array.isArray(v)) this.err(path, 'error.type');
    else return v;
    return undefined;
  }

  str(o: Obj, k: string, path: string): void {
    if (o[k] === undefined) this.err(`${path}.${k}`, 'error.required');
    else if (!isStr(o[k])) this.err(`${path}.${k}`, 'error.type');
  }

  date(o: Obj, k: string, path: string): boolean {
    if (o[k] === undefined) this.err(`${path}.${k}`, 'error.required');
    else if (!isValidDate(o[k])) this.err(`${path}.${k}`, 'error.date.invalid');
    else return true;
    return false;
  }

  time(o: Obj, k: string, path: string): void {
    if (o[k] === undefined) this.err(`${path}.${k}`, 'error.required');
    else if (!isValidTime(o[k])) this.err(`${path}.${k}`, 'error.time.invalid');
  }

  colour(o: Obj, k: string, path: string): void {
    if (o[k] === undefined) this.err(`${path}.${k}`, 'error.required');
    else if (typeof o[k] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(o[k]))
      this.err(`${path}.${k}`, 'error.colour.invalid');
  }

  /** Number check; `min` is inclusive unless `exclusive` is set, `max` is inclusive; `int` demands an integer. */
  num(
    o: Obj,
    k: string,
    path: string,
    opts: { min?: number; max?: number; exclusive?: boolean; int?: boolean },
  ): void {
    const v = o[k];
    if (v === undefined) return this.err(`${path}.${k}`, 'error.required');
    if (!isNum(v) || (opts.int && !Number.isInteger(v)))
      return this.err(`${path}.${k}`, 'error.number.invalid');
    if (opts.min !== undefined && (opts.exclusive ? v <= opts.min : v < opts.min))
      this.err(`${path}.${k}`, 'error.number.invalid');
    else if (opts.max !== undefined && v > opts.max)
      this.err(`${path}.${k}`, 'error.number.invalid');
  }

  weekday(o: Obj, k: string, path: string): void {
    const v = o[k];
    if (v === undefined) this.err(`${path}.${k}`, 'error.required');
    else if (!isInt(v) || v < 1 || v > 7) this.err(`${path}.${k}`, 'error.weekday.range');
  }

  /** Validates the ids of a list of objects, reporting duplicates; returns the set of ids. */
  ids(list: unknown[], path: string): Set<string> {
    const seen = new Set<string>();
    list.forEach((item, i) => {
      if (!isObj(item)) return;
      const id = item.id;
      if (id === undefined) return this.err(`${path}.${i}.id`, 'error.required');
      if (!isStr(id)) return this.err(`${path}.${i}.id`, 'error.type');
      if (seen.has(id)) this.err(`${path}.${i}.id`, 'error.id.duplicate');
      seen.add(id);
    });
    return seen;
  }

  each(v: unknown, path: string, fn: (o: Obj, p: string, i: number) => void): unknown[] {
    const list = this.arr(v, path) ?? [];
    list.forEach((item, i) => {
      const o = this.obj(item, `${path}.${i}`);
      if (o) fn(o, `${path}.${i}`, i);
    });
    return list;
  }

  ref(o: Obj, k: string, path: string, known: Set<string>): void {
    if (o[k] === undefined) this.err(`${path}.${k}`, 'error.required');
    else if (!isStr(o[k]) || !known.has(o[k])) this.err(`${path}.${k}`, 'error.ref.unknown');
  }
}

function checkSettings(c: Checker, v: unknown): void {
  const s = c.obj(v, 'settings');
  if (!s) return;
  const p = 'settings';
  if (s.locale === undefined) c.err('settings.locale', 'error.required');
  else if (s.locale !== 'de' && s.locale !== 'en') c.err('settings.locale', 'error.enum.invalid');
  c.str(s, 'region', p);
  // Any non-empty name loads: a zone this browser does not know is reported where it is used
  // (settings, calendar exchange), so a file or autosave from another browser never fails to load.
  c.str(s, 'timezone', p);
  if (s.workdays === undefined) c.err('settings.workdays', 'error.required');
  else if (Array.isArray(s.workdays) && s.workdays.length === 0)
    c.err('settings.workdays', 'error.workdays.empty');
  else if (
    !Array.isArray(s.workdays) ||
    !s.workdays.every((d) => isInt(d) && d >= 1 && d <= 7) ||
    new Set(s.workdays).size !== s.workdays.length
  )
    c.err('settings.workdays', 'error.weekday.range');
  c.num(s, 'hoursPerWeek', p, { min: 0, exclusive: true });
  if (typeof s.skipHolidays !== 'boolean')
    c.err('settings.skipHolidays', s.skipHolidays === undefined ? 'error.required' : 'error.type');

  const h = c.obj(s.horizon, 'settings.horizon');
  if (h) {
    const fromOk = c.date(h, 'from', 'settings.horizon');
    const toOk = c.date(h, 'to', 'settings.horizon');
    if (fromOk && toOk && (h.to as string) < (h.from as string))
      c.err('settings.horizon.to', 'error.horizon.order');
  }
  const t = c.obj(s.thresholds, 'settings.thresholds');
  if (t) {
    c.num(t, 'warnFactor', 'settings.thresholds', { min: 0, exclusive: true });
    c.num(t, 'maxFte', 'settings.thresholds', { min: 0, exclusive: true });
  }
}

function checkRule(
  c: Checker,
  v: unknown,
  path: string,
  cycles: Map<string, Set<string>>,
  cadenceDays: number | undefined,
): void {
  const r = c.obj(v, path);
  if (!r) return;
  switch (r.type) {
    case 'weekly':
      c.weekday(r, 'weekday', path);
      break;
    case 'weekdays': {
      const days = r.weekdays;
      if (days === undefined) c.err(`${path}.weekdays`, 'error.required');
      else if (!Array.isArray(days)) c.err(`${path}.weekdays`, 'error.type');
      else if (days.length === 0) c.err(`${path}.weekdays`, 'error.required');
      else if (
        !days.every((d) => isInt(d) && d >= 1 && d <= 7) ||
        new Set(days).size !== days.length
      )
        c.err(`${path}.weekdays`, 'error.enum.invalid');
      break;
    }
    case 'every-n-weeks':
      c.weekday(r, 'weekday', path);
      c.num(r, 'n', path, { min: 1, int: true });
      c.date(r, 'anchor', path);
      break;
    case 'monthly-nth-weekday':
      c.weekday(r, 'weekday', path);
      if (r.nth === undefined) c.err(`${path}.nth`, 'error.required');
      else if (![1, 2, 3, 4, 5, -1].includes(r.nth as number))
        c.err(`${path}.nth`, 'error.enum.invalid');
      break;
    case 'cadence-day':
      c.num(r, 'day', path, { min: 0, int: true });
      if (cadenceDays !== undefined && isNum(r.day) && r.day >= cadenceDays)
        c.err(`${path}.day`, 'error.number.invalid');
      break;
    case 'cycle-milestone': {
      c.num(r, 'offsetDays', path, { int: true });
      c.ref(r, 'cycleId', path, new Set(cycles.keys()));
      const ms = isStr(r.cycleId) ? cycles.get(r.cycleId) : undefined;
      if (ms) c.ref(r, 'milestoneId', path, ms);
      else if (r.milestoneId === undefined) c.err(`${path}.milestoneId`, 'error.required');
      else c.err(`${path}.milestoneId`, 'error.ref.unknown');
      break;
    }
    case 'once':
      c.date(r, 'date', path);
      break;
    default:
      c.err(`${path}.type`, r.type === undefined ? 'error.required' : 'error.enum.invalid');
  }
}

function checkEvent(
  c: Checker,
  e: Obj,
  p: string,
  categoryIds: Set<string>,
  roleIds: Set<string>,
  cycles: Map<string, Set<string>>,
  cadenceDays: number | undefined,
): void {
  c.str(e, 'name', p);
  c.ref(e, 'categoryId', p, categoryIds);
  checkRule(c, e.rule, `${p}.rule`, cycles, cadenceDays);
  c.time(e, 'time', p);
  c.num(e, 'duration', p, { min: 0, exclusive: true, int: true });
  c.num(e, 'preparation', p, { min: 0, max: 1 });
  if (e.scaling !== undefined) {
    const sc = c.obj(e.scaling, `${p}.scaling`);
    if (sc) {
      const sp = `${p}.scaling`;
      c.num(sc, 'base', sp, { min: 0 });
      c.num(sc, 'perUnit', sp, { min: 0 });
      c.num(sc, 'grid', sp, { min: 0, exclusive: true });
      c.str(sc, 'assumption', sp);
    }
  }
  c.each(e.participants, `${p}.participants`, (pt, pp) => {
    c.ref(pt, 'roleId', pp, roleIds);
    if (pt.share === undefined) c.err(`${pp}.share`, 'error.required');
    else if (!isNum(pt.share) || pt.share <= 0 || pt.share > 1)
      c.err(`${pp}.share`, 'error.share.range');
  });
}

function checkTeam(
  c: Checker,
  t: Obj,
  p: string,
  roleIds: Set<string>,
  personIds: Set<string>,
  categoryIds: Set<string>,
): void {
  c.str(t, 'name', p);
  if (t.templateId !== undefined && typeof t.templateId !== 'string')
    c.err(`${p}.templateId`, 'error.type');

  const cad = c.obj(t.cadence, `${p}.cadence`);
  let cadenceDays: number | undefined;
  if (cad) {
    if (isNum(cad.lengthWeeks) && Number.isInteger(cad.lengthWeeks) && cad.lengthWeeks >= 1)
      cadenceDays = cad.lengthWeeks * 7;
    if (cad.kind === undefined) c.err(`${p}.cadence.kind`, 'error.required');
    else if (!['sprint', 'flow', 'pi'].includes(cad.kind as string))
      c.err(`${p}.cadence.kind`, 'error.enum.invalid');
    c.num(cad, 'lengthWeeks', `${p}.cadence`, { min: 1, int: true });
    c.date(cad, 'start', `${p}.cadence`);
  }

  const pairs = new Set<string>();
  c.each(t.members, `${p}.members`, (m, mp) => {
    c.ref(m, 'personId', mp, personIds);
    c.ref(m, 'roleId', mp, roleIds);
    if (isStr(m.personId) && isStr(m.roleId)) {
      const pair = JSON.stringify([m.personId, m.roleId]);
      if (pairs.has(pair)) c.err(mp, 'error.id.duplicate');
      pairs.add(pair);
    }
  });

  const a = c.obj(t.assumptions, `${p}.assumptions`);
  if (a)
    for (const [k, v] of Object.entries(a))
      if (!isNum(v)) c.err(`${p}.assumptions.${k}`, 'error.number.invalid');

  const cycles = new Map<string, Set<string>>();
  const cycleList = c.arr(t.cycles, `${p}.cycles`) ?? [];
  c.ids(cycleList, `${p}.cycles`);
  c.each(cycleList, `${p}.cycles`, (cy, cp) => {
    c.str(cy, 'name', cp);
    const msList = c.arr(cy.milestones, `${cp}.milestones`) ?? [];
    const msIds = c.ids(msList, `${cp}.milestones`);
    c.each(msList, `${cp}.milestones`, (m, mp) => {
      c.str(m, 'name', mp);
      c.date(m, 'date', mp);
    });
    if (isStr(cy.id) && !cycles.has(cy.id)) cycles.set(cy.id, msIds);
  });

  const events = c.arr(t.events, `${p}.events`) ?? [];
  c.ids(events, `${p}.events`);
  c.each(events, `${p}.events`, (e, ep) =>
    checkEvent(c, e, ep, categoryIds, roleIds, cycles, cadenceDays),
  );
}

/** Checks imported regions; returns the ids of the valid ones. */
function checkCustomRegions(c: Checker, v: unknown): Set<string> {
  const ids = new Set<string>();
  (c.arr(v, 'customRegions') ?? []).forEach((r, i) => {
    const p = `customRegions.${i}`;
    const result = validateRegion(r);
    if (!result.ok) {
      for (const e of result.errors) c.err(e.path ? `${p}.${e.path}` : p, e.key);
      return;
    }
    const id = result.value.id;
    if (isBuiltinRegion(id)) c.err(`${p}.id`, 'error.region.builtin');
    else if (ids.has(id)) c.err(`${p}.id`, 'error.region.duplicate');
    else ids.add(id);
  });
  return ids;
}

export function validate(input: unknown): Result<Workspace> {
  const c = new Checker();
  const w = c.obj(input, '');
  if (!w) return { ok: false, errors: c.errors };

  if (w.schemaVersion !== CURRENT_SCHEMA) {
    const v = w.schemaVersion;
    c.err(
      'schemaVersion',
      typeof v === 'number' && v > CURRENT_SCHEMA ? 'error.schema.newer' : 'error.schema.unknown',
    );
  }

  if (w.id === undefined) c.err('id', 'error.required');
  else if (!isStr(w.id)) c.err('id', 'error.type');

  checkSettings(c, w.settings);

  const roles = c.arr(w.roles, 'roles') ?? [];
  const roleIds = c.ids(roles, 'roles');
  c.each(roles, 'roles', (r, p) => {
    c.str(r, 'name', p);
    c.colour(r, 'colour', p);
  });

  const people = c.arr(w.people, 'people') ?? [];
  const personIds = c.ids(people, 'people');
  c.each(people, 'people', (o, p) => {
    c.str(o, 'name', p);
    c.num(o, 'hoursPerWeek', p, { min: 0 });
  });

  const cats = c.arr(w.categories, 'categories') ?? [];
  const categoryIds = c.ids(cats, 'categories');
  c.each(cats, 'categories', (o, p) => {
    c.str(o, 'name', p);
    c.colour(o, 'colour', p);
  });

  const teams = c.arr(w.teams, 'teams') ?? [];
  c.ids(teams, 'teams');
  c.each(teams, 'teams', (t, p) => checkTeam(c, t, p, roleIds, personIds, categoryIds));

  const customIds = checkCustomRegions(c, w.customRegions);
  const region = isObj(w.settings) ? w.settings.region : undefined;
  if (isStr(region) && !isBuiltinRegion(region) && !customIds.has(region))
    c.err('settings.region', 'error.ref.unknown');

  if (c.errors.length > 0) return { ok: false, errors: c.errors };
  return { ok: true, value: input as Workspace };
}

export function loadWorkspace(text: string): Result<Workspace> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: [{ path: '', key: 'error.file.json' }] };
  }
  // A template file (see template.ts) is not a workspace; say where it belongs.
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as Record<string, unknown>).kind === 'caldence-template'
  )
    return { ok: false, errors: [{ path: 'kind', key: 'file.error.isTemplate' }] };
  const m = migrate(parsed);
  if (!m.ok) return { ok: false, errors: [{ path: 'schemaVersion', key: m.key }] };
  return validate(m.value);
}
