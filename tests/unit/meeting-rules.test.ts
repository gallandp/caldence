import { describe, expect, it } from 'vitest';
import type { Rule, Team } from '../../src/core/model';
import { ruleDraft, toRule, weekdayName } from '../../src/ui/meetings/rules';

const team: Team = {
  id: 't1',
  name: 'T',
  cadence: { kind: 'sprint', lengthWeeks: 2, start: '2027-01-04' },
  members: [],
  assumptions: {},
  cycles: [{ id: 'cy1', name: 'C', milestones: [{ id: 'm1', name: 'M', date: '2027-02-01' }] }],
  events: [],
};
const today = '2027-01-06'; // a Wednesday

describe('rule drafts', () => {
  it('shows a cadence day 1-based and stores it 0-based', () => {
    const draft = ruleDraft({ type: 'cadence-day', day: 0 }, team, today);
    expect(draft.day).toBe(1);
    draft.day = 4;
    expect(toRule(draft)).toEqual({ type: 'cadence-day', day: 3 });
  });

  it('round-trips every rule type', () => {
    const rules: Rule[] = [
      { type: 'weekly', weekday: 3 },
      { type: 'every-n-weeks', weekday: 2, n: 3, anchor: '2027-01-12' },
      { type: 'monthly-nth-weekday', weekday: 5, nth: -1 },
      { type: 'cadence-day', day: 13 },
      { type: 'cycle-milestone', cycleId: 'cy1', milestoneId: 'm1', offsetDays: -2 },
      { type: 'once', date: '2027-03-05' },
    ];
    for (const rule of rules) expect(toRule(ruleDraft(rule, team, today))).toEqual(rule);
  });

  it('defaults a new rule to weekly on Monday with the first milestone and a Monday anchor', () => {
    const d = ruleDraft(undefined, team, today);
    expect(toRule(d)).toEqual({ type: 'weekly', weekday: 1 });
    expect(d).toMatchObject({ cycleId: 'cy1', milestoneId: 'm1', anchor: '2027-01-04' });
  });

  it('turns an empty number field into NaN so validation refuses it', () => {
    const d = ruleDraft({ type: 'every-n-weeks', weekday: 1, n: 2, anchor: today }, team, today);
    d.n = null;
    expect(toRule(d)).toMatchObject({ n: Number.NaN });
  });
});

describe('weekdayName', () => {
  it('is Monday-based and localised', () => {
    expect(weekdayName('en', 1)).toBe('Monday');
    expect(weekdayName('en', 7)).toBe('Sunday');
    expect(weekdayName('de', 3)).toBe('Mittwoch');
  });
});
