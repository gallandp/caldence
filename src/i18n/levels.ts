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
  /** The plural after "in 3 …" / "ab 3 …": "Produkten", "Teams"; own names as typed. */
  teamsDat: string;
  /** "im Team", "in der Unit", "in the product"; own names: "auf Ebene Squad". */
  inTeam: string;
  /** "im Bereich", "in der Abteilung", "in the area"; own names: "auf Ebene Tribe". */
  inArea: string;
  /** "Im Team" at the start of a phrase. */
  inTeamCap: string;
  /** The line levels (#316): a unit with sub-units and one without, from Settings or defaults. */
  lineGroup: string;
  lineTeam: string;
  lineGroupLc: string;
  lineTeamLc: string;
  /** The line's company level (#399). */
  lineCompany: string;
  lineCompanyLc: string;
}

/**
 * The words for a workspace's level names, without a setting Bereich/Team (Area/Team). Own names
 * are used as typed, in phrases that need no article, because their grammar is unknown.
 */
export function levelWords(
  names: LevelNames | undefined,
  locale: Locale,
  line?: { group: string; team: string; company?: string },
): LevelWords {
  const lineGroup = line?.group.trim() || t(locale, 'line.level.group');
  const lineTeam = line?.team.trim() || t(locale, 'line.level.team');
  const lineCompany = line?.company?.trim() || t(locale, 'line.level.company');
  // Own names stay as typed; the default English words are lower case inside a sentence.
  const lineLc = (own: string | undefined, word: string) =>
    own?.trim() || locale !== 'en' ? word : word.toLowerCase();
  const lineWords = {
    lineGroup,
    lineTeam,
    lineGroupLc: lineLc(line?.group, lineGroup),
    lineTeamLc: lineLc(line?.team, lineTeam),
    lineCompany,
    lineCompanyLc: lineLc(line?.company, lineCompany),
  };
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
      teamsDat: team,
      inTeam,
      inArea,
      inTeamCap,
      ...lineWords,
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
    teamsDat: lc(word('teamsDat')),
    inTeam: word('inTeam'),
    inArea: word('inArea'),
    inTeamCap: word('inTeamCap'),
    ...lineWords,
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
    levelTeamsDat: w.teamsDat,
    levelInTeam: w.inTeam,
    levelInArea: w.inArea,
    levelInTeamCap: w.inTeamCap,
    levelLineGroup: w.lineGroup,
    levelLineTeam: w.lineTeam,
    levelLineGroupLc: w.lineGroupLc,
    levelLineTeamLc: w.lineTeamLc,
    levelLineCompany: w.lineCompany,
    levelLineCompanyLc: w.lineCompanyLc,
  };
}

/** The word for a line unit's level (#399); the organisation is the root of the line (#395). */
export const lineLevelWord = (w: LevelWords, kind: 'org' | 'company' | 'group' | 'team'): string =>
  kind === 'org'
    ? w.org
    : kind === 'company'
      ? w.lineCompany
      : kind === 'group'
        ? w.lineGroup
        : w.lineTeam;
