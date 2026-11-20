import { writable } from 'svelte/store';
import type { ISODate } from '../../core/date';

/**
 * The week Load shows in detail for one team, set from the area overview's load cells (#168).
 * Load clears it when it closes, so it never shows up later for another team.
 */
export const loadWeek = writable<{ teamId: string; monday: ISODate } | null>(null);

/** A day to open in the Calendar with its details, set from a link in another view (#341). */
export const calendarDay = writable<ISODate | null>(null);

/**
 * A day whose week the Calendar opens on its week level, set from a link in another view: a week
 * of a person in Meeting load (#343) and a clash in Meeting load or the area Overview (#339). The
 * Calendar clears it once shown.
 */
export const calendarWeek = writable<ISODate | null>(null);

/**
 * Brings Meeting load's list of overlapping meeting pairs into view, set from the area Overview's
 * "N more pairs" (#445). Meeting load clears it once shown.
 */
export const loadOverlaps = writable(false);
