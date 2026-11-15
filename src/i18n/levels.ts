import type { LevelNames } from '../core/levels';
import { t, type Locale } from './index';

/** Words for the two levels; `…Lc` is the form inside an English sentence (German keeps capitals). */
export interface LevelWords {
  area: string;
  areaLc: string;
  areas: string;
  team: string;
  teamLc: string;
  teams: string;
  teamsLc: string;
  /** "im Team", "in der Unit", "in the product"; own names: "auf Ebene Squad". */
  inTeam: string;
}

/**
 * The words for a workspace's level names, without a setting Bereich/Team (Area/Team). Own names
 * are used as typed, in phrases that need no article, because their grammar is unknown.
 */
export function levelWords(names: LevelNames | undefined, locale: Locale): LevelWords {
  const lc = (s: string) => (locale === 'en' ? s.toLowerCase() : s);
  if (names && !('preset' in names)) {
    const { area, team } = names;
    const inTeam = t(locale, 'level.custom.inTeam', { name: team });
    return {
      area,
      areaLc: area,
      areas: area,
      team,
      teamLc: team,
      teams: team,
      teamsLc: team,
      inTeam,
    };
  }
  const word = (k: string) => t(locale, `level.${names?.preset ?? 'area'}.${k}`);
  return {
    area: word('area'),
    areaLc: lc(word('area')),
    areas: word('areas'),
    team: word('team'),
    teamLc: lc(word('team')),
    teams: word('teams'),
    teamsLc: lc(word('teams')),
    inTeam: word('inTeam'),
  };
}

/** Placeholders every translated text can use, e.g. `{levelTeam}`. */
export function levelParams(w: LevelWords): Record<string, string> {
  return {
    levelArea: w.area,
    levelAreaLc: w.areaLc,
    levelAreas: w.areas,
    levelTeam: w.team,
    levelTeamLc: w.teamLc,
    levelTeams: w.teams,
    levelTeamsLc: w.teamsLc,
    levelInTeam: w.inTeam,
  };
}
