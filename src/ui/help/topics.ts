import { writable } from 'svelte/store';
import type { ViewId } from '../viewIcons';

/**
 * The help as topics: short guides for tasks and reference pages to look things up.
 *
 * A guide's steps are short. `text` and `control.name` are i18n keys; the text names the control
 * through the placeholder `{control}`, which is filled with the control's translated label, so the
 * help always names the real label. Other labels a step names are listed in `labels`
 * (placeholder -> i18n key). `control.name` may also be `template:<id>`: the name of that built-in
 * template in the UI language.
 */
export interface ManualControl {
  role: 'button' | 'tab' | 'link' | 'radio';
  name: string;
}

export interface ManualStep {
  text: string;
  control: ManualControl | null;
  labels?: Record<string, string>;
}

export type TopicId =
  | 'start'
  | 'calendar'
  | 'meetings'
  | 'load'
  | 'present'
  | 'team'
  | 'areas'
  | 'templates'
  | 'settings'
  | 'files'
  | 'views'
  | 'calc'
  | 'where'
  | 'keys'
  | 'a11y';

/** Colour family of a topic's icon tile. */
export type Tint = 'accent' | 'area' | 'ok' | 'warn' | 'hot';

export interface Topic {
  id: TopicId;
  kind: 'guide' | 'reference';
  /** i18n keys `help.topic.<id>.title` and `.summary`. */
  icon: string;
  tint: Tint;
  /** The view a guide is about: its page offers a button that opens it. */
  view?: Exclude<ViewId, 'help'>;
  steps?: ManualStep[];
}

const PLAY =
  'M6 4h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM12 17v4M8 21h8M10 8.5v4l3.5-2z';
const FILE =
  'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 11v6M9 14l3 3 3-3';
const SPARK =
  'M12 3l1.8 4.6L18.5 9l-4.7 1.5L12 15l-1.8-4.5L5.5 9l4.7-1.4zM18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z';
const CALC =
  'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01';
const PIN = 'M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z';
const KEY =
  'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 10h.01M11 10h.01M15 10h.01M7 14h10';
const A11Y = 'M12 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM5 8l7 1.5L19 8M12 9.5V14l-3 6M12 14l3 6';
const MAP = 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14';
const AREA = 'M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4';

/** The steps from the start screen to a new team. */
const START: ManualStep[] = [
  {
    text: 'help.first.step.start',
    control: { role: 'tab', name: 'view.calendar' },
    labels: { title: 'start.title' },
  },
  { text: 'help.first.step.open', control: { role: 'button', name: 'setup.open' } },
  {
    text: 'help.first.step.template',
    control: { role: 'radio', name: 'template:scrum' },
    labels: { group: 'setup.way' },
  },
  { text: 'help.first.step.next', control: { role: 'button', name: 'setup.next' } },
  {
    text: 'help.first.step.team',
    control: { role: 'button', name: 'setup.next' },
    labels: { field: 'templates.teamName', start: 'setup.start' },
  },
  { text: 'help.first.step.people', control: null, labels: { heading: 'setup.people' } },
  {
    text: 'help.first.step.frame',
    control: { role: 'button', name: 'setup.next' },
    labels: { heading: 'setup.frame', region: 'settings.region', none: 'settings.region.none' },
  },
  {
    text: 'help.first.step.create',
    control: { role: 'button', name: 'templates.create' },
    labels: { done: 'setup.done.title' },
  },
];

/** From a team to an .ics file of one person. */
const CALENDAR: ManualStep[] = [
  { text: 'help.g.calendar.1', control: { role: 'tab', name: 'view.exchange' } },
  {
    text: 'help.g.calendar.2',
    control: null,
    labels: {
      scope: 'exchange.export.scope',
      person: 'exchange.scope.person',
      pick: 'exchange.scope.pick.person',
    },
  },
  { text: 'help.g.calendar.3', control: { role: 'button', name: 'exchange.export.button' } },
];

export const TOPICS: Topic[] = [
  { id: 'start', kind: 'guide', icon: SPARK, tint: 'accent', steps: START },
  {
    id: 'calendar',
    kind: 'guide',
    icon: 'M7 7h13l-4-4M17 17H4l4 4',
    tint: 'ok',
    view: 'exchange',
    steps: CALENDAR,
  },
  {
    id: 'meetings',
    kind: 'guide',
    icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    tint: 'accent',
    view: 'meetings',
    steps: [
      { text: 'help.g.meetings.1', control: { role: 'tab', name: 'view.meetings' } },
      { text: 'help.g.meetings.2', control: null, labels: { edit: 'meet.edit' } },
      {
        text: 'help.g.meetings.3',
        control: null,
        labels: {
          duration: 'meet.duration',
          repeats: 'meet.ruletype',
          participants: 'meet.participants',
        },
      },
      {
        text: 'help.g.meetings.4',
        control: null,
        labels: { effect: 'whatif.effect', save: 'meet.save' },
      },
    ],
  },
  {
    id: 'load',
    kind: 'guide',
    icon: 'M5 20V11M10 20V5M15 20v-7M20 20V8',
    tint: 'warn',
    view: 'load',
    steps: [
      { text: 'help.g.load.1', control: { role: 'tab', name: 'view.load' } },
      {
        text: 'help.g.load.2',
        control: null,
        labels: { table: 'load.table.person', fte: 'load.col.fte' },
      },
      { text: 'help.g.load.3', control: null, labels: { warnings: 'load.warnings' } },
      {
        text: 'help.g.load.4',
        control: null,
        labels: { settings: 'view.settings', thresholds: 'settings.thresholds' },
      },
    ],
  },
  {
    id: 'present',
    kind: 'guide',
    icon: PLAY,
    tint: 'hot',
    steps: [
      { text: 'help.g.present.1', control: { role: 'button', name: 'file.present' } },
      { text: 'help.g.present.2', control: null },
      { text: 'help.g.present.3', control: null, labels: { hideNames: 'present.hideNames' } },
      {
        text: 'help.g.present.4',
        control: null,
        labels: { reset: 'whatif.reset', stop: 'file.present.stop' },
      },
    ],
  },
  {
    id: 'team',
    kind: 'guide',
    icon: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
    tint: 'accent',
    view: 'team',
    steps: [
      { text: 'help.g.team.1', control: { role: 'tab', name: 'view.team' } },
      { text: 'help.g.team.2', control: null, labels: { members: 'team.members' } },
      { text: 'help.g.team.3', control: null, labels: { hours: 'team.members.hours' } },
      { text: 'help.g.team.4', control: null },
    ],
  },
  {
    id: 'areas',
    kind: 'guide',
    icon: AREA,
    tint: 'area',
    steps: [
      {
        text: 'help.g.areas.1',
        control: { role: 'button', name: 'area.add' },
        labels: { actions: 'team.actions', team: 'team.switcher.label' },
      },
      { text: 'help.g.areas.2', control: null, labels: { teams: 'area.dialog.teams' } },
      { text: 'help.g.areas.3', control: null, labels: { structure: 'area.view.structure' } },
      { text: 'help.g.areas.4', control: null, labels: { overview: 'area.view.overview' } },
      {
        text: 'help.g.areas.5',
        control: null,
        labels: { participants: 'meet.participants', fromTeams: 'area.participants.fromTeams' },
      },
    ],
  },
  {
    id: 'settings',
    kind: 'guide',
    icon: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
    tint: 'warn',
    view: 'settings',
    steps: [
      { text: 'help.g.settings.1', control: { role: 'tab', name: 'view.settings' } },
      { text: 'help.g.settings.2', control: null, labels: { region: 'settings.region' } },
      {
        text: 'help.g.settings.3',
        control: null,
        labels: {
          hpw: 'settings.hoursPerWeek',
          workdays: 'settings.workdays',
          horizon: 'settings.horizon',
        },
      },
      {
        text: 'help.g.settings.4',
        control: null,
        labels: { thresholds: 'settings.thresholds', hourlyRate: 'settings.hourlyRate' },
      },
    ],
  },
  {
    id: 'files',
    kind: 'guide',
    icon: FILE,
    tint: 'hot',
    steps: [
      { text: 'help.g.files.1', control: { role: 'button', name: 'file.save' } },
      { text: 'help.g.files.2', control: null, labels: { open: 'file.open' } },
      { text: 'help.g.files.3', control: null, labels: { print: 'file.print' } },
      { text: 'help.g.files.4', control: null },
    ],
  },
  { id: 'views', kind: 'reference', icon: MAP, tint: 'accent' },
  {
    id: 'templates',
    kind: 'reference',
    icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 16.5h7M16.5 13v7',
    tint: 'ok',
  },
  { id: 'calc', kind: 'reference', icon: CALC, tint: 'warn' },
  { id: 'where', kind: 'reference', icon: PIN, tint: 'ok' },
  { id: 'keys', kind: 'reference', icon: KEY, tint: 'accent' },
  { id: 'a11y', kind: 'reference', icon: A11Y, tint: 'area' },
];

export const GUIDES = TOPICS.filter((t) => t.kind === 'guide');
export const REFERENCES = TOPICS.filter((t) => t.kind === 'reference');

export function topic(id: TopicId): Topic {
  return TOPICS.find((t) => t.id === id)!;
}

/** The open topic of the Help view, or null for its home page. Set it before showing Help. */
export const openTopic = writable<TopicId | null>(null);

/** A label that names another topic and opens it (links inside Help are `#help-<id>`). */
export function topicLink(id: TopicId): { key: string; href: string } {
  return { key: `help.topic.${id}.title`, href: '#help-' + id };
}

/** The views the home page shows at a glance, in the sidebar's order. */
export const MAP_VIEWS = [
  'calendar',
  'load',
  'meetings',
  'team',
  'templates',
  'settings',
  'exchange',
] as const;
