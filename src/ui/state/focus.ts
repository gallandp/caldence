import { writable } from 'svelte/store';
import type { ISODate } from '../../core/date';

/** The week Load shows in detail, set from the area overview's load cells (#168). */
export const loadWeek = writable<ISODate | null>(null);
