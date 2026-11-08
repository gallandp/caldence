import { describe, expect, it } from 'vitest';
import type { Rule, Team } from '../../src/core/model';
import {
  ruleDraft,
  ruleSummary,
  toRule,
  weekdayName,
  weekdayRuns,
} from '../../src/ui/meetings/rules';

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
      { type: 'weekdays', weekdays: [1, 4] },
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

describe('weekdays draft', () => {
  it('defaults to Monday to Friday', () => {
    expect(ruleDraft(undefined, team, today).weekdays).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('weekdayRuns', () => {
  it('collapses 3 or more consecutive days', () => {
    expect(weekdayRuns([5, 1, 2, 3, 4])).toEqual([{ from: 1, to: 5 }]);
  });
  it('keeps pairs and gaps as single days', () => {
    expect(weekdayRuns([1, 2, 4])).toEqual([
      { from: 1, to: 1 },
      { from: 2, to: 2 },
      { from: 4, to: 4 },
    ]);
  });
});

describe('weekdayName', () => {
  it('is Monday-based and localised', () => {
    expect(weekdayName('en', 1)).toBe('Monday');
    expect(weekdayName('en', 7)).toBe('Sunday');
    expect(weekdayName('de', 3)).toBe('Mittwoch');
  });
});

describe('ruleSummary', () => {
  const tr = (key: string, params?: Record<string, string | number>) =>
    `${key}${params ? JSON.stringify(params) : ''}`;

  it('describes weekdays as runs and a milestone offset', () => {
    expect(ruleSummary({ type: 'weekdays', weekdays: [1, 2, 3, 4, 5] }, team, tr, 'en')).toBe(
      'meet.sum.weekdays{"weekdays":"meet.sum.range{\\"from\\":\\"Monday\\",\\"to\\":\\"Friday\\"}"}',
    );
    expect(
      ruleSummary(
        { type: 'cycle-milestone', cycleId: 'cy1', milestoneId: 'm1', offsetDays: -1 },
        team,
        tr,
        'en',
      ),
    ).toBe('meet.sum.beforeOne{"milestone":"M","cycle":"C","n":"1"}');
  });

  it('formats a once rule with a localised date', () => {
    expect(ruleSummary({ type: 'once', date: '2027-01-06' }, team, tr, 'de')).toContain('2027');
  });
});
