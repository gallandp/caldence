import { mondayOf } from '../../core/date';
import type { Rule, Team } from '../../core/model';
import { formatDisplayDate, formatNumber, type Locale } from '../../i18n';

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

/** Sorted weekdays as runs; runs of 3 or more consecutive days stay one range, shorter ones split. */
export function weekdayRuns(days: number[]): { from: number; to: number }[] {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const runs: { from: number; to: number }[] = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.to === d - 1) last.to = d;
    else runs.push({ from: d, to: d });
  }
  return runs.flatMap((r) =>
    r.to - r.from >= 2
      ? [r]
      : Array.from({ length: r.to - r.from + 1 }, (_, i) => ({ from: r.from + i, to: r.from + i })),
  );
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

/** The "Repeats" text of a rule; `t` is the translate function of the active locale. */
export function ruleSummary(
  rule: Rule,
  tm: Team,
  t: (key: string, params?: Record<string, string | number>) => string,
  loc: Locale,
): string {
  const wd = (d: number) => weekdayName(loc, d);
  switch (rule.type) {
    case 'weekly':
      return t('meet.sum.weekly', { weekday: wd(rule.weekday) });
    case 'weekdays':
      return t('meet.sum.weekdays', {
        weekdays: new Intl.ListFormat(loc, { type: 'conjunction' }).format(
          weekdayRuns(rule.weekdays).map((r) =>
            r.from === r.to ? wd(r.from) : t('meet.sum.range', { from: wd(r.from), to: wd(r.to) }),
          ),
        ),
      });
    case 'every-n-weeks':
      return t('meet.sum.everyN', {
        n: formatNumber(loc, rule.n, 0),
        weekday: wd(rule.weekday),
      });
    case 'monthly-nth-weekday':
      return t('meet.sum.monthly', {
        nth: t(rule.nth === -1 ? 'meet.nth.last' : `meet.nth.${rule.nth}`),
        weekday: wd(rule.weekday),
      });
    case 'cadence-day':
      return t('meet.sum.cadenceDay', {
        day: formatNumber(loc, rule.day + 1, 0),
        kind: t(`meet.kind.${tm.cadence.kind}`),
      });
    case 'cycle-milestone': {
      const cycle = tm.cycles.find((c) => c.id === rule.cycleId);
      const milestone = cycle?.milestones.find((m) => m.id === rule.milestoneId);
      const params = {
        milestone: milestone?.name ?? rule.milestoneId,
        cycle: cycle?.name ?? rule.cycleId,
      };
      if (rule.offsetDays === 0) return t('meet.sum.milestoneOn', params);
      const days = Math.abs(rule.offsetDays);
      const key = rule.offsetDays > 0 ? 'after' : 'before';
      return t(`meet.sum.${key}${days === 1 ? 'One' : ''}`, {
        ...params,
        n: formatNumber(loc, days, 0),
      });
    }
    case 'once':
      return t('meet.sum.once', { date: formatDisplayDate(loc, rule.date, 'long') });
  }
}

/** Short weekday name (1 = Monday) in the given locale, e.g. "Mi" or "Wed". */
export function weekdayShort(locale: Locale, weekday: number): string {
  const d = new Date(Date.UTC(2024, 0, weekday));
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(d);
}

/** The rule in a few words for the meetings table ("Every 2 weeks · Wed"); time and duration go elsewhere. */
export function ruleShort(
  rule: Rule,
  tm: Team,
  t: (key: string, params?: Record<string, string | number>) => string,
  loc: Locale,
): string {
  const wd = (d: number) => weekdayShort(loc, d);
  switch (rule.type) {
    case 'weekly':
      return t('meet.short.weekly', { weekday: wd(rule.weekday) });
    case 'weekdays':
      return weekdayRuns(rule.weekdays)
        .map((r) => (r.from === r.to ? wd(r.from) : `${wd(r.from)}–${wd(r.to)}`))
        .join(', ');
    case 'every-n-weeks':
      return t('meet.short.everyN', { n: formatNumber(loc, rule.n, 0), weekday: wd(rule.weekday) });
    case 'monthly-nth-weekday':
      return t('meet.short.monthly', {
        nth: t(rule.nth === -1 ? 'meet.nth.last' : `meet.nth.${rule.nth}`),
        weekday: wd(rule.weekday),
      });
    case 'cadence-day':
      return t('meet.short.cadenceDay', {
        day: formatNumber(loc, rule.day + 1, 0),
        kind: t(`meet.kind.${tm.cadence.kind}`),
      });
    case 'cycle-milestone': {
      const milestone =
        tm.cycles
          .find((c) => c.id === rule.cycleId)
          ?.milestones.find((m) => m.id === rule.milestoneId)?.name ?? rule.milestoneId;
      if (rule.offsetDays === 0) return t('meet.short.milestoneOn', { milestone });
      const days = Math.abs(rule.offsetDays);
      const key = rule.offsetDays > 0 ? 'after' : 'before';
      return t(`meet.short.${key}${days === 1 ? 'One' : ''}`, {
        n: formatNumber(loc, days, 0),
        milestone,
      });
    }
    case 'once':
      return t('meet.short.once');
  }
}
