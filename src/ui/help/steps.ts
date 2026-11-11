/**
 * The first steps of the manual, from the start screen to an .ics export.
 *
 * `text` and `control.name` are i18n keys. The text names the control through the placeholder
 * `{control}`, which is filled with the control's translated label, so the manual always names the
 * real label. Other labels a step names are listed in `labels` (placeholder -> i18n key).
 * `control.name` may also be `template:<id>`: the name of that built-in template in the UI language.
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

export const MANUAL_STEPS: ManualStep[] = [
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
  {
    text: 'help.first.step.people',
    control: null,
    labels: { heading: 'setup.people' },
  },
  {
    text: 'help.first.step.frame',
    control: { role: 'button', name: 'setup.next' },
    labels: { heading: 'setup.frame' },
  },
  {
    text: 'help.first.step.create',
    control: { role: 'button', name: 'templates.create' },
  },
  {
    text: 'help.first.step.meetings',
    control: { role: 'tab', name: 'view.meetings' },
    labels: {
      when: 'meet.col.when',
      next: 'meet.col.next',
      participants: 'meet.col.participants',
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
