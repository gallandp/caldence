import type { Settings } from './model';

/**
 * Names of the two organisation levels (the upper one groups teams, see `Area`). Organisations
 * call them differently, so a workspace picks a preset or types its own names.
 */
export const LEVEL_PRESETS = ['area', 'department', 'platform', 'chapter', 'train'] as const;
export type LevelPreset = (typeof LEVEL_PRESETS)[number];

/** A preset, or own names for both levels (then `preset` is absent). */
export type LevelNames = { preset: LevelPreset } | { area: string; team: string };

/** Words for labels; `…Lc` is the form inside an English sentence (German keeps capitals). */
export interface LevelWords {
  area: string;
  areaLc: string;
  areas: string;
  team: string;
  teamLc: string;
  teams: string;
  teamsLc: string;
  /** "im Bereich", "in der Plattform", "in the area"; own names: "auf Ebene X". */
  inArea: string;
  inTeam: string;
  /** The three groups of people in an area, named the same everywhere. */
  onlyArea: string;
  both: string;
  onlyTeam: string;
}

type Grammar = {
  area: string;
  areas: string;
  team: string;
  teams: string;
  /** Preposition + article: "im", "in der". */
  inArea: string;
  inTeam: string;
};

const DE: Record<LevelPreset, Grammar> = {
  area: {
    area: 'Bereich',
    areas: 'Bereiche',
    team: 'Team',
    teams: 'Teams',
    inArea: 'im',
    inTeam: 'im',
  },
  department: {
    area: 'Abteilung',
    areas: 'Abteilungen',
    team: 'Team',
    teams: 'Teams',
    inArea: 'in der',
    inTeam: 'im',
  },
  platform: {
    area: 'Plattform',
    areas: 'Plattformen',
    team: 'Produkt',
    teams: 'Produkte',
    inArea: 'in der',
    inTeam: 'im',
  },
  chapter: {
    area: 'Chapter',
    areas: 'Chapter',
    team: 'Unit',
    teams: 'Units',
    inArea: 'im',
    inTeam: 'in der',
  },
  train: {
    area: 'Release Train',
    areas: 'Release Trains',
    team: 'Team',
    teams: 'Teams',
    inArea: 'im',
    inTeam: 'im',
  },
};

const EN: Record<LevelPreset, Omit<Grammar, 'inArea' | 'inTeam'>> = {
  area: { area: 'Area', areas: 'Areas', team: 'Team', teams: 'Teams' },
  department: { area: 'Department', areas: 'Departments', team: 'Team', teams: 'Teams' },
  platform: { area: 'Platform', areas: 'Platforms', team: 'Product', teams: 'Products' },
  chapter: { area: 'Chapter', areas: 'Chapters', team: 'Unit', teams: 'Units' },
  train: { area: 'Release Train', areas: 'Release Trains', team: 'Team', teams: 'Teams' },
};

const lc = (s: string) => s.toLowerCase();

/**
 * The words for the workspace's level names. Own names are used as typed, in phrases that need no
 * article or plural ("Nur auf Ebene Cluster"), because the app cannot know their grammar.
 */
export function levelWords(
  settings: Pick<Settings, 'levelNames'>,
  locale: 'de' | 'en',
): LevelWords {
  const names = settings.levelNames ?? { preset: 'area' };
  if (!('preset' in names)) {
    const { area, team } = names;
    return locale === 'de'
      ? {
          area,
          areaLc: area,
          areas: area,
          team,
          teamLc: team,
          teams: team,
          teamsLc: team,
          inArea: `auf Ebene ${area}`,
          inTeam: `auf Ebene ${team}`,
          onlyArea: `Nur auf Ebene ${area}`,
          both: `Auf Ebene ${team} und ${area}`,
          onlyTeam: `Nur auf Ebene ${team}`,
        }
      : {
          area,
          areaLc: area,
          areas: area,
          team,
          teamLc: team,
          teams: team,
          teamsLc: team,
          inArea: `at ${area} level`,
          inTeam: `at ${team} level`,
          onlyArea: `Only at ${area} level`,
          both: `At ${team} and ${area} level`,
          onlyTeam: `Only at ${team} level`,
        };
  }
  if (locale === 'de') {
    const g = DE[names.preset];
    return {
      area: g.area,
      areaLc: g.area,
      areas: g.areas,
      team: g.team,
      teamLc: g.team,
      teams: g.teams,
      teamsLc: g.teams,
      inArea: `${g.inArea} ${g.area}`,
      inTeam: `${g.inTeam} ${g.team}`,
      onlyArea: `Nur ${g.inArea} ${g.area}`,
      both: `${cap(g.inTeam)} ${g.team} und ${g.inArea} ${g.area}`,
      onlyTeam: `Nur ${g.inTeam} ${g.team}`,
    };
  }
  const g = EN[names.preset];
  return {
    area: g.area,
    areaLc: lc(g.area),
    areas: g.areas,
    team: g.team,
    teamLc: lc(g.team),
    teams: g.teams,
    teamsLc: lc(g.teams),
    inArea: `in the ${lc(g.area)}`,
    inTeam: `in the ${lc(g.team)}`,
    onlyArea: `Only in the ${lc(g.area)}`,
    both: `In a ${lc(g.team)} and in the ${lc(g.area)}`,
    onlyTeam: `Only in a ${lc(g.team)}`,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Placeholders every translated text can use, e.g. `{levelTeam}`. */
export function levelParams(words: LevelWords): Record<string, string> {
  return {
    levelArea: words.area,
    levelAreaLc: words.areaLc,
    levelAreas: words.areas,
    levelTeam: words.team,
    levelTeamLc: words.teamLc,
    levelTeams: words.teams,
    levelTeamsLc: words.teamsLc,
    levelInArea: words.inArea,
    levelInTeam: words.inTeam,
  };
}
