import type { LevelNames } from '../core/levels';
import { t, type Locale } from './index';

/** Words for the two levels; `…Lc` is the form inside an English sentence (German keeps capitals). */
export interface LevelWords {
  /** The top level, the organisation (#313). */
  org: string;
  orgLc: string;
  area: string;
  areaLc: string;
  areas: string;
  areasLc: string;
  team: string;
  teamLc: string;
  teams: string;
  teamsLc: string;
  /** "im Team", "in der Unit", "in the product"; own names: "auf Ebene Squad". */
  inTeam: string;
  /** "im Bereich", "in der Abteilung", "in the area"; own names: "auf Ebene Tribe". */
  inArea: string;
  /** "Im Team" at the start of a phrase. */
  inTeamCap: string;
  /** "in der Organisation", "in the organisation"; an own name: "auf Ebene Konzern" (#328). */
  inOrg: string;
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
    const inArea = t(locale, 'level.custom.inArea', { name: area });
    const inTeamCap = t(locale, 'level.custom.inTeamCap', { name: team });
    return {
      org: names.organisation || t(locale, 'level.org'),
      orgLc: names.organisation || lc(t(locale, 'level.org')),
      area,
      areaLc: area,
      areas: area,
      areasLc: area,
      team,
      teamLc: team,
      teams: team,
      teamsLc: team,
      inTeam,
      inArea,
      inTeamCap,
      inOrg: names.organisation
        ? t(locale, 'level.custom.inArea', { name: names.organisation })
        : t(locale, 'level.inOrg'),
    };
  }
  const word = (k: string) => t(locale, `level.${names?.preset ?? 'area'}.${k}`);
  return {
    org: t(locale, 'level.org'),
    orgLc: lc(t(locale, 'level.org')),
    area: word('area'),
    areaLc: lc(word('area')),
    areas: word('areas'),
    areasLc: lc(word('areas')),
    team: word('team'),
    teamLc: lc(word('team')),
    teams: word('teams'),
    teamsLc: lc(word('teams')),
    inTeam: word('inTeam'),
    inArea: word('inArea'),
    inTeamCap: word('inTeamCap'),
    inOrg: t(locale, 'level.inOrg'),
  };
}

/** Placeholders every translated text can use, e.g. `{levelTeam}`. */
export function levelParams(w: LevelWords): Record<string, string> {
  return {
    levelOrg: w.org,
    levelOrgLc: w.orgLc,
    levelArea: w.area,
    levelAreaLc: w.areaLc,
    levelAreas: w.areas,
    levelAreasLc: w.areasLc,
    levelTeam: w.team,
    levelTeamLc: w.teamLc,
    levelTeams: w.teams,
    levelTeamsLc: w.teamsLc,
    levelInTeam: w.inTeam,
    levelInArea: w.inArea,
    levelInTeamCap: w.inTeamCap,
    levelInOrg: w.inOrg,
  };
}
