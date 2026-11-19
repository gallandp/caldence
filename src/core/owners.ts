import { newId } from './edit';
import type { Area, OwnerHalf, OwnerMode, Team, Workspace } from './model';
import { validate, type Result } from './validate';

/**
 * Owner tandems (#331): a team (product) or area (platform) has a business and a technical owner,
 * or deliberately only one of them. An owner is a member of the unit whose role is marked as one
 * half of the tandem (`Role.owner`); the unit's `ownerMode` says which halves it wants.
 */

export const OWNER_HALVES: readonly OwnerHalf[] = ['business', 'technical'];

type Unit = Pick<Team | Area, 'members' | 'ownerMode'>;

export const ownerMode = (unit: Unit): OwnerMode => unit.ownerMode ?? 'both';

/** The halves a unit wants: both in a tandem, else the one it chose. */
export function wantedHalves(unit: Unit): OwnerHalf[] {
  const mode = ownerMode(unit);
  return mode === 'both' ? [...OWNER_HALVES] : [mode];
}

/** Tandems only show once a role is marked as a half; files without such roles look as before. */
export const hasOwnerRoles = (ws: Workspace): boolean => ws.roles.some((r) => r.owner);

/** The people holding a role of this half in the unit, each once, in member order. */
export function ownersOf(ws: Workspace, unit: Unit, half: OwnerHalf): string[] {
  const roles = new Set(ws.roles.filter((r) => r.owner === half).map((r) => r.id));
  return [...new Set(unit.members.filter((m) => roles.has(m.roleId)).map((m) => m.personId))];
}

export interface OwnerSlot {
  half: OwnerHalf;
  /** Empty: a wanted owner is missing (an "Owner-Lücke"). */
  personIds: string[];
}

/** The wanted owners of a unit; a half the unit does not want is left out, even if it is held. */
export function ownerSlots(ws: Workspace, unit: Unit): OwnerSlot[] {
  if (!hasOwnerRoles(ws)) return [];
  return wantedHalves(unit).map((half) => ({ half, personIds: ownersOf(ws, unit, half) }));
}

/** Wanted owners nobody holds. A unit set to one half never misses the other. */
export const ownerGaps = (ws: Workspace, unit: Unit): number =>
  ownerSlots(ws, unit).filter((s) => s.personIds.length === 0).length;

/** Names of the wanted owners, e.g. to find a product by its Product Owner. */
export function ownerNames(ws: Workspace, unit: Unit): string[] {
  const ids = ownerSlots(ws, unit).flatMap((s) => s.personIds);
  return ids.map((id) => ws.people.find((p) => p.id === id)?.name ?? '').filter(Boolean);
}

/**
 * Sets which owners a team or area wants. Nobody is removed: the other half stays a member, so
 * switching back to the tandem shows them again. 'both' is the default and leaves no entry.
 */
export function setOwnerMode(ws: Workspace, unitId: string, mode: OwnerMode): Result<Workspace> {
  const out = structuredClone(ws);
  const unit: Unit | undefined =
    out.teams.find((t) => t.id === unitId) ?? out.areas.find((a) => a.id === unitId);
  if (!unit) return { ok: false, errors: [{ path: `units.${unitId}`, key: 'error.ref.unknown' }] };
  if (mode === 'both') delete unit.ownerMode;
  else unit.ownerMode = mode;
  return validate(out);
}

/**
 * The role a new owner of this half gets in a team or area: a marked role already used at that
 * level, else a marked role not used at the other level, else a new one named `name` (e.g.
 * "Technischer Product Owner"), so product and platform owners keep their own roles.
 */
export function ownerRole(
  ws: Workspace,
  half: OwnerHalf,
  level: 'team' | 'area',
  name: string,
  colour: string,
): [Workspace, string] {
  const marked = ws.roles.filter((r) => r.owner === half);
  const usedIn = (units: Unit[], roleId: string) =>
    units.some((u) => u.members.some((m) => m.roleId === roleId));
  const here: Unit[] = level === 'team' ? ws.teams : ws.areas;
  const there: Unit[] = level === 'team' ? ws.areas : ws.teams;
  const found = marked.find((r) => usedIn(here, r.id)) ?? marked.find((r) => !usedIn(there, r.id));
  if (found) return [ws, found.id];
  const id = newId(
    'r',
    ws.roles.map((r) => r.id),
  );
  return [{ ...ws, roles: [...ws.roles, { id, name, colour, owner: half }] }, id];
}
