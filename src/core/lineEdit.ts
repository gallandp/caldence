import { newId } from './edit';
import { removeSkill } from './line';
import { BUILT_IN_LINE_LEVELS, isCompanyLevel, lineLevels } from './lineLevels';
import { lineKind } from './lineStaff';
import type { LineKind, LineLevel, LineUnit, Person, Workspace } from './model';
import { validate, type Result } from './validate';

/**
 * Editing the line (#316): line units, skill families and skills, and the line fields of a
 * person. Every edit works on a copy and is validated, so a name used twice or a fourth level is
 * refused with the validator's message.
 */

const fail = <T>(path: string, key: string): Result<T> => ({ ok: false, errors: [{ path, key }] });
const checked = <T>(ws: Workspace, value: T): Result<T> => {
  const v = validate(ws);
  return v.ok ? { ok: true, value } : v;
};
const named = (name: string, path: string): Result<string> =>
  name.trim() === '' ? fail(path, 'error.required') : { ok: true, value: name.trim() };

export function addLineUnit(
  ws: Workspace,
  name: string,
  parentId?: string,
): Result<[Workspace, string]> {
  const units = ws.lineUnits ?? [];
  const n = named(name, `lineUnits.${units.length}.name`);
  if (!n.ok) return n;
  const out = structuredClone(ws);
  const id = newId(
    'lu',
    units.map((u) => u.id),
  );
  const unit: LineUnit = { id, name: n.value, ...(parentId ? { parentId } : {}) };
  out.lineUnits = [...(out.lineUnits ?? []), unit];
  return checked(out, [out, id]);
}

/** Changes a line unit; `null` clears a field (top level, no manager, no skill family). */
export function updateLineUnit(
  ws: Workspace,
  unitId: string,
  patch: {
    name?: string;
    parentId?: string | null;
    managerPersonId?: string | null;
    skillFamilyId?: string | null;
    /** The level (#399); `null` goes back to deriving it. */
    kind?: LineKind | null;
  },
): Result<Workspace> {
  const out = structuredClone(ws);
  const i = out.lineUnits?.findIndex((u) => u.id === unitId) ?? -1;
  if (i < 0) return fail('lineUnits', 'error.ref.unknown');
  const unit = out.lineUnits![i]!;
  if (patch.name !== undefined) {
    const n = named(patch.name, `lineUnits.${i}.name`);
    if (!n.ok) return n;
    unit.name = n.value;
  }
  for (const key of ['parentId', 'managerPersonId', 'skillFamilyId', 'kind'] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null) delete unit[key];
    else (unit as Record<typeof key, string>)[key] = value;
  }
  linkCompany(out, unit);
  return checked(out, out);
}

/**
 * A company unit stands for a company of the file (#399): one of the same name, else a new one;
 * renaming the unit renames its company. Any other level drops the link, the company stays.
 */
function linkCompany(ws: Workspace, unit: LineUnit): void {
  if (!isCompanyLevel(ws.settings, unit.kind)) {
    delete unit.companyId;
    return;
  }
  const companies = (ws.companies ??= []);
  const key = unit.name.trim().toLowerCase();
  const same = companies.find((c) => c.name.trim().toLowerCase() === key);
  const linked = companies.find((c) => c.id === unit.companyId);
  if (same) unit.companyId = same.id;
  else if (linked) linked.name = unit.name;
  else {
    const id = newId(
      'co',
      companies.map((c) => c.id),
    );
    companies.push({ id, name: unit.name });
    unit.companyId = id;
  }
}

/**
 * Sets the line's own levels (#408), top-down. The first time, every unit keeps the level it shows
 * (derived ones are stored) and the names of `lineLevelNames` move onto the built-in levels, so the
 * line looks as before. A level that units are still on cannot be removed.
 */
export function setLineLevels(ws: Workspace, levels: LineLevel[]): Result<Workspace> {
  const out = structuredClone(ws);
  const units = out.lineUnits ?? [];
  const kinds = new Map(units.map((u) => [u.id, lineKind(ws, u.id)] as const));
  const keep = new Set(levels.map((l) => l.id));
  if ([...kinds.values()].some((k) => !keep.has(k)))
    return fail('settings.lineLevels', 'error.line.levelInUse');
  const fromNames = ws.settings.lineLevels === undefined ? ws.settings.lineLevelNames : undefined;
  out.settings.lineLevels = levels.map((l) => {
    const builtIn = (BUILT_IN_LINE_LEVELS as readonly string[]).includes(l.id);
    const name = l.name?.trim() || (builtIn ? fromNames?.[l.id as 'group']?.trim() : undefined);
    return { id: l.id, ...(name ? { name } : {}), ...(l.company ? { company: true } : {}) };
  });
  delete out.settings.lineLevelNames;
  for (const u of units) {
    u.kind = kinds.get(u.id)!;
    linkCompany(out, u);
  }
  return checked(out, out);
}

/** A new level id that is none of the levels' ids. */
export const newLineLevelId = (ws: Workspace): string =>
  newId(
    'll',
    lineLevels(ws.settings).map((l) => l.id),
  );

export function addSkillFamily(ws: Workspace, name: string): Result<[Workspace, string]> {
  const list = ws.skillFamilies ?? [];
  const n = named(name, `skillFamilies.${list.length}.name`);
  if (!n.ok) return n;
  const out = structuredClone(ws);
  const id = newId(
    'sf',
    list.map((f) => f.id),
  );
  out.skillFamilies = [...list.map((f) => ({ ...f })), { id, name: n.value }];
  return checked(out, [out, id]);
}

export function renameSkillFamily(
  ws: Workspace,
  familyId: string,
  name: string,
): Result<Workspace> {
  const out = structuredClone(ws);
  const i = out.skillFamilies?.findIndex((f) => f.id === familyId) ?? -1;
  if (i < 0) return fail('skillFamilies', 'error.ref.unknown');
  const n = named(name, `skillFamilies.${i}.name`);
  if (!n.ok) return n;
  out.skillFamilies![i]!.name = n.value;
  return checked(out, out);
}

export function addSkill(
  ws: Workspace,
  familyId: string,
  name: string,
): Result<[Workspace, string]> {
  const list = ws.skills ?? [];
  const n = named(name, `skills.${list.length}.name`);
  if (!n.ok) return n;
  const out = structuredClone(ws);
  const id = newId(
    'sk',
    list.map((s) => s.id),
  );
  out.skills = [...(out.skills ?? []), { id, name: n.value, familyId }];
  return checked(out, [out, id]);
}

export function renameSkill(ws: Workspace, skillId: string, name: string): Result<Workspace> {
  const out = structuredClone(ws);
  const i = out.skills?.findIndex((s) => s.id === skillId) ?? -1;
  if (i < 0) return fail('skills', 'error.ref.unknown');
  const n = named(name, `skills.${i}.name`);
  if (!n.ok) return n;
  out.skills![i]!.name = n.value;
  return checked(out, out);
}

/** Who uses a skill: people who have it and team demands that ask for it. */
export function skillUsage(ws: Workspace, skillId: string): { people: number; demands: number } {
  return {
    people: ws.people.filter((p) => p.skillIds?.includes(skillId)).length,
    demands: ws.teams.reduce(
      (n, t) => n + (t.demands ?? []).filter((d) => d.skillId === skillId).length,
      0,
    ),
  };
}

/**
 * What deleting a skill family touches (#389): its skills, the people who hold one of them, the
 * demands that ask for one, and the platforms and line units that name the family.
 */
export function familyUsage(
  ws: Workspace,
  familyId: string,
): { skills: number; people: number; demands: number; areas: number; lineUnits: number } {
  const ids = new Set((ws.skills ?? []).filter((s) => s.familyId === familyId).map((s) => s.id));
  return {
    skills: ids.size,
    people: ws.people.filter((p) => p.skillIds?.some((id) => ids.has(id))).length,
    demands: ws.teams.reduce(
      (n, t) => n + (t.demands ?? []).filter((d) => d.skillId && ids.has(d.skillId)).length,
      0,
    ),
    areas: ws.areas.filter((a) => a.skillFamilyId === familyId).length,
    lineUnits: (ws.lineUnits ?? []).filter((u) => u.skillFamilyId === familyId).length,
  };
}

/**
 * Merges skill `fromId` into `intoId`: people and demands with the first get the second (once),
 * and the first is deleted. For two names of the same thing ("JS" and "JavaScript").
 */
export function mergeSkill(ws: Workspace, fromId: string, intoId: string): Result<Workspace> {
  if (fromId === intoId || !ws.skills?.some((s) => s.id === intoId))
    return fail('skills', 'error.ref.unknown');
  const out = structuredClone(ws);
  for (const p of out.people)
    if (p.skillIds?.includes(fromId))
      p.skillIds = [...new Set(p.skillIds.map((id) => (id === fromId ? intoId : id)))];
  for (const t of out.teams)
    for (const d of t.demands ?? []) if (d.skillId === fromId) d.skillId = intoId;
  const merged = removeSkill(out, fromId);
  return checked(merged, merged);
}

type LineFields = Pick<Person, 'lineUnitId' | 'contractFte' | 'companyId' | 'skillIds'>;

/** Sets a person's line fields; `null` clears one (no line unit, full contract, no company). */
export function updateLinePerson(
  ws: Workspace,
  personId: string,
  patch: { [K in keyof LineFields]?: LineFields[K] | null },
): Result<Workspace> {
  const out = structuredClone(ws);
  const person = out.people.find((p) => p.id === personId);
  if (!person) return fail('people', 'error.ref.unknown');
  for (const key of ['lineUnitId', 'contractFte', 'companyId', 'skillIds'] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null || (key === 'skillIds' && (value as string[]).length === 0))
      delete person[key];
    else (person as unknown as Record<string, unknown>)[key] = value;
  }
  // A pseudonymous person exists only through a line unit (#333).
  if (person.pseudonymous && person.lineUnitId === undefined) delete person.pseudonymous;
  return checked(out, out);
}
