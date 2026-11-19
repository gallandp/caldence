import { addDays, diffDays, weekday, type ISODate } from './date';
import { newId, unitIds } from './edit';
import { migrate } from './migrate';
import type { LevelNames } from './levels';
import {
  CURRENT_SCHEMA,
  emptyWorkspace,
  type Area,
  type CalEvent,
  type Category,
  type Cycle,
  type Participant,
  type Role,
  type Rule,
  type Team,
  type Workspace,
} from './model';
import { LIMITS } from './limits';
import { isValidId, validate, type Result, type ValidationError } from './validate';

export interface Template {
  kind: 'caldence-template';
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  roles: Role[];
  categories: Category[];
  team: Omit<Team, 'id' | 'members' | 'memberHours' | 'contextOverrides' | 'templateId'>;
  /**
   * Optional area above the team, e.g. a Release Train with its PI events. Applying the template
   * creates it once; a second team from the same template joins it. Its roles are the template
   * roles that no team meeting uses.
   */
  area?: TemplateArea;
}

export interface TemplateArea extends Pick<Area, 'name' | 'cycles' | 'events'> {
  cadence: NonNullable<Area['cadence']>;
  /** Level names the workspace takes when this is its first area and it has none yet. */
  levelNames?: LevelNames;
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
  if (isObj(team) && ('members' in team || 'memberHours' in team || 'contextOverrides' in team))
    return fail([{ path: 'team.members', key: 'template.error.personal' }]);
  // Regions belong to a workspace, never to a template.
  if ('customRegions' in input)
    return fail([{ path: 'customRegions', key: 'template.error.notTemplate' }]);
  // Areas hold people and their hours; a template is one team without people.
  if ('areas' in input) return fail([{ path: 'areas', key: 'template.error.notTemplate' }]);
  const area = input.area;
  if (isObj(area) && ('members' in area || 'memberHours' in area))
    return fail([{ path: 'area.members', key: 'template.error.personal' }]);
  if (isObj(area) && 'teamIds' in area)
    return fail([{ path: 'area.teamIds', key: 'template.error.notTemplate' }]);

  const m = migrate(input);
  if (!m.ok) return fail([{ path: 'schemaVersion', key: m.key }]);
  // Migrations may invent a workspace id; a template keeps its own.
  // Templates share the workspace schema version; workspace-only fields added on the way are dropped.
  const value: Record<string, unknown> = { ...(m.value as Record<string, unknown>), id: input.id };
  delete value.customRegions;
  delete value.areas;

  const errors: ValidationError[] = [];
  if (value.id === undefined) errors.push({ path: 'id', key: 'error.required' });
  else if (typeof value.id !== 'string' || value.id.trim() === '')
    errors.push({ path: 'id', key: 'error.type' });
  else if (!isValidId(value.id)) errors.push({ path: 'id', key: 'error.id.invalid' });
  if (value.name === undefined) errors.push({ path: 'name', key: 'error.required' });
  else if (typeof value.name !== 'string' || value.name.trim() === '')
    errors.push({ path: 'name', key: 'error.type' });
  if (value.description === undefined) errors.push({ path: 'description', key: 'error.required' });
  else if (typeof value.description !== 'string')
    errors.push({ path: 'description', key: 'error.type' });
  else if (value.description.length > LIMITS.descriptionChars)
    errors.push({ path: 'description', key: 'error.text.tooLong' });

  const base = emptyWorkspace('2000-01-01');
  const tplArea = value.area === undefined ? undefined : isObj(value.area) ? value.area : null;
  if (tplArea === null) errors.push({ path: 'area', key: 'error.type' });
  if (tplArea && tplArea.cadence === undefined)
    errors.push({ path: 'area.cadence', key: 'error.required' });
  const temp = {
    schemaVersion: value.schemaVersion,
    id: 'template',
    settings:
      tplArea?.levelNames === undefined
        ? base.settings
        : { ...base.settings, levelNames: tplArea.levelNames },
    roles: value.roles,
    people: [],
    categories: value.categories,
    teams:
      value.team === undefined
        ? undefined
        : [{ ...(value.team as object), id: 'team', members: [], memberHours: {} }],
    areas: tplArea
      ? [
          {
            ...tplArea,
            levelNames: undefined,
            id: 'area',
            teamIds: ['team'],
            members: [],
            memberHours: {},
          },
        ]
      : [],
    customRegions: [],
  };
  const r = validate(JSON.parse(JSON.stringify(temp)));
  if (!r.ok) {
    for (const e of r.errors) {
      if (e.path === 'teams' || e.path === 'areas') continue;
      errors.push({
        ...e,
        path: e.path
          .replace(/^teams\.0(?=\.|$)/, 'team')
          .replace(/^areas\.0(?=\.|$)/, 'area')
          .replace(/^settings\.levelNames/, 'area.levelNames'),
      });
    }
    if (value.team === undefined) errors.push({ path: 'team', key: 'error.required' });
  }
  if (errors.length > 0) return fail(errors);
  return { ok: true, value: value as unknown as Template };
}

export function loadTemplate(text: string): Result<Template> {
  if (text.length > LIMITS.fileChars) return fail([{ path: '', key: 'error.file.tooLarge' }]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail([{ path: '', key: 'error.file.json' }]);
  }
  return validateTemplate(parsed);
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Template roles of the area alone: roles no team meeting uses (e.g. Release Train Engineer). */
export function areaRoleIds(template: Template): Set<string> {
  if (!template.area) return new Set();
  const roles = (ps: Participant[]) =>
    ps.flatMap((p) => (p.roleId !== undefined ? [p.roleId] : []));
  const inTeam = new Set(template.team.events.flatMap((e) => roles(e.participants)));
  const own = template.area.events.flatMap((e) =>
    roles(e.participants.filter((p) => !p.fromTeams)),
  );
  return new Set(own.filter((id) => !inTeam.has(id)));
}

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

/**
 * A second team from a template with an area joins the area that holds the first one.
 * If its teams were all removed, the empty area with the template's name is taken again.
 */
function joinedArea(ws: Workspace, tpl: Template): Area | undefined {
  if (!tpl.area) return undefined;
  const name = norm(tpl.area.name);
  return (
    ws.areas.find((a) =>
      a.teamIds.some((id) => ws.teams.find((t) => t.id === id)?.templateId === tpl.id),
    ) ?? ws.areas.find((a) => a.teamIds.length === 0 && norm(a.name) === name)
  );
}

/** Days the template's dates move so that its cadence starts on or after `today`. */
function templateShift(tpl: Template, joined: Area | undefined, today: ISODate): number {
  if (joined?.cadence && tpl.area) {
    // Keep the new team's iterations in step with the area's increments: start with the first
    // increment on or after today.
    const period = joined.cadence.lengthWeeks * 7;
    const behind = diffDays(today, joined.cadence.start);
    const periods = behind > 0 ? Math.ceil(behind / period) : 0;
    return diffDays(addDays(joined.cadence.start, periods * period), tpl.area.cadence.start);
  }
  const start = tpl.team.cadence.start;
  return diffDays(addDays(today, (weekday(start) - weekday(today) + 7) % 7), start);
}

/**
 * The date the team's cadence starts on when the template is applied from `from`, and the
 * name of the area whose increments it keeps in step with, if any.
 */
export function templateStart(
  ws: Workspace,
  tpl: Template,
  from: ISODate,
): { start: ISODate; area?: string } {
  const joined = joinedArea(ws, tpl);
  const start = addDays(tpl.team.cadence.start, templateShift(tpl, joined, from));
  return joined?.cadence ? { start, area: joined.name } : { start };
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

  const joined = joinedArea(out, tpl);
  const cadenceStart = tpl.team.cadence.start;
  const shift = templateShift(tpl, joined, opts.today);

  const shiftCycles = (cycles: Cycle[]): Cycle[] =>
    cycles.map((c) => ({
      ...c,
      milestones: c.milestones.map((m) => ({ ...m, date: addDays(m.date, shift) })),
    }));
  const mapEvents = (events: CalEvent[]): CalEvent[] =>
    events.map((e) => ({
      ...e,
      categoryId: catMap.get(e.categoryId) ?? e.categoryId,
      rule: shiftRule(e.rule, shift),
      participants: e.participants.map((p) =>
        p.roleId === undefined ? p : { ...p, roleId: roleMap.get(p.roleId) ?? p.roleId },
      ),
    }));

  const teamId = newId('t', unitIds(out));
  const team: Team = {
    ...tpl.team,
    id: teamId,
    name: opts.name,
    templateId: tpl.id,
    members: [],
    memberHours: {},
    cadence: { ...tpl.team.cadence, start: addDays(cadenceStart, shift) },
    cycles: shiftCycles(tpl.team.cycles),
    events: mapEvents(tpl.team.events),
  };
  out.teams.push(team);

  if (joined) joined.teamIds.push(teamId);
  else if (tpl.area) {
    const { levelNames, ...area } = tpl.area;
    if (levelNames && out.areas.length === 0 && !out.settings.levelNames)
      out.settings.levelNames = levelNames;
    out.areas.push({
      ...area,
      id: newId('a', unitIds(out)),
      teamIds: [teamId],
      cadence: { ...area.cadence, start: addDays(area.cadence.start, shift) },
      members: [],
      memberHours: {},
      cycles: shiftCycles(area.cycles),
      events: mapEvents(area.events),
    });
  }

  const r = validate(out);
  if (!r.ok) return fail(r.errors);
  return { ok: true, value: [r.value, teamId] };
}

/**
 * A template of the team. When the team is in an area, the template also holds the area's name,
 * cadence, cycles and meetings and the file's level names, so applying it rebuilds both levels.
 * People, area members, hours, demands and team ids are never part of it.
 */
export function teamToTemplate(
  ws: Workspace,
  teamId: string,
  opts: { id: string; name: string; description: string },
): Template {
  const team = ws.teams.find((t) => t.id === teamId);
  if (!team) throw new Error(`unknown team ${teamId}`);
  const area = ws.areas.find((a) => a.teamIds.includes(teamId));
  // A template has no people: meetings keep only their roles (#285).
  const roleOnly = (list: CalEvent[]): CalEvent[] =>
    list.map((e) => ({ ...e, participants: e.participants.filter((p) => p.roleId !== undefined) }));
  const events = [...team.events, ...(area?.events ?? [])];
  const roleIds = new Set([
    ...events.flatMap((e) =>
      e.participants.flatMap((p) => (p.roleId !== undefined ? [p.roleId] : [])),
    ),
    ...team.members.map((m) => m.roleId),
  ]);
  const catIds = new Set(events.map((e) => e.categoryId));
  const rest = structuredClone({ ...team, events: roleOnly(team.events) }) as unknown as Record<
    string,
    unknown
  >;
  delete rest.id;
  delete rest.members;
  delete rest.memberHours;
  delete rest.contextOverrides;
  delete rest.templateId;
  // Demands name skills of this file; a template has no line data (#315).
  delete rest.demands;
  const template: Template = {
    kind: 'caldence-template',
    schemaVersion: CURRENT_SCHEMA,
    id: opts.id,
    name: opts.name,
    description: opts.description,
    roles: structuredClone(ws.roles.filter((r) => roleIds.has(r.id))),
    categories: structuredClone(ws.categories.filter((c) => catIds.has(c.id))),
    team: rest as Template['team'],
  };
  if (area) {
    template.area = {
      name: area.name,
      // A template area needs a cadence; an area without its own takes the team's.
      cadence: structuredClone(area.cadence ?? team.cadence),
      cycles: structuredClone(area.cycles),
      events: structuredClone(roleOnly(area.events)),
      ...(ws.settings.levelNames ? { levelNames: structuredClone(ws.settings.levelNames) } : {}),
    };
  }
  return template;
}
