import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { emptyWorkspace } from '../../src/core/model';
import { openWorkspaceFile, pickUnit, teamAction, unitNames, useFileFallback } from './helpers';

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
  // "Scrum Master" is the obvious match for "Scrum Master/Team Coach": selected, to confirm.
  await row
    .getByRole('button', { name: 'No Scrum Master/Team Coach in North: choose the matching role' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'No Scrum Master/Team Coach in North' });
  const select = dialog.getByLabel('Scrum Master/Team Coach in North');
  await expect(select).toHaveValue('role-sm');
  await expect(dialog.getByText('Suggested because the names match.')).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('dialog[open]').analyze();
  expect(axe.violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();
  await expect(row.getByText('Scrum Master/Team Coach · every team (1)')).toBeVisible();
  await expect(row.getByText('No Scrum Master/Team Coach in North')).toHaveCount(0);

  // "Agile Team" has no obvious match: nothing is selected until the coach picks a role.
  await page.setViewportSize({ width: 390, height: 844 });
  await row.getByRole('button', { name: /^No Agile Team in North/ }).click();
  const agile = page.getByRole('dialog', { name: 'No Agile Team in North' });
  await expect(agile.getByLabel('Agile Team in North')).toHaveValue('');
  await expect(agile.getByText('Suggested because the names match.')).toHaveCount(0);
  // On a phone the dialog fits the screen.
  const box = (await agile.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await agile.getByLabel('Agile Team in North').selectOption({ label: 'Developers' });
  await agile.getByRole('button', { name: 'Apply' }).click();
  await expect(row.getByText('Agile Team · every team (2)')).toBeVisible();
  await expect(row.getByText(/in North$/)).toHaveCount(0);

  // The same mapping as in "Choose teams …".
  await page.setViewportSize({ width: 1440, height: 900 });
  await teamAction(page, 'Choose teams …');
  await expect(teams.getByLabel('Scrum Master/Team Coach in North')).toHaveValue('role-sm');
  await expect(teams.getByLabel('Agile Team in North')).toHaveValue('role-dev');
});
