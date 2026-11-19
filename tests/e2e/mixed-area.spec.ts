import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { emptyWorkspace } from '../../src/core/model';
import {
  openWorkspaceFile,
  pickUnit,
  showAreaPage,
  teamAction,
  unitNames,
  useFileFallback,
} from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const TODAY = '2027-03-17';

/** A file with one Scrum team "North": a PO, a Scrum Master and two Developers. */
function northWorkspace() {
  const ws = emptyWorkspace(TODAY);
  ws.settings.locale = 'en';
  ws.roles = [
    { id: 'role-po', name: 'Product Owner', colour: '#2563eb' },
    { id: 'role-sm', name: 'Scrum Master', colour: '#9333ea' },
    { id: 'role-dev', name: 'Developers', colour: '#16a34a' },
  ];
  ws.people = ['Ann', 'Ben', 'Cleo', 'Dan'].map((name) => ({ id: `p-${name}`, name }));
  ws.teams = [
    {
      id: 'team-north',
      name: 'North',
      cadence: { kind: 'sprint', lengthWeeks: 2, start: '2027-03-15' },
      members: [
        { personId: 'p-Ann', roleId: 'role-po' },
        { personId: 'p-Ben', roleId: 'role-sm' },
        { personId: 'p-Cleo', roleId: 'role-dev' },
        { personId: 'p-Dan', roleId: 'role-dev' },
      ],
      memberHours: {},
      assumptions: {},
      cycles: [],
      events: [],
    },
  ];
  return ws;
}

/** Opens North's file and adds a SAFe team "Star", which brings its Release Train. */
async function addSafeTeam(page: Page) {
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  await page.goto('/');
  await openWorkspaceFile(page, northWorkspace());
  await page.getByRole('tab', { name: 'Templates', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: 'Templates' });
  await panel.getByRole('article', { name: 'SAFe' }).getByRole('button', { name: 'Apply' }).click();
  const dialog = page.getByRole('dialog', { name: /SAFe/ });
  await dialog.getByLabel('Team name').fill('Star');
  await dialog.getByRole('button', { name: 'Create team' }).click();
  await expect(dialog).toBeHidden();
}

test('a SAFe team in a Scrum file keeps the level words and maps the roles (#338)', async ({
  page,
}) => {
  await addSafeTeam(page);
  await expect(unitNames(page)).toHaveText(['Release Train', 'Star', 'North']);
  // The file had a team already: its levels are still "area" and "team", not "release train".
  await page.locator('.switcher .pick').click();
  await expect(
    page
      .locator('.switcher .list')
      .getByRole('button', { name: /^Release Train\W+area\W+1 team$/ }),
  ).toBeVisible();
  await page.locator('.switcher .pick').click();

  await pickUnit(page, 'Release Train');
  await teamAction(page, 'Choose teams …');
  const dialog = page.getByRole('dialog', { name: 'Teams in Release Train' });
  await dialog.getByRole('checkbox', { name: 'North' }).check();
  // North calls two of the train's roles differently: one select each.
  const roles = dialog.getByRole('group', { name: 'Roles for the meetings in the area' });
  await expect(roles.getByRole('combobox')).toHaveCount(2);
  const axe = await new AxeBuilder({ page }).include('dialog[open]').analyze();
  expect(axe.violations).toEqual([]);
  await roles.getByLabel('Agile Team in North').selectOption({ label: 'Developers' });
  await roles
    .getByLabel('Scrum Master/Team Coach in North')
    .selectOption({ label: 'Scrum Master' });
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();

  // PI Planning invites North's Scrum Master and both Developers; nothing is missing in North.
  await page.getByRole('tab', { name: 'Meetings & cadence', exact: true }).click();
  const row = page
    .getByRole('tabpanel', { name: 'Meetings & cadence' })
    .getByRole('row', { name: /PI Planning day 1/ });
  await expect(row.getByText('Agile Team · every team (2)')).toBeVisible();
  await expect(row.getByText('Scrum Master/Team Coach · every team (1)')).toBeVisible();
  await expect(row.getByText(/in North$/)).toHaveCount(0);

  // The mapping is kept and shown again when the teams are chosen next time.
  await teamAction(page, 'Choose teams …');
  await expect(dialog.getByLabel('Agile Team in North')).toHaveValue('role-dev');
});

test('a "missing in team" note maps the role right there, with the obvious match selected (#362)', async ({
  page,
}) => {
  await addSafeTeam(page);
  await pickUnit(page, 'Release Train');
  await teamAction(page, 'Choose teams …');
  const teams = page.getByRole('dialog', { name: 'Teams in Release Train' });
  await teams.getByRole('checkbox', { name: 'North' }).check();
  await teams.getByRole('button', { name: 'Apply' }).click();
  await expect(teams).toBeHidden();

  await page.getByRole('tab', { name: 'Meetings & cadence', exact: true }).click();
  const row = page
    .getByRole('tabpanel', { name: 'Meetings & cadence' })
    .getByRole('row', { name: /PI Planning day 1/ });
  const smPill = row.getByRole('button', {
    name: 'No Scrum Master/Team Coach in North: choose the matching role',
  });
  const agilePill = row.getByRole('button', { name: /^No Agile Team in North/ });
  // Escape and Cancel leave the file as it was and return focus to the note.
  await smPill.click();
  const dialog = page.getByRole('dialog', { name: 'No Scrum Master/Team Coach in North' });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(smPill).toBeFocused();
  await smPill.click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(smPill).toBeFocused();
  // "Scrum Master" is the obvious match for "Scrum Master/Team Coach": selected, to confirm.
  await smPill.click();
  const select = dialog.getByLabel('Scrum Master/Team Coach in North');
  await expect(select).toHaveValue('role-sm');
  await expect(dialog.getByText('Suggested because the names are alike.')).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('dialog[open]').analyze();
  expect(axe.violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();
  await expect(row.getByText('Scrum Master/Team Coach · every team (1)')).toBeVisible();
  await expect(row.getByText('No Scrum Master/Team Coach in North')).toHaveCount(0);
  // The note is gone: focus moves on to the meeting's next note.
  await expect(agilePill).toBeFocused();

  // "Agile Team" has no obvious match: nothing is selected until the coach picks a role.
  await page.setViewportSize({ width: 390, height: 844 });
  await agilePill.click();
  const agile = page.getByRole('dialog', { name: 'No Agile Team in North' });
  await expect(agile.getByLabel('Agile Team in North')).toHaveValue('');
  await expect(agile.getByText('Suggested because the names are alike.')).toHaveCount(0);
  // On a phone the dialog fits the screen.
  const box = (await agile.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await agile.getByLabel('Agile Team in North').selectOption({ label: 'Developers' });
  await agile.getByRole('button', { name: 'Apply' }).click();
  await expect(row.getByText('Agile Team · every team (2)')).toBeVisible();
  await expect(row.getByText(/in North$/)).toHaveCount(0);
  // No note left to map: focus stays in the meeting, on its list of who is invited.
  await expect(row.locator('ul.area-roles')).toBeFocused();

  // The same mapping as in "Choose teams …".
  await page.setViewportSize({ width: 1440, height: 900 });
  await teamAction(page, 'Choose teams …');
  await expect(teams.getByLabel('Scrum Master/Team Coach in North')).toHaveValue('role-sm');
  await expect(teams.getByLabel('Agile Team in North')).toHaveValue('role-dev');
});

test('while presenting, a "missing in team" note is plain text (#362)', async ({ page }) => {
  await addSafeTeam(page);
  await pickUnit(page, 'Release Train');
  await teamAction(page, 'Choose teams …');
  const teams = page.getByRole('dialog', { name: 'Teams in Release Train' });
  await teams.getByRole('checkbox', { name: 'North' }).check();
  await teams.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('tab', { name: 'Meetings & cadence', exact: true }).click();
  // While presenting the tabs step aside, so the row is found in the panel by its id.
  const row = page.locator('#panel-meetings').getByRole('row', { name: /PI Planning day 1/ });
  await expect(row.getByRole('button', { name: /^No Agile Team in North/ })).toBeVisible();
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(row.getByText('No Agile Team in North')).toBeVisible();
  await expect(row.getByRole('button', { name: /^No Agile Team in North/ })).toHaveCount(0);
});

/** Adds Star's Release Train with North in it, the train selected. */
async function trainWithNorth(page: Page) {
  await addSafeTeam(page);
  await pickUnit(page, 'Release Train');
  await teamAction(page, 'Choose teams …');
  const teams = page.getByRole('dialog', { name: 'Teams in Release Train' });
  await teams.getByRole('checkbox', { name: 'North' }).check();
  await teams.getByRole('button', { name: 'Apply' }).click();
  await expect(teams).toBeHidden();
}

test('the "missing in team" note in the structure tree maps the role too (#433)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await trainWithNorth(page);
  await page.getByRole('tab', { name: 'Area', exact: true }).click();
  await showAreaPage(page, 'Structure');
  const chip = page.getByRole('button', { name: /^PI Planning day 1/ });
  await chip.click();
  const sm = page.getByRole('button', {
    name: 'No Scrum Master/Team Coach in North: choose the matching role',
  });
  const agile = page.getByRole('button', { name: /^No Agile Team in North/ });
  const dialog = page.getByRole('dialog', { name: 'No Scrum Master/Team Coach in North' });
  // Escape and Cancel return focus to the note.
  await sm.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(sm).toBeFocused();
  await sm.click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(sm).toBeFocused();
  await sm.click();
  await expect(dialog.getByLabel('Scrum Master/Team Coach in North')).toHaveValue('role-sm');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('No Scrum Master/Team Coach in North')).toHaveCount(0);
  // The note is gone: focus moves on to the next one, then to the meeting.
  await expect(agile).toBeFocused();
  await agile.click();
  const other = page.getByRole('dialog', { name: 'No Agile Team in North' });
  await other.getByLabel('Agile Team in North').selectOption({ label: 'Developers' });
  await other.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText(/^No .* in North$/)).toHaveCount(0);
  await expect(chip).toBeFocused();

  // While presenting, the note is plain text.
  await teamAction(page, 'Choose teams …');
  const teams = page.getByRole('dialog', { name: 'Teams in Release Train' });
  await teams.getByLabel('Agile Team in North').selectOption({ label: 'Nobody' });
  await teams.getByRole('button', { name: 'Apply' }).click();
  await expect(agile).toBeVisible();
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(page.getByText('No Agile Team in North')).toBeVisible();
  await expect(agile).toHaveCount(0);
});

test('the "missing in team" hint in the meeting form maps the role; the form stays open (#433)', async ({
  page,
}) => {
  await trainWithNorth(page);
  await page.getByRole('tab', { name: 'Meetings & cadence', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: 'Meetings & cadence' });
  await panel
    .getByRole('row', { name: /PI Planning day 1/ })
    .getByRole('button', { name: 'Edit PI Planning day 1' })
    .click();
  const form = panel.locator('.eventform');
  const sm = form.getByRole('button', {
    name: 'No Scrum Master/Team Coach in North: choose the matching role',
  });
  const dialog = page.getByRole('dialog', { name: 'No Scrum Master/Team Coach in North' });
  // Escape closes the mapping only, not the form.
  await sm.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(form).toBeVisible();
  await expect(sm).toBeFocused();
  await sm.click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(sm).toBeFocused();
  // Apply maps the role without saving or closing the form.
  await sm.click();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();
  await expect(form).toBeVisible();
  await expect(form.getByText('No Scrum Master/Team Coach in North')).toHaveCount(0);
  // The hint is gone: focus goes to its row's "who" choice.
  await expect(form.getByLabel('Who: Scrum Master/Team Coach')).toBeFocused();
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(form).toBeHidden();
  await teamAction(page, 'Choose teams …');
  await expect(
    page
      .getByRole('dialog', { name: 'Teams in Release Train' })
      .getByLabel('Scrum Master/Team Coach in North'),
  ).toHaveValue('role-sm');
});
