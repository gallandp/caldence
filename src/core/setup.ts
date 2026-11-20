import type { ISODate } from './date';
import { addItem, addTeam, updateSettings } from './edit';
import { placeHours, type PlaceHours } from './load';
import { ORG_UNIT, type Settings, type Workspace } from './model';
import { applyTemplate, areaRoleIds, type Template } from './template';
import { validate, type Result } from './validate';

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
  /**
   * Names (trimmed, lower case) whose hours in their other teams and areas are lowered in
   * proportion, so that all their hours stay within the Settings weekly hours (#446).
   */
  fit?: string[];
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
  for (const person of out.people)
    if (
      input.fit?.includes(norm(person.name)) &&
      team.members.some((m) => m.personId === person.id)
    )
      fitOthers(out, teamId, person.id, team.memberHours[person.id] ?? out.settings.hoursPerWeek);

  const checked = validate(out);
  if (!checked.ok) return checked;
  return { ok: true, value: [checked.value, teamId] };
}

/**
 * The hours a person keeps in their other teams and areas (all but `exceptId`) when they work
 * `here` hours in one more team (#446): lowered in proportion to fit the Settings weekly hours,
 * in half hours, with the half hours rounding leaves over going to the largest remainders so the
 * total is exactly what is left. Empty when nothing needs to change: the hours already fit, or
 * `here` alone takes all weekly hours (the over-hours flag says so instead). Places at 0 h stay.
 */
export function fittedHours(
  ws: Workspace,
  personId: string,
  here: number,
  exceptId?: string,
  org = '',
): PlaceHours[] {
  const weekly = ws.settings.hoursPerWeek;
  const places = placeHours(ws, personId, org).filter((p) => p.id !== exceptId && p.hours > 0);
  const others = places.reduce((sum, p) => sum + p.hours, 0);
  const room = weekly - here;
  if (room <= 0 || others <= room) return [];
  const halves = Math.floor(room * 2 + 1e-9);
  const exact = places.map((p) => (p.hours * halves) / others);
  const out = exact.map((x) => Math.floor(x + 1e-9));
  let left = halves - out.reduce((sum, n) => sum + n, 0);
  const order = exact.map((x, i) => i).sort((a, b) => (exact[b]! % 1) - (exact[a]! % 1) || a - b);
  for (const i of order) {
    if (left <= 0) break;
    out[i]!++;
    left--;
  }
  return places.map((p, i) => ({ ...p, hours: out[i]! / 2 }));
}

/** Writes the fitted hours of a person into their other teams and areas (#446). */
function fitOthers(ws: Workspace, teamId: string, personId: string, here: number): void {
  for (const place of fittedHours(ws, personId, here, teamId)) {
    const team = ws.teams.find((t) => t.id === place.id);
    if (team) team.memberHours[personId] = place.hours;
    const area = ws.areas.find((a) => a.id === place.id);
    if (area) area.memberHours[personId] = place.hours;
    if (place.id === ORG_UNIT && ws.organisation?.memberHours)
      ws.organisation.memberHours[personId] = place.hours;
  }
}
