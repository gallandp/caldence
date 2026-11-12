import { isValidDate, type ISODate } from './date';

/**
 * Upper limits for files and the workspace. Shared files are untrusted: without limits a file with
 * a horizon from year 1000 to 9999 froze the app on every start (security #41). Every view walks
 * the horizon day by day for every event, so the horizon and the number of events matter most.
 */
export const LIMITS = {
  /** Text of a workspace, template or region file, in characters (about 5 MB). */
  fileChars: 5 * 1024 * 1024,
  yearMin: 1900,
  yearMax: 2200,
  /** Planning horizon in years. */
  horizonYears: 5,
  /** Events of all teams together. */
  events: 500,
  teams: 50,
  roles: 200,
  people: 1000,
  categories: 200,
  membersPerTeam: 1000,
  cyclesPerTeam: 100,
  milestonesPerCycle: 100,
  assumptionsPerTeam: 50,
  customRegions: 20,
  regionHolidays: 100,
  regionSchoolHolidays: 500,
  /** Names, region and zone names, assumption keys. */
  textChars: 200,
  /** A template description. */
  descriptionChars: 2000,
  hoursPerWeek: 168,
  lengthWeeks: 52,
  everyNWeeks: 52,
  /** Minutes of one meeting, also for the parts of a scaled duration. */
  minutes: 1440,
  offsetDays: 366,
  assumptionValue: 10_000,
  warnFactor: 100,
  maxFte: 10,
  /** Euros per person and hour. */
  hourlyRate: 100_000,
} as const;

/** True when the year of a valid YYYY-MM-DD date is inside the supported range. */
export const inYearRange = (d: string): boolean => {
  const y = Number(d.slice(0, 4));
  return y >= LIMITS.yearMin && y <= LIMITS.yearMax;
};

/** The last day a horizon starting on `from` may end on: the same date `horizonYears` later. */
export function latestHorizonEnd(from: ISODate): ISODate {
  const year = String(Number(from.slice(0, 4)) + LIMITS.horizonYears).padStart(4, '0');
  const same = `${year}${from.slice(4)}`;
  // 29 February plus whole years is 1 March.
  return isValidDate(same) ? same : `${year}-03-01`;
}
