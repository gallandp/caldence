/**
 * Values derived from src/data/examples/example.caldence.json with the core functions.
 * The app starts with the filter { teamId: 'team-alpha' } (the first team), so the tables
 * `loadSummary` and `weekRows` use that filter; the person values use { personId: 'person-alex' }.
 * Playwright cannot import the core modules (they import JSON without an import attribute),
 * so tests/unit/weeks-load-expected.test.ts checks these constants against the core.
 */

/** Base load in hours per week by role (filter { teamId: 'team-alpha' }), in role order. */
export const ROLE_HOURS: { roleId: string; name: string; hours: number }[] = [
  { roleId: 'role-po', name: 'Product Owner', hours: 3.088461538461538 },
  { roleId: 'role-sm', name: 'Scrum Master', hours: 2.525 },
];

/** Base load by category and role (filter { teamId: 'team-alpha' }): [id, name, hours by role id]. */
export const CATEGORY_HOURS: [string, string, Record<string, number>][] = [
  ['cat-events', 'Scrum events', { 'role-po': 1.5, 'role-sm': 1.5 }],
  ['cat-align', 'Alignment', { 'role-po': 0.55, 'role-sm': 0.275 }],
  ['cat-stake', 'Stakeholders', { 'role-po': 1.0384615384615385, 'role-sm': 0.75 }],
];

/** Week row of Monday 2027-01-04 (filter { teamId: 'team-alpha' }): Sprint 1 of Alpha starts. */
export const CADENCE_START_WEEK = {
  monday: '2027-01-04',
  isoWeek: 1,
  byRole: { 'role-po': 3.75, 'role-sm': 2.5 },
  total: 6.25,
};

/** Same week with the filter { personId: 'person-alex' }: Alex is in both teams. */
export const ALEX_START_WEEK = { byRole: { 'role-po': 5.1 }, total: 5.1 };

/** Alex (32 h/week, only role Product Owner) with the person filter. */
export const ALEX = {
  average: 4.343867924528298,
  fte: 4.343867924528298 / 32,
  peakWeek: 25,
  peakHours: 7.475,
  /** Warnings in week order: [ISO week, hours]; all `above-average`. */
  warnings: [
    [5, 6.85],
    [9, 6.85],
    [13, 6.85],
    [25, 7.475],
    [31, 6.85],
    [35, 6.85],
  ] as [number, number][],
};

export const fmt = (locale: 'de' | 'en', n: number, digits = 1): string =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
