import type { ISODate } from './date';
import {
  addArea,
  addItem,
  addTeam,
  renameArea,
  renameLine,
  renameOrganisation,
  updateSettings,
} from './edit';
import type { LevelNames } from './levels';
import { addLineUnit } from './lineEdit';
import { ORG_UNIT, type Settings, type Workspace } from './model';
import { applyTemplate, areaRoleIds, type Template } from './template';
import { validate, type Result } from './validate';

/**
 * What the wizard sets up (#387): one team (product owner), an area with its teams (platform
 * owner / head of department), the product organisation (agile coach) or line teams (line manager).
 */
export type SetupMode = 'team' | 'area' | 'org' | 'line';

export interface SetupMember {
  name: string;
  /** A role id of the template, or of the workspace when there is no template. */
  roleId: string;
}

export interface SetupInput {
  template: Template | null;
  name: string;
  /** The cadence starts on this date, or on the next day with the template's start weekday. */
  start: ISODate;
  members: SetupMember[];
  /** Weekly hours in the new team by name (trimmed, lower case), for people already in the file. */
  hours?: Record<string, number>;
  /** Workspace settings confirmed in the wizard, such as time zone, region and horizon. */
  settings?: Partial<Settings>;
}

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * Creates a team from a template (or an empty one) together with its people and memberships.
 * People with the same name are reused, blank names and repeated memberships are skipped.
 */
export function setupTeam(ws: Workspace, input: SetupInput): Result<[Workspace, string]> {
  let out: Workspace;
  let teamId: string;
  const base = input.settings ? updateSettings(ws, input.settings) : ws;
  if (input.template) {
    const r = applyTemplate(base, input.template, { name: input.name, today: input.start });
    if (!r.ok) return r;
    [out, teamId] = r.value;
  } else {
    [out, teamId] = addTeam(base, input.name, input.start);
  }

  // Template role ids map to workspace roles by name, as applyTemplate maps them.
  const roleFor = (id: string): string | undefined => {
    if (!input.template) return out.roles.some((r) => r.id === id) ? id : undefined;
    const name = input.template.roles.find((r) => r.id === id)?.name;
    return name === undefined ? undefined : out.roles.find((r) => norm(r.name) === norm(name))?.id;
  };

  // People with an area-only role (Release Train Engineer) belong to the area, not the team.
  const areaRoles = new Set(
    input.template ? [...areaRoleIds(input.template)].map(roleFor).filter((id) => id) : [],
  );

  const toArea = new Set<string>();
  for (const member of input.members) {
    const name = member.name.trim();
    const roleId = roleFor(member.roleId);
    if (name === '' || roleId === undefined) continue;
    let personId = out.people.find((p) => norm(p.name) === norm(name))?.id;
    if (personId === undefined) {
      [out, personId] = addItem(out, 'people', { name });
    }
    // addItem copies the workspace, so look the unit up afresh.
    const area = out.areas.find((a) => a.teamIds.includes(teamId));
    const unit = area && areaRoles.has(roleId) ? area : out.teams.find((t) => t.id === teamId)!;
    if (unit.members.some((m) => m.personId === personId && m.roleId === roleId)) continue;
    unit.members.push({ personId, roleId });
    if (unit === area) toArea.add(personId);
  }
  // A missing area entry means 0 h; someone who is only in the area works there full time.
  const team = out.teams.find((t) => t.id === teamId)!;
  const area = out.areas.find((a) => a.teamIds.includes(teamId));
  for (const id of toArea)
    if (area && !team.members.some((m) => m.personId === id))
      area.memberHours[id] ??= out.settings.hoursPerWeek;
  // People already in another team get the hours asked for here, not the default once more.
  for (const person of out.people) {
    const key = norm(person.name);
    if (!input.hours || !Object.hasOwn(input.hours, key)) continue;
    if (team.members.some((m) => m.personId === person.id))
      team.memberHours[person.id] = input.hours[key]!;
  }

  const checked = validate(out);
  if (!checked.ok) return checked;
  return { ok: true, value: [checked.value, teamId] };
}

/** Names typed into one field, separated by line breaks or commas; blanks and repeats dropped. */
export function splitNames(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\n,]/)) {
    const name = raw.trim();
    if (name !== '' && !out.some((n) => norm(n) === norm(name))) out.push(name);
  }
  return out;
}

const fail = <T>(path: string, key: string): Result<T> => ({ ok: false, errors: [{ path, key }] });

export interface StructureInput {
  template: Template | null;
  start: ISODate;
  /** The organisation's name (#313); blank leaves it unnamed. */
  organisation?: string;
  levelNames?: LevelNames;
  /** Areas with the names of their teams. */
  areas: { name: string; teams: string[] }[];
  settings?: Partial<Settings>;
}

/**
 * Sets up a part of the product organisation in one go (#387): areas with their teams, every team
 * from the same template (or empty), without people. A template with its own area level (SAFe)
 * gives each area its own area cadence and meetings. Returns the unit to show: the organisation
 * when there is more than one area or it got a name, else the area.
 */
export function setupStructure(ws: Workspace, input: StructureInput): Result<[Workspace, string]> {
  if (input.areas.length === 0) return fail('areas', 'error.required');
  let out = updateSettings(ws, {
    ...input.settings,
    ...(input.levelNames ? { levelNames: input.levelNames } : {}),
  });
  const orgName = input.organisation?.trim() ?? '';
  if (orgName !== '') {
    const r = renameOrganisation(out, orgName);
    if (!r.ok) return r;
    out = r.value;
  }
  if (!input.areas.some((a) => a.teams.some((t) => t.trim() !== '')))
    return fail('teams', 'error.required');
  let firstArea = '';
  for (const [i, area] of input.areas.entries()) {
    const name = area.name.trim();
    if (name === '') return fail(`areas.${i}.name`, 'error.required');
    let areaId: string | undefined;
    const teamIds: string[] = [];
    for (const teamName of area.teams.map((t) => t.trim()).filter((t) => t !== '')) {
      let teamId: string;
      if (input.template) {
        const r = applyTemplate(out, input.template, {
          name: teamName,
          today: input.start,
          joinArea: areaId ?? null,
        });
        if (!r.ok) return r;
        [out, teamId] = r.value;
        // A template with an area level made a new area for the first team.
        areaId ??= out.areas.find((a) => a.teamIds.includes(teamId))?.id;
      } else {
        [out, teamId] = addTeam(out, teamName, input.start);
      }
      teamIds.push(teamId);
    }
    if (areaId !== undefined) {
      const r = renameArea(out, areaId, name);
      if (!r.ok) return r;
      out = r.value;
    } else {
      const r = addArea(out, name, teamIds);
      if (!r.ok) return r;
      [out, areaId] = r.value;
    }
    if (i === 0) firstArea = areaId;
  }
  const checked = validate(out);
  if (!checked.ok) return checked;
  const show = input.areas.length > 1 || orgName !== '' ? ORG_UNIT : firstArea;
  return { ok: true, value: [checked.value, show] };
}

export interface LineSetupInput {
  /**
   * The line root's own name (#417), e.g. the group of the companies; blank keeps the current one.
   * Never the product organisation's name: that may differ from every company's.
   */
  lineName?: string;
  /** A group above the line teams (a specialist group); blank puts them at the top. */
  group?: string;
  teams: string[];
  settings?: Partial<Settings>;
}

/**
 * Sets up line teams (#387), optionally under one group. Returns the id of the line unit to show:
 * the group, or the first line team.
 */
export function setupLine(ws: Workspace, input: LineSetupInput): Result<[Workspace, string]> {
  const teams = input.teams.map((t) => t.trim()).filter((t) => t !== '');
  if (teams.length === 0) return fail('lineUnits', 'error.required');
  let out = input.settings ? updateSettings(ws, input.settings) : ws;
  const lineName = input.lineName?.trim() ?? '';
  if (lineName !== '') {
    const r = renameLine(out, lineName);
    if (!r.ok) return r;
    out = r.value;
  }
  let groupId: string | undefined;
  if (input.group?.trim()) {
    const r = addLineUnit(out, input.group);
    if (!r.ok) return r;
    [out, groupId] = r.value;
  }
  let first = '';
  for (const name of teams) {
    const r = addLineUnit(out, name, groupId);
    if (!r.ok) return r;
    let id: string;
    [out, id] = r.value;
    first ||= id;
  }
  return { ok: true, value: [out, groupId ?? first] };
}
