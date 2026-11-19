/**
 * Values derived from src/data/examples/example.caldence.json with the core functions
 * (`dayLoad` with filter { teamId: 'team-alpha' } and `conflicts` for 'person-alex').
 * Playwright cannot import the core modules (they import JSON without an import attribute),
 * so tests/unit/calendar-expected.test.ts checks these constants against the core.
 */
export const DAY_HOURS: Record<string, number> = {
  '2027-03-02': 0.5,
  '2027-03-04': 6.25,
  '2027-03-10': 1.65,
};

/** First day with two overlapping meetings of Alex (Sprint Planning 10:00 and Replenishment 11:00). */
export const ALEX_OVERLAP_DAY = '2027-01-07';

/** Clashes of Alex (Team Alpha and Team Beta) in the whole planning horizon (#339). */
export const ALEX_CLASHES = 27;

/**
 * Days with a clash of a Commerce person that touches Commerce or its teams, in the 12 weeks from
 * Monday 2027-01-04; the first is Robin's on that Monday (#339).
 */
export const COMMERCE_CLASH_DAYS = 12;
export const COMMERCE_FIRST_CLASH = '2027-01-04';

export const fmt = (locale: 'de' | 'en', n: number): string =>
  new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
