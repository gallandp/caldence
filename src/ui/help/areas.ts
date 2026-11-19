import type { ManualControl } from './topics';

/** The paragraphs of the manual's chapter on areas, in order (i18n keys `help.areas.<part>`). */
export const AREA_PARTS = [
  'what',
  'pages',
  'drill',
  'groups',
  'time',
  'invite',
  'org',
  'orgMeetings',
  'names',
] as const;

/** Labels the chapter names (placeholder -> i18n key, or `template:<id>`). */
export const AREA_LABELS: Record<string, string> = {
  add: 'area.add',
  actions: 'team.actions',
  team: 'team.switcher.label',
  area: 'view.area',
  structure: 'area.view.structure',
  overview: 'area.view.overview',
  how: 'overview.how',
  person: 'area.structure.add',
  teams: 'area.teams',
  areaOnly: 'area.group.areaOnly',
  both: 'area.group.both',
  teamOnly: 'area.group.teamOnly',
  participants: 'meet.participants',
  fromTeams: 'area.participants.fromTeams',
  fromAreas: 'org.participants.fromAreas',
  meetings: 'view.meetings',
  org: 'view.org',
  rename: 'org.rename',
  settings: 'view.settings',
  names: 'settings.levels.choice',
  safe: 'template:safe',
};

/**
 * The controls the chapter names that a reader finds on the page of a selected area; the manual
 * e2e test checks that each one exists, so the chapter cannot name a control that is gone.
 */
export const AREA_CONTROLS: (ManualControl & { label: string })[] = [
  { role: 'button', name: 'area.view.structure', label: 'structure' },
  { role: 'button', name: 'area.view.overview', label: 'overview' },
  { role: 'button', name: 'area.structure.add', label: 'person' },
  { role: 'button', name: 'area.teams', label: 'teams' },
];
