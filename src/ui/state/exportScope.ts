// "Add to calendar" from Meetings & cadence: which unit the export page should preselect, and what
// this browser exported last from this file (a Product Owner exports their own meetings again and
// again). Kept in the browser, not in the file, since files are passed on to other people.
import { writable } from 'svelte/store';

const KEY = 'caldence.exportPerson';

export type ExportKind = 'team' | 'role' | 'person';
export interface ExportChoice {
  kind: ExportKind;
  id: string;
}

/** Set right before Import / Export opens from Meetings & cadence; read once there. */
export const exportRequest = writable<{ teamId: string } | null>(null);

/** The scope and unit last exported (or set up as "me") from the file with this id, if any. */
export function loadExportChoice(
  workspaceId: string,
  storage?: Pick<Storage, 'getItem'>,
): ExportChoice | null {
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage)?.getItem(KEY) ?? 'null') as {
      workspaceId?: unknown;
      kind?: unknown;
      id?: unknown;
      personId?: unknown;
    } | null;
    if (saved?.workspaceId !== workspaceId) return null;
    // Earlier versions remembered only a person.
    if (typeof saved.personId === 'string') return { kind: 'person', id: saved.personId };
    return (saved.kind === 'team' || saved.kind === 'role' || saved.kind === 'person') &&
      typeof saved.id === 'string'
      ? { kind: saved.kind, id: saved.id }
      : null;
  } catch {
    return null;
  }
}

/** Remembers the scope and unit of this file's latest export. */
export function saveExportChoice(
  workspaceId: string,
  choice: ExportChoice,
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    (storage ?? globalThis.localStorage)?.setItem(KEY, JSON.stringify({ workspaceId, ...choice }));
  } catch {
    // Blocked storage: nothing is remembered.
  }
}
