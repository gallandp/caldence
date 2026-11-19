import type { LineKind, LineLevel, Settings } from './model';

/** What the level helpers read: the file's own levels, if any. */
type Levels = Pick<Settings, 'lineLevels'>;

/**
 * The levels of the line (#408), top-down. A file without own levels has the three built-in ones
 * of #399: company (optional, top only), specialist group and line team.
 */
export const DEFAULT_LINE_LEVELS: readonly LineLevel[] = [
  { id: 'company', company: true },
  { id: 'group' },
  { id: 'team' },
];

/** The ids whose word comes from `lineLevelNames` or the language while a level has no name. */
export const BUILT_IN_LINE_LEVELS = ['company', 'group', 'team'] as const;

export const lineLevels = (settings: Levels): readonly LineLevel[] =>
  settings.lineLevels ?? DEFAULT_LINE_LEVELS;

/** The position of a level, from 0 at the top; -1 for an unknown id. */
export const lineLevelIndex = (settings: Levels, id: LineKind): number =>
  lineLevels(settings).findIndex((l) => l.id === id);

export const isCompanyLevel = (settings: Levels, id: LineKind | undefined): boolean =>
  id !== undefined && lineLevels(settings).some((l) => l.id === id && l.company === true);

/** The lowest level: units on it have no units below them. */
export const lowestLineLevel = (settings: Levels): LineKind => lineLevels(settings).at(-1)!.id;

/**
 * The level a unit without a chosen one gets while it has units below it: the built-in group, else
 * the lowest level above the bottom that is not a company level, else the bottom one.
 */
export function groupLineLevel(settings: Levels): LineKind {
  const list = lineLevels(settings);
  if (list.some((l) => l.id === 'group')) return 'group';
  for (let i = list.length - 2; i >= 0; i--) if (!list[i]!.company) return list[i]!.id;
  return list.at(-1)!.id;
}
