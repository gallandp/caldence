import { get, writable } from 'svelte/store';
import type { SavedView, Workspace } from '../../core/model';

const view = writable<SavedView>({});

/**
 * Where the app is looking now: the selected unit and the view. Saved into the file and the
 * autosave together with the area page, so a file opens where it was saved (persona concept Q5).
 * Setting the same place again does not notify, so the autosave is not scheduled for nothing.
 */
export const currentView = {
  subscribe: view.subscribe,
  set(next: SavedView): void {
    const now = get(view);
    if (now.unit !== next.unit || now.page !== next.page) view.set(next);
  },
};

/** The area's page; a new area or a file without a saved page starts on the structure. */
export const areaPage = writable<'structure' | 'overview'>('structure');

/** The workspace as it is written: with the current view. Keys of a newer app version stay. */
export function withView(ws: Workspace): Workspace {
  return { ...ws, view: { ...ws.view, ...get(view), areaPage: get(areaPage) } };
}
