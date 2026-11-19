import { writable } from 'svelte/store';
import type { ISODate } from '../../core/date';

/**
 * The week Load shows in detail for one team, set from the area overview's load cells (#168).
 * Load clears it when it closes, so it never shows up later for another team.
 */
export const loadWeek = writable<{ teamId: string; monday: ISODate } | null>(null);

/**
 * A day whose week the calendar opens in its week view, set from the area overview's clash line
 * (#339). The calendar clears it once it shows that week.
 */
export const calendarWeek = writable<ISODate | null>(null);

/** A day to open in the Calendar with its details, set from a link in another view (#341). */
export const calendarDay = writable<ISODate | null>(null);
