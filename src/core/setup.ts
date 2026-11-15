import type { ISODate } from './date';
import { addItem, addTeam, updateSettings } from './edit';
import type { Settings, Workspace } from './model';
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

  const checked = validate(out);
  if (!checked.ok) return checked;
  return { ok: true, value: [checked.value, teamId] };
}
