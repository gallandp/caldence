// "Add to calendar" from Meetings & cadence: which unit the export page should preselect, and the
// person this browser exported last from this file (a Product Owner exports their own meetings
// again and again).
import { writable } from 'svelte/store';

const KEY = 'caldence.exportPerson';

/** Set right before Import / Export opens from Meetings & cadence; read once there. */
export const exportRequest = writable<{ teamId: string } | null>(null);

/** The person last exported from the file with this workspace id, if any. */
export function loadExportPerson(
  workspaceId: string,
  storage?: Pick<Storage, 'getItem'>,
): string | null {
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage)?.getItem(KEY) ?? 'null') as {
      workspaceId?: unknown;
      personId?: unknown;
    } | null;
    return saved?.workspaceId === workspaceId && typeof saved.personId === 'string'
      ? saved.personId
      : null;
  } catch {
    return null;
  }
}

/** Remembers the exported person of this file, or forgets it after a team or role export. */
export function saveExportPerson(
  workspaceId: string,
  personId: string | null,
  storage?: Pick<Storage, 'setItem' | 'removeItem'>,
): void {
  try {
    const target = storage ?? globalThis.localStorage;
    if (personId) target?.setItem(KEY, JSON.stringify({ workspaceId, personId }));
    else target?.removeItem(KEY);
  } catch {
    // Blocked storage: nothing is remembered.
  }
}
