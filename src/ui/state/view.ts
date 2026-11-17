import { get, writable } from 'svelte/store';
import type { SavedView, Workspace } from '../../core/model';

/**
 * Where the app is looking now: the selected unit, the view and the area page. Saved into the
 * file and the autosave, so a file opens where it was saved (persona concept Q5).
 */
export const currentView = writable<SavedView>({});

/** The area's page; a new area or a file without a saved page starts on the structure. */
export const areaPage = writable<'structure' | 'overview'>('structure');

/** The workspace as it is written: with the current view. */
export function withView(ws: Workspace): Workspace {
  const view: SavedView = { ...get(currentView), areaPage: get(areaPage) };
  return { ...ws, view };
}
