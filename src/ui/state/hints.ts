// Hints a person dismissed, per workspace and per browser. Not part of the file: they are about
// this person's first steps, not about the plan.
import { writable, type Readable } from 'svelte/store';

const KEY = 'caldence.hints.groupTeams';

// Reading localStorage itself throws when site data is blocked, so it is only touched inside a try.
function read(): string[] {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

const dismissed = writable<string[]>(read());

/** Workspace ids for which the "group teams into an area" hint was dismissed. */
export const groupHintDismissed: Readable<string[]> = { subscribe: dismissed.subscribe };

/** Keeps the hint away for this workspace; the list keeps the last 50 workspaces. */
export function dismissGroupHint(workspaceId: string): void {
  dismissed.update((ids) => {
    const next = [...ids.filter((id) => id !== workspaceId), workspaceId].slice(-50);
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
    } catch {
      // Blocked storage: the hint stays away until the page is reloaded.
    }
    return next;
  });
}

/** The area just created in this browser tab, until its "ready" card is closed. */
export const areaReady = writable<string | undefined>(undefined);
