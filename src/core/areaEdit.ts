import type { Area, Workspace } from './model';
import { record } from './record';
import type { Result } from './validate';

const unknown = <T>(areaId: string): Result<T> => ({
  ok: false,
  errors: [{ path: `areas.${areaId}`, key: 'error.ref.unknown' }],
});

/** A copy of the workspace with one area changed; refuses an unknown area. */
function mapArea(ws: Workspace, areaId: string, fn: (a: Area) => void): Result<Workspace> {
  if (!ws.areas.some((a) => a.id === areaId)) return unknown(areaId);
  const out = structuredClone(ws);
  for (const a of out.areas) if (a.id === areaId) fn(a);
  return { ok: true, value: out };
}

function withHours(a: Area, personId: string, hours: number | null): void {
  const next = Object.assign(record<number>(), a.memberHours);
  if (hours === null) delete next[personId];
  else next[personId] = hours;
  a.memberHours = next;
}

/**
 * Gives a person one role at area level (replacing the roles they had there), or none with
 * `roleId` null. Their area hours stay.
 */
export function setAreaRole(
  ws: Workspace,
  areaId: string,
  personId: string,
  roleId: string | null,
): Result<Workspace> {
  return mapArea(ws, areaId, (a) => {
    const at = a.members.findIndex((m) => m.personId === personId);
    const rest = a.members.filter((m) => m.personId !== personId);
    if (roleId !== null) rest.splice(at < 0 ? rest.length : at, 0, { personId, roleId });
    a.members = rest;
  });
}

/** Sets a person's weekly hours in the area. */
export function setAreaHours(
  ws: Workspace,
  areaId: string,
  personId: string,
  hours: number,
): Result<Workspace> {
  return mapArea(ws, areaId, (a) => withHours(a, personId, hours));
}

/** Adds a person to the area with a role and weekly hours (a person already there gets both). */
export function addAreaPerson(
  ws: Workspace,
  areaId: string,
  personId: string,
  roleId: string,
  hours: number,
): Result<Workspace> {
  const set = setAreaRole(ws, areaId, personId, roleId);
  return set.ok ? setAreaHours(set.value, areaId, personId, hours) : set;
}

/** Removes a person's area roles and area hours; their teams stay as they are. */
export function removeFromArea(ws: Workspace, areaId: string, personId: string): Result<Workspace> {
  return mapArea(ws, areaId, (a) => {
    a.members = a.members.filter((m) => m.personId !== personId);
    withHours(a, personId, null);
  });
}
