import { addDays, diffDays, weekday, type ISODate } from './date';
import { newId } from './edit';
import { migrate } from './migrate';
import {
  CURRENT_SCHEMA,
  emptyWorkspace,
  type Category,
  type Role,
  type Rule,
  type Team,
  type Workspace,
} from './model';
import { validate, type Result, type ValidationError } from './validate';

export interface Template {
  kind: 'caldence-template';
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  roles: Role[];
  categories: Category[];
  team: Omit<Team, 'id' | 'members' | 'templateId'>;
}

const fail = <T>(errors: ValidationError[]): Result<T> => ({ ok: false, errors });
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function validateTemplate(input: unknown): Result<Template> {
  if (!isObj(input) || input.kind !== 'caldence-template' || 'settings' in input) {
    return fail([{ path: 'kind', key: 'template.error.notTemplate' }]);
  }
  const team = input.team;
  if ('people' in input) return fail([{ path: 'people', key: 'template.error.personal' }]);
  if (isObj(team) && 'members' in team)
    return fail([{ path: 'team.members', key: 'template.error.personal' }]);
  // Regions belong to a workspace, never to a template.
  if ('customRegions' in input)
    return fail([{ path: 'customRegions', key: 'template.error.notTemplate' }]);

  const m = migrate(input);
  if (!m.ok) return fail([{ path: 'schemaVersion', key: m.key }]);
  // Migrations may invent a workspace id; a template keeps its own.
  // Templates share the workspace schema version; workspace-only fields added on the way are dropped.
  const value: Record<string, unknown> = { ...(m.value as Record<string, unknown>), id: input.id };
  delete value.customRegions;

  const errors: ValidationError[] = [];
  if (value.id === undefined) errors.push({ path: 'id', key: 'error.required' });
  else if (typeof value.id !== 'string' || value.id.trim() === '')
    errors.push({ path: 'id', key: 'error.type' });
  if (value.name === undefined) errors.push({ path: 'name', key: 'error.required' });
  else if (typeof value.name !== 'string' || value.name.trim() === '')
    errors.push({ path: 'name', key: 'error.type' });
  if (value.description === undefined) errors.push({ path: 'description', key: 'error.required' });
  else if (typeof value.description !== 'string')
    errors.push({ path: 'description', key: 'error.type' });

  const base = emptyWorkspace('2000-01-01');
  const temp = {
    schemaVersion: value.schemaVersion,
    id: 'template',
    settings: base.settings,
    roles: value.roles,
    people: [],
    categories: value.categories,
    teams:
      value.team === undefined
        ? undefined
        : [{ ...(value.team as object), id: 'team', members: [] }],
    customRegions: [],
  };
  const r = validate(temp);
  if (!r.ok) {
    for (const e of r.errors) {
      if (e.path === 'teams') continue;
      errors.push({ ...e, path: e.path.replace(/^teams\.0(?=\.|$)/, 'team') });
    }
    if (value.team === undefined) errors.push({ path: 'team', key: 'error.required' });
  }
  if (errors.length > 0) return fail(errors);
  return { ok: true, value: value as unknown as Template };
}

export function loadTemplate(text: string): Result<Template> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail([{ path: '', key: 'error.file.json' }]);
  }
  return validateTemplate(parsed);
}

const norm = (s: string): string => s.trim().toLowerCase();

function shiftRule(rule: Rule, shift: number): Rule {
  switch (rule.type) {
    case 'every-n-weeks':
      return { ...rule, anchor: addDays(rule.anchor, shift) };
    case 'once':
      return { ...rule, date: addDays(rule.date, shift) };
    default:
      return rule;
  }
}

export function applyTemplate(
  ws: Workspace,
  template: Template,
  opts: { name: string; today: ISODate },
): Result<[Workspace, string]> {
  const out = structuredClone(ws);
  const tpl = structuredClone(template);

  /** Maps template ids to workspace ids, reusing items with the same name. */
  const mapItems = (kind: 'roles' | 'categories', prefix: string): Map<string, string> => {
    const map = new Map<string, string>();
    for (const item of tpl[kind]) {
      const list: { id: string; name: string }[] = out[kind];
      const found = list.find((x) => norm(x.name) === norm(item.name));
      if (found) map.set(item.id, found.id);
      else {
        const id = newId(
          prefix,
          list.map((x) => x.id),
        );
        out[kind].push({ ...item, id });
        map.set(item.id, id);
      }
    }
    return map;
  };
  const roleMap = mapItems('roles', 'r');
  const catMap = mapItems('categories', 'c');

  const cadenceStart = tpl.team.cadence.start;
  const wd = weekday(cadenceStart);
  let newStart = opts.today;
  while (weekday(newStart) !== wd) newStart = addDays(newStart, 1);
  const shift = diffDays(newStart, cadenceStart);

  const teamId = newId(
    't',
    out.teams.map((t) => t.id),
  );
  const team: Team = {
    ...tpl.team,
    id: teamId,
    name: opts.name,
    templateId: tpl.id,
    members: [],
    cadence: { ...tpl.team.cadence, start: newStart },
    cycles: tpl.team.cycles.map((c) => ({
      ...c,
      milestones: c.milestones.map((m) => ({ ...m, date: addDays(m.date, shift) })),
    })),
    events: tpl.team.events.map((e) => ({
      ...e,
      categoryId: catMap.get(e.categoryId) ?? e.categoryId,
      rule: shiftRule(e.rule, shift),
      participants: e.participants.map((p) => ({
        ...p,
        roleId: roleMap.get(p.roleId) ?? p.roleId,
      })),
    })),
  };
  out.teams.push(team);

  const r = validate(out);
  if (!r.ok) return fail(r.errors);
  return { ok: true, value: [r.value, teamId] };
}

export function teamToTemplate(
  ws: Workspace,
  teamId: string,
  opts: { id: string; name: string; description: string },
): Template {
  const team = ws.teams.find((t) => t.id === teamId);
  if (!team) throw new Error(`unknown team ${teamId}`);
  const roleIds = new Set([
    ...team.events.flatMap((e) => e.participants.map((p) => p.roleId)),
    ...team.members.map((m) => m.roleId),
  ]);
  const catIds = new Set(team.events.map((e) => e.categoryId));
  const rest = structuredClone(team) as unknown as Record<string, unknown>;
  delete rest.id;
  delete rest.members;
  delete rest.templateId;
  return {
    kind: 'caldence-template',
    schemaVersion: CURRENT_SCHEMA,
    id: opts.id,
    name: opts.name,
    description: opts.description,
    roles: structuredClone(ws.roles.filter((r) => roleIds.has(r.id))),
    categories: structuredClone(ws.categories.filter((c) => catIds.has(c.id))),
    team: rest as Template['team'],
  };
}
