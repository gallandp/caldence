import { get, writable } from 'svelte/store';
import { hasOrgLevel, ORG_UNIT, type SavedView, type Workspace } from '../../core/model';

const view = writable<SavedView>({});

/**
 * Where the app is looking now: the selected unit and the view. Saved into the file and the
 * autosave together with the area page, so a reload comes back there (persona concept Q5).
 * Setting the same place again does not notify, so the autosave is not scheduled for nothing.
 */
export const currentView = {
  subscribe: view.subscribe,
  set(next: SavedView): void {
    const now = get(view);
    if (now.unit !== next.unit || now.page !== next.page) view.set(next);
  },
};

/** The area's page. An area opens on its overview (#337); only a new area starts on the structure. */
export const areaPage = writable<'structure' | 'overview'>('overview');

/** The person whose card an area's structure opens, set by a link to it (#361). */
export const structurePerson = writable<{ areaId: string; personId: string } | undefined>(
  undefined,
);

/** The pages an area can show, for the address (#401). */
export const AREA_PAGES: readonly string[] = ['structure', 'overview'];

/** A unit this workspace can select: a team, an area, or the organisation. */
export function knownUnit(ws: Workspace, unit: string | undefined): boolean {
  return (
    (unit === ORG_UNIT && hasOrgLevel(ws)) || [...ws.teams, ...ws.areas].some((u) => u.id === unit)
  );
}

/**
 * Where a replaced workspace opens (#337). An `opened` file lands on an answer, never on an
 * editor: the first area's page, otherwise the Calendar. The autosave after a reload comes back
 * to the saved unit and view; unknown values are left out.
 */
export function openingPlace(
  ws: Workspace,
  opened: boolean,
  views: readonly string[],
): { unit?: string; page?: string } {
  const saved = ws.view;
  const known = (unit: string | undefined) => knownUnit(ws, unit);
  if (!opened)
    return {
      unit: known(saved?.unit) ? saved?.unit : undefined,
      page: views.find((id) => id === saved?.page),
    };
  const area = ws.areas[0];
  if (area) return { unit: area.id, page: 'team' };
  const team = ws.teams.find((t) => t.id === saved?.unit);
  return { unit: team?.id, page: 'calendar' };
}

/** The workspace as it is written: with the current view. Keys of a newer app version stay. */
export function withView(ws: Workspace): Workspace {
  return { ...ws, view: { ...ws.view, ...get(view), areaPage: get(areaPage) } };
}
