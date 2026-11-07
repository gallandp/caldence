import { mondayOf } from '../../core/date';
import type { Rule, Team } from '../../core/model';
import type { Locale } from '../../i18n';

export const RULE_TYPES = [
  'weekly',
  'weekdays',
  'every-n-weeks',
  'monthly-nth-weekday',
  'cadence-day',
  'cycle-milestone',
  'once',
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

/** Form state of a rule: every field of every type, so switching the type loses nothing. */
export interface RuleDraft {
  type: RuleType;
  weekday: number;
  weekdays: number[];
  n: number | null;
  anchor: string;
  nth: number;
  /** 1-based, as shown to the user. */
  day: number | null;
  cycleId: string;
  milestoneId: string;
  offsetDays: number | null;
  date: string;
}

/** Weekday name (1 = Monday) in the given locale, built from a fixed Monday-based date. */
export function weekdayName(locale: Locale, weekday: number): string {
  // 2024-01-01 is a Monday.
  const d = new Date(Date.UTC(2024, 0, weekday));
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(d);
}

export function ruleDraft(rule: Rule | undefined, team: Team, today: string): RuleDraft {
  const cycle = team.cycles[0];
  const draft: RuleDraft = {
    type: 'weekly',
    weekday: 1,
    weekdays: [1, 2, 3, 4, 5],
    n: 2,
    anchor: mondayOf(today),
    nth: 1,
    day: 1,
    cycleId: cycle?.id ?? '',
    milestoneId: cycle?.milestones[0]?.id ?? '',
    offsetDays: 0,
    date: today,
  };
  if (!rule) return draft;
  draft.type = rule.type;
  switch (rule.type) {
    case 'weekly':
      draft.weekday = rule.weekday;
      break;
    case 'weekdays':
      draft.weekdays = [...rule.weekdays];
      break;
    case 'every-n-weeks':
      Object.assign(draft, { weekday: rule.weekday, n: rule.n, anchor: rule.anchor });
      break;
    case 'monthly-nth-weekday':
      Object.assign(draft, { weekday: rule.weekday, nth: rule.nth });
      break;
    case 'cadence-day':
      draft.day = rule.day + 1;
      break;
    case 'cycle-milestone':
      Object.assign(draft, {
        cycleId: rule.cycleId,
        milestoneId: rule.milestoneId,
        offsetDays: rule.offsetDays,
      });
      break;
    case 'once':
      draft.date = rule.date;
      break;
  }
  return draft;
}

/** An empty number field becomes NaN, which validation refuses as an invalid number. */
const num = (v: number | null): number => v ?? Number.NaN;

export function toRule(d: RuleDraft): Rule {
  switch (d.type) {
    case 'weekly':
      return { type: 'weekly', weekday: d.weekday };
    case 'weekdays':
      return { type: 'weekdays', weekdays: [...d.weekdays].sort((a, b) => a - b) };
    case 'every-n-weeks':
      return { type: 'every-n-weeks', weekday: d.weekday, n: num(d.n), anchor: d.anchor };
    case 'monthly-nth-weekday':
      return {
        type: 'monthly-nth-weekday',
        weekday: d.weekday,
        nth: d.nth as 1 | 2 | 3 | 4 | 5 | -1,
      };
    case 'cadence-day':
      return { type: 'cadence-day', day: num(d.day) - 1 };
    case 'cycle-milestone':
      return {
        type: 'cycle-milestone',
        cycleId: d.cycleId,
        milestoneId: d.milestoneId,
        offsetDays: num(d.offsetDays),
      };
    case 'once':
      return { type: 'once', date: d.date };
  }
}
