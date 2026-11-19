import { writable } from 'svelte/store';
import type { ISODate } from '../../core/date';

/**
 * The week Load shows in detail for one team, set from the area overview's load cells (#168).
 * Load clears it when it closes, so it never shows up later for another team.
 */
export const loadWeek = writable<{ teamId: string; monday: ISODate } | null>(null);

/** A week to open in the Calendar's week level, set from a link in Meeting load (#343). */
export const calendarWeek = writable<ISODate | null>(null);
