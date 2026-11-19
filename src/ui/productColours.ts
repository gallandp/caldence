import { units, type Workspace } from '../core/model';

/**
 * Colours that tell products apart where a line unit's people work in several (#316): the
 * calendar's meetings and the staff bars. Text always says the same; colour is a second cue.
 */
export const PRODUCT_COLOURS = [
  '#5b4fe0',
  '#d97706',
  '#be185d',
  '#0d9488',
  '#2563eb',
  '#7c3aed',
  '#65a30d',
  '#dc2626',
] as const;

/** A team's or area's colour: by its place among all units, the same in every view. */
export function productColourOf(ws: Workspace, unitId: string): string {
  const i = units(ws).findIndex((u) => u.id === unitId);
  return PRODUCT_COLOURS[Math.max(0, i) % PRODUCT_COLOURS.length]!;
}
