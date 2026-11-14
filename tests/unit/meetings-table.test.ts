import { describe, expect, it } from 'vitest';
import type { CalEvent, Category } from '../../src/core/model';
import { firstDir, groupByCategory, sortMeetings } from '../../src/ui/meetings/table';

const event = (id: string, name: string, time: string, categoryId = 'c1'): CalEvent => ({
  id,
  name,
  categoryId,
  rule: { type: 'weekly', weekday: 1 },
  time,
  duration: 60,
  participants: [],
  preparation: 0,
});

const daily = event('daily', 'Daily', '11:45');
const planning = event('planning', 'Sprint Planning', '09:00', 'c2');
const review = event('review', 'Review', '14:00');
const kickoff = event('kickoff', 'Kick-off', '10:00', 'gone');
const events = [daily, planning, review, kickoff];

const nextDates: Record<string, string | undefined> = {
  daily: '2027-01-07',
  planning: '2027-01-07',
  review: '2027-01-12',
  kickoff: undefined,
};
const costs: Record<string, number> = { daily: 131, planning: 1890, review: 263, kickoff: 263 };
const ctx = {
  next: (e: CalEvent) => nextDates[e.id],
  cost: (e: CalEvent) => costs[e.id]!,
  locale: 'en',
};
const ids = (list: CalEvent[]) => list.map((e) => e.id);

describe('sorting the meetings table', () => {
  it('orders same-day meetings by start time and keeps meetings without a next date last', () => {
    expect(ids(sortMeetings(events, 'next', 1, ctx))).toEqual([
      'planning',
      'daily',
      'review',
      'kickoff',
    ]);
    expect(ids(sortMeetings(events, 'next', -1, ctx))).toEqual([
      'review',
      'planning',
      'daily',
      'kickoff',
    ]);
  });

  it('sorts by name and by cost, ties by next date', () => {
    expect(ids(sortMeetings(events, 'name', 1, ctx))).toEqual([
      'daily',
      'kickoff',
      'review',
      'planning',
    ]);
    expect(ids(sortMeetings(events, 'cost', -1, ctx))).toEqual([
      'planning',
      'review',
      'kickoff',
      'daily',
    ]);
  });

  it('starts Cost with the most expensive first and the other columns ascending', () => {
    expect(firstDir('cost')).toBe(-1);
    expect(firstDir('name')).toBe(1);
    expect(firstDir('next')).toBe(1);
  });

  it('does not change the input', () => {
    const copy = [...events];
    sortMeetings(events, 'name', -1, ctx);
    expect(events).toEqual(copy);
  });
});

describe('grouping by category', () => {
  const categories: Category[] = [
    { id: 'c1', name: 'Scrum', colour: '#1d4ed8' },
    { id: 'c2', name: 'Architecture', colour: '#b91c1c' },
    { id: 'c3', name: 'Empty', colour: '#15803d' },
  ];

  it('keeps the category order and the row order, drops empty ones, collects unknown ones last', () => {
    const groups = groupByCategory(events, categories);
    expect(groups.map((g) => g.category?.id)).toEqual(['c1', 'c2', undefined]);
    expect(groups.map((g) => ids(g.events))).toEqual([
      ['daily', 'review'],
      ['planning'],
      ['kickoff'],
    ]);
  });
});
