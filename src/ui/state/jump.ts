import { writable } from 'svelte/store';

/**
 * A request to open a place (#397): a unit (a product, an area, the organisation or a line unit's
 * selection) on a page of the app. Components deep in a page ask for it here instead of handing
 * callbacks down; the shell opens it, switching worlds when needed, with a way back.
 */
export interface Place {
  selection: string;
  /** The view to show: the unit's own page unless named. */
  view?: string;
}

export const placeRequest = writable<Place | null>(null);

export function openPlace(selection: string, view?: string): void {
  placeRequest.set({ selection, view });
}
