import { randomId } from './id';
import { addDays, type ISODate, type Time } from './date';
import type { LevelNames } from './levels';
import type { Region } from './regions';

export const CURRENT_SCHEMA = 5;

export interface Settings {
  locale: 'de' | 'en';
  region: string;
  timezone: string;
  workdays: number[];
  hoursPerWeek: number;
  horizon: { from: ISODate; to: ISODate };
  skipHolidays: boolean;
  thresholds: { warnFactor: number; maxFte: number };
  /** Optional euros per person and hour; without it no costs are shown. */
  hourlyRate?: number;
  /** Names of the two levels; without it Bereich/Team (Area/Team). */
  levelNames?: LevelNames;
}

export interface Role {
  id: string;
  name: string;
  colour: string;
}

export interface Person {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  colour: string;
}

export interface Cadence {
  kind: 'sprint' | 'flow' | 'pi';
  lengthWeeks: number;
  start: ISODate;
}

export interface Cycle {
  id: string;
  name: string;
  milestones: { id: string; name: string; date: ISODate }[];
}

export type Weekday = number;

export type Rule =
  | { type: 'weekly'; weekday: Weekday }
  /** Non-empty, unique, 1-7. */
  | { type: 'weekdays'; weekdays: Weekday[] }
  | { type: 'every-n-weeks'; weekday: Weekday; n: number; anchor: ISODate }
  | { type: 'monthly-nth-weekday'; weekday: Weekday; nth: 1 | 2 | 3 | 4 | 5 | -1 }
  /** day: 0-based day within the cadence period (0 = start day) */
  | { type: 'cadence-day'; day: number }
  | { type: 'cycle-milestone'; cycleId: string; milestoneId: string; offsetDays: number }
  | { type: 'once'; date: ISODate };

export interface CalEvent {
  id: string;
  name: string;
  categoryId: string;
  rule: Rule;
  time: Time;
  duration: number;
  scaling?: { base: number; perUnit: number; assumption: string; grid: number };
  participants: { roleId: string; share: number }[];
  preparation: number;
}

export interface Team {
  id: string;
  name: string;
  templateId?: string;
  cadence: Cadence;
  members: { personId: string; roleId: string }[];
  /** Weekly hours of a person in this team; a missing entry means settings.hoursPerWeek. */
  memberHours: Record<string, number>;
  assumptions: Record<string, number>;
  cycles: Cycle[];
  events: CalEvent[];
}

/**
 * A group of teams (default name "Bereich" / "Area"), shaped like a team so that recurrence, load
 * and cost code can treat it as one more unit. A team is in at most one area; areas do not nest.
 */
export interface Area {
  id: string;
  name: string;
  teamIds: string[];
  /** Optional reference cadence, e.g. a planning interval of 10 weeks. */
  cadence?: Cadence;
  /** People with a role at area level, e.g. head of area. */
  members: { personId: string; roleId: string }[];
  /**
   * Weekly hours of a person in the area. Unlike a team, a missing entry means 0 hours: area time
   * is extra to team time and has to be set on purpose.
   */
  memberHours: Record<string, number>;
  cycles: Cycle[];
  events: CalEvent[];
}

export interface Workspace {
  /** UUID v4, stable for the life of the workspace. */
  id: string;
  schemaVersion: number;
  settings: Settings;
  roles: Role[];
  people: Person[];
  categories: Category[];
  teams: Team[];
  areas: Area[];
  /** Region files imported into this workspace; ids never equal a built-in region id. */
  customRegions: Region[];
}

export function emptyWorkspace(today: ISODate): Workspace {
  return {
    schemaVersion: CURRENT_SCHEMA,
    id: randomId(),
    settings: {
      locale: 'en',
      region: 'de-sn',
      timezone: 'Europe/Berlin',
      workdays: [1, 2, 3, 4, 5],
      hoursPerWeek: 40,
      horizon: { from: today, to: addDays(today, 365) },
      skipHolidays: true,
      thresholds: { warnFactor: 1.5, maxFte: 0.6 },
    },
    roles: [],
    people: [],
    categories: [],
    teams: [],
    areas: [],
    customRegions: [],
  };
}
