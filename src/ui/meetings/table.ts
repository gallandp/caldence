import type { CalEvent, Category } from '../../core/model';

export type SortKey = 'name' | 'next' | 'cost';
export type SortDir = 1 | -1;

/** Sorts after every real date. */
const NONE = '9999-12-31';

/** A first click on Cost shows the most expensive first; the other columns start ascending. */
export const firstDir = (key: SortKey): SortDir => (key === 'cost' ? -1 : 1);

interface SortContext {
  /** Next date (YYYY-MM-DD) of a meeting, or undefined when none is left in the horizon. */
  next: (e: CalEvent) => string | undefined;
  cost: (e: CalEvent) => number;
  locale: string;
}

/**
 * Meetings sorted by the chosen column. Ties go by next date, then start time, then name, so
 * same-day meetings always show in the order they take place, in either direction. Meetings without a next date stay
 * last in either direction.
 */
export function sortMeetings(
  events: readonly CalEvent[],
  key: SortKey,
  dir: SortDir,
  ctx: SortContext,
): CalEvent[] {
  const byName = (a: CalEvent, b: CalEvent) => a.name.localeCompare(b.name, ctx.locale);
  const byNext = (a: CalEvent, b: CalEvent) =>
    (ctx.next(a) ?? NONE).localeCompare(ctx.next(b) ?? NONE) || a.time.localeCompare(b.time);
  const byDate = (a: CalEvent, b: CalEvent) =>
    (ctx.next(a) ?? NONE).localeCompare(ctx.next(b) ?? NONE);
  const primary = (a: CalEvent, b: CalEvent) =>
    key === 'name' ? byName(a, b) : key === 'cost' ? ctx.cost(a) - ctx.cost(b) : byDate(a, b);
  return [...events].sort((a, b) => {
    if (key === 'next') {
      const none = Number(ctx.next(a) === undefined) - Number(ctx.next(b) === undefined);
      if (none !== 0) return none;
    }
    return primary(a, b) * dir || byNext(a, b) || byName(a, b);
  });
}

export interface MeetingGroup {
  /** Undefined for meetings whose category no longer exists. */
  category: Category | undefined;
  events: CalEvent[];
}

/** One group per category, in the categories' order; empty categories are left out. */
export function groupByCategory(
  events: readonly CalEvent[],
  categories: readonly Category[],
): MeetingGroup[] {
  const known = new Set(categories.map((c) => c.id));
  const groups: MeetingGroup[] = categories
    .map((category) => ({ category, events: events.filter((e) => e.categoryId === category.id) }))
    .filter((g) => g.events.length > 0);
  const rest = events.filter((e) => !known.has(e.categoryId));
  return rest.length > 0 ? [...groups, { category: undefined, events: rest }] : groups;
}
