/**
 * The first steps of the manual, from the start screen to an .ics export.
 *
 * `text` and `control.name` are i18n keys. The text names the control through the placeholder
 * `{control}`, which is filled with the control's translated label, so the manual always names the
 * real label. Other labels a step names are listed in `labels` (placeholder -> i18n key).
 * `control.name` may also be `template:<id>`: the name of that built-in template in the UI language.
 */
export interface ManualControl {
  role: 'button' | 'tab' | 'link';
  name: string;
}

export interface ManualStep {
  text: string;
  control: ManualControl | null;
  labels?: Record<string, string>;
}

export const MANUAL_STEPS: ManualStep[] = [
  {
    text: 'help.first.step.start',
    control: { role: 'tab', name: 'view.calendar' },
    labels: { title: 'start.title' },
  },
  {
    text: 'help.first.step.template',
    control: { role: 'button', name: 'template:scrum' },
    labels: { group: 'start.template' },
  },
  {
    text: 'help.first.step.create',
    control: { role: 'button', name: 'templates.create' },
    labels: { field: 'templates.teamName' },
  },
  { text: 'help.first.step.settings', control: { role: 'tab', name: 'view.settings' } },
  {
    text: 'help.first.step.person',
    control: null,
    labels: {
      section: 'settings.people',
      field: 'settings.people.add',
      add: 'list.add',
      hours: 'settings.people.hoursLabel',
    },
  },
  {
    text: 'help.first.step.team',
    control: { role: 'tab', name: 'view.team' },
    labels: { members: 'team.members', person: 'team.members.person', role: 'team.members.role' },
  },
  { text: 'help.first.step.member', control: { role: 'button', name: 'team.members.add' } },
  {
    text: 'help.first.step.meetings',
    control: { role: 'tab', name: 'view.meetings' },
    labels: {
      rule: 'meet.col.rule',
      time: 'meet.col.time',
      duration: 'meet.col.duration',
      roles: 'meet.col.roles',
      edit: 'meet.edit',
    },
  },
  { text: 'help.first.step.calendar', control: { role: 'tab', name: 'view.calendar' } },
  {
    text: 'help.first.step.load',
    control: { role: 'tab', name: 'view.load' },
    labels: { table: 'load.table.person', fte: 'load.col.fte' },
  },
  {
    text: 'help.first.step.exchange',
    control: { role: 'tab', name: 'view.exchange' },
    labels: {
      scope: 'exchange.export.scope',
      person: 'exchange.scope.person',
      pick: 'exchange.scope.pick.person',
    },
  },
  { text: 'help.first.step.export', control: { role: 'button', name: 'exchange.export.button' } },
];
