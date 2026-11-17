// "Add to calendar" from Meetings & cadence: which unit the export page should preselect, and the
// person this browser exported last (a Product Owner exports their own meetings again and again).
import { writable } from 'svelte/store';

const KEY = 'caldence.exportPerson';

/** Set by Meetings & cadence right before it opens Import / Export; read once there. */
export const exportRequest = writable<{ teamId: string } | null>(null);

export function loadExportPerson(storage?: Pick<Storage, 'getItem'>): string | null {
  try {
    return (storage ?? globalThis.localStorage)?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

/** Remembers the exported person, or forgets it after a team or role export. */
export function saveExportPerson(
  personId: string | null,
  storage?: Pick<Storage, 'setItem' | 'removeItem'>,
): void {
  try {
    const target = storage ?? globalThis.localStorage;
    if (personId) target?.setItem(KEY, personId);
    else target?.removeItem(KEY);
  } catch {
    // Blocked storage: nothing is remembered.
  }
}
