import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openExample, openFixture, openTeamView, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const teamSelect = (page: Page) => page.locator('.switcher select');
const panel = (page: Page) => page.getByRole('tabpanel', { name: 'Team' });

async function addTeam(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add team' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add team' });
  await dialog.getByLabel('Team name').fill(name);
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();
}

test('a new team is selected and shows an empty members list with a hint', async ({ page }) => {
  await openExample(page);
  await openTeamView(page);
  await addTeam(page, 'Team B');
  await expect(teamSelect(page)).toHaveValue(/.+/);
  await expect(teamSelect(page).locator('option:checked')).toHaveText('Team B');
  await expect(panel(page).getByText('No members yet')).toBeVisible();
  await expect(panel(page).getByRole('table')).toHaveCount(0);
  await expect(panel(page).getByLabel('Length (weeks)')).toHaveValue('2');
});

test('the team switcher changes what the team view shows', async ({ page }) => {
  await openExample(page);
  await openTeamView(page);
  await expect(panel(page).getByLabel('Type')).toHaveValue('sprint');
  await expect(panel(page).getByLabel('Length (weeks)')).toHaveValue('2');
  await expect(panel(page).getByRole('table', { name: 'Members of Team Alpha' })).toBeVisible();
  await teamSelect(page).selectOption({ label: 'Team Beta' });
  await expect(panel(page).getByLabel('Type')).toHaveValue('flow');
  await expect(panel(page).getByLabel('Length (weeks)')).toHaveValue('1');
  await expect(panel(page).getByRole('table', { name: 'Members of Team Beta' })).toBeVisible();
});

test('duplicating a team copies its cadence', async ({ page }) => {
  await openExample(page);
  await openTeamView(page);
  await page.getByRole('button', { name: 'Duplicate team' }).click();
  await expect(teamSelect(page).locator('option:checked')).toHaveText('Team Alpha (copy)');
  await expect(panel(page).getByLabel('Type')).toHaveValue('sprint');
  await expect(panel(page).getByLabel('Length (weeks)')).toHaveValue('2');
  await expect(panel(page).getByLabel('Start date')).toHaveValue('2027-01-07');
});

test('selecting a person states that all teams are shown', async ({ page }) => {
  await openExample(page);
  await openTeamView(page);
  await addTeam(page, 'Team B');
  await panel(page).getByLabel('Person').selectOption({ label: 'Alex' });
  await panel(page).getByLabel('Role').selectOption({ label: 'Product Owner' });
  await panel(page).getByRole('button', { name: 'Add member' }).click();
  await expect(panel(page).getByRole('table')).toContainText('Alex');

  await expect(page.getByText('All teams')).toHaveCount(0);
  const bar = page.locator('.context');
  await bar.getByLabel('Person').selectOption({ label: 'Alex' });
  await expect(page.getByText('All teams')).toBeVisible();
  await bar.getByLabel('Person').selectOption({ label: 'All' });
  await expect(page.getByText('All teams')).toHaveCount(0);
});

test('a member that already exists is refused inline', async ({ page }) => {
  await openExample(page);
  await openTeamView(page);
  const person = panel(page).getByLabel('Person');
  await person.selectOption({ label: 'Alex' });
  await panel(page).getByLabel('Role').selectOption({ label: 'Product Owner' });
  await panel(page).getByRole('button', { name: 'Add member' }).click();
  await expect(panel(page).getByText('already has this role')).toBeVisible();
  await expect(person).toHaveAttribute('aria-invalid', 'true');
  await expect(person).toHaveAttribute('aria-describedby', /.+/);
  await panel(page).getByRole('button', { name: 'Remove Alex (Product Owner)' }).click();
  await expect(panel(page).getByText('already has this role')).toHaveCount(0);
  await expect(panel(page).getByRole('table')).not.toContainText('Product Owner');
});

test('cadence length is validated inline and the draft is kept', async ({ page }) => {
  await openExample(page);
  await openTeamView(page);
  const length = panel(page).getByLabel('Length (weeks)');
  await length.fill('0');
  await length.blur();
  await expect(length).toHaveAttribute('aria-invalid', 'true');
  await expect(length).toHaveValue('0');
  await length.fill('3');
  await length.blur();
  await expect(length).not.toHaveAttribute('aria-invalid', 'true');
  await panel(page).getByLabel('Type').selectOption('pi');
  await expect(panel(page).getByLabel('Type')).toHaveValue('pi');
});

test('removing or renaming the assumption used by scaling shows an inline error', async ({
  page,
}) => {
  await openFixture(page);
  await openTeamView(page);
  await expect(panel(page).getByLabel('Value of assumption stories')).toHaveValue('8');
  await panel(page).getByRole('button', { name: 'Remove assumption stories' }).click();
  const key = panel(page).getByLabel('Key of assumption stories');
  await expect(panel(page).getByText('Still in use: stories')).toBeVisible();
  await expect(key).toHaveAttribute('aria-invalid', 'true');
  await expect(key).toHaveAttribute('aria-describedby', /.+/);

  // Renaming is allowed and updates the scaling rule, so the new key is then in use too.
  await key.fill('tickets');
  await key.blur();
  await expect(panel(page).getByLabel('Key of assumption tickets')).toBeFocused();
  await expect(panel(page).getByText('Still in use')).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Remove assumption tickets' }).click();
  await expect(panel(page).getByText('Still in use: tickets')).toBeVisible();
});

test('assumptions are added, changed, renamed to a free key only, and removed', async ({
  page,
}) => {
  await openFixture(page);
  await openTeamView(page);
  await panel(page).getByLabel('New key').fill('bugs');
  await panel(page).getByLabel('New value').fill('2.5');
  await panel(page).getByRole('button', { name: 'Add assumption' }).click();
  await expect(panel(page).getByLabel('Value of assumption bugs')).toHaveValue('2.5');

  await panel(page).getByLabel('Value of assumption bugs').fill('4');
  await panel(page).getByLabel('Value of assumption bugs').blur();
  await expect(panel(page).getByLabel('Value of assumption bugs')).toHaveValue('4');

  const key = panel(page).getByLabel('Key of assumption bugs');
  await key.fill('stories');
  await key.blur();
  await expect(panel(page).getByText('Duplicate ID')).toBeVisible();
  await expect(key).toHaveValue('stories');

  await panel(page).getByLabel('New key').fill('bugs');
  await panel(page).getByLabel('New value').fill('');
  await panel(page).getByRole('button', { name: 'Add assumption' }).click();
  await expect(panel(page).getByText('Duplicate ID').first()).toBeVisible();

  await key.fill('defects');
  await key.blur();
  await panel(page).getByRole('button', { name: 'Remove assumption defects' }).click();
  await expect(panel(page).getByLabel('Key of assumption defects')).toHaveCount(0);
});

test('cycles and milestones can be edited; referenced ones cannot be dropped', async ({ page }) => {
  await openExample(page);
  await openTeamView(page);
  await panel(page).getByRole('button', { name: 'Delete milestone Release' }).click();
  await expect(panel(page).getByText('Still in use: Release')).toBeVisible();
  await expect(panel(page).getByLabel('Name of milestone Release')).toBeVisible();
  await panel(page).getByRole('button', { name: 'Delete cycle Release 1' }).click();
  await expect(panel(page).getByText('Still in use: Release 1')).toBeVisible();

  await panel(page).getByLabel('New cycle name').fill('Q3');
  await panel(page).getByRole('button', { name: 'Add cycle' }).click();
  const q3 = panel(page).getByRole('group', { name: 'Milestones of Q3' });
  await q3.getByLabel('New milestone name').fill('Beta');
  await q3.getByRole('button', { name: 'Add milestone' }).click();
  await expect(q3.getByText('Required field missing')).toBeVisible();
  await q3.getByLabel('New milestone date').fill('2027-09-01');
  await q3.getByRole('button', { name: 'Add milestone' }).click();
  await expect(q3.getByLabel('Name of milestone Beta')).toBeVisible();
  await q3.getByLabel('Date of milestone Beta').fill('2027-09-15');
  await q3.getByLabel('Date of milestone Beta').blur();
  await expect(q3.getByLabel('Date of milestone Beta')).toHaveValue('2027-09-15');
  await q3.getByRole('button', { name: 'Delete milestone Beta' }).click();
  await expect(q3.getByLabel('Name of milestone Beta')).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Delete cycle Q3' }).click();
  await expect(panel(page).getByRole('group', { name: 'Milestones of Q3' })).toHaveCount(0);
});

test('Plan another team runs the wizard and keeps known people', async ({ page }) => {
  await openExample(page);
  await openTeamView(page);
  const before = await page.getByLabel('Person', { exact: true }).first().locator('option').count();
  await page.getByRole('button', { name: 'Plan another team' }).click();
  const dialog = page.getByRole('dialog', { name: 'Plan new' });
  await dialog.getByRole('radio', { name: 'Kanban', exact: true }).check();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByLabel('Team name').fill('Team Gamma');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByText('Step 3 of 3')).toBeVisible();
  await expect(dialog.getByText(/already in the workspace/)).toBeVisible();
  const known = await page.evaluate(() =>
    document.querySelector('dialog[open] datalist option')?.getAttribute('value'),
  );
  expect(known).toBeTruthy();
  await dialog.locator('input[type="text"]').first().fill(known!);
  await dialog.getByRole('button', { name: 'Create team' }).click();
  await expect(dialog).toBeHidden();
  await expect(teamSelect(page).locator('option:checked')).toHaveText('Team Gamma');
  await expect(panel(page).getByRole('table')).toContainText(known!);
  await expect(page.getByLabel('Person', { exact: true }).first().locator('option')).toHaveCount(
    before,
  );
});

test('deleting a team needs confirmation', async ({ page }) => {
  await openExample(page);
  await openTeamView(page);
  await page.getByRole('button', { name: 'Delete team' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete Team Alpha?' });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(teamSelect(page).locator('option')).toHaveCount(2);

  await page.getByRole('button', { name: 'Delete team' }).click();
  await dialog.getByRole('button', { name: 'Delete team' }).click();
  await expect(teamSelect(page).locator('option')).toHaveCount(1);
  await expect(teamSelect(page).locator('option:checked')).toHaveText('Team Beta');

  await page.getByRole('button', { name: 'Delete team' }).click();
  await page
    .getByRole('dialog', { name: 'Delete Team Beta?' })
    .getByRole('button', { name: 'Delete team' })
    .click();
  await expect(teamSelect(page)).toHaveCount(0);
  await expect(page.getByLabel('Role', { exact: true })).toHaveCount(0);
  await expect(panel(page).getByText('There is no team yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add team' })).toBeFocused();
});

test('adding and renaming a team works by keyboard alone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add team' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').getByLabel('Team name')).toBeFocused();
  await page.keyboard.type('Keys');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add team' })).toBeFocused();
  await expect(teamSelect(page).locator('option:checked')).toHaveText('Keys');

  await page.getByRole('button', { name: 'Rename team' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Team name')).toHaveValue('Keys');
  await page.keyboard.type('Board');
  await page.keyboard.press('Enter');
  await expect(teamSelect(page).locator('option:checked')).toHaveText('Board');

  // Empty names are refused and Escape cancels.
  await page.getByRole('button', { name: 'Rename team' }).focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Team name').fill('');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Team name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('must not be empty')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(teamSelect(page).locator('option:checked')).toHaveText('Board');
});

test('a role filter is reset when the role is replaced and deleted', async ({ page }) => {
  await openExample(page);
  await openTeamView(page);
  await page.locator('.context').getByLabel('Role').selectOption({ label: 'Developer' });
  await page.getByRole('tab', { name: 'Workspace settings' }).click();
  await page.getByRole('button', { name: 'Delete Developer' }).click();
  await page
    .getByRole('dialog', { name: 'Replace Developer' })
    .getByRole('button', { name: 'Replace' })
    .click();
  await expect(page.locator('.context').getByLabel('Role')).toHaveValue('');
});

for (const locale of ['de', 'en'] as const) {
  test(`axe finds no violations in the team view (${locale})`, async ({ page }) => {
    await openExample(page);
    await page
      .getByRole('complementary')
      .getByLabel(/Language|Sprache/)
      .selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await page.getByRole('tab', { name: 'Team', exact: true }).click();
    const axe = () =>
      new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
    expect((await axe()).violations).toEqual([]);

    // With the person filter on (shows "All teams").
    await page
      .locator('.context')
      .getByLabel(/Person|Person/)
      .selectOption({ index: 1 });
    expect((await axe()).violations).toEqual([]);
    await page
      .locator('.context')
      .getByLabel(/Person/)
      .selectOption({ index: 0 });

    // Name dialog, with an error shown.
    await page.locator('.context .buttons button').nth(2).click();
    await page.getByRole('dialog').getByRole('textbox').fill('');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog').getByRole('textbox')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect((await axe()).violations).toEqual([]);
    await page.keyboard.press('Escape');

    // Confirm dialog.
    await page.locator('.context .buttons button').nth(4).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect((await axe()).violations).toEqual([]);
    await page.keyboard.press('Escape');

    // Inline errors in the panel.
    await page.locator('#panel-team input[type="number"]').first().fill('0');
    await page.locator('#panel-team input[type="number"]').first().blur();
    await expect(page.locator('#panel-team .field-error').first()).toBeVisible();
    expect((await axe()).violations).toEqual([]);
  });
}

test('shrinking the cadence below a meeting day explains why', async ({ page }) => {
  await openExample(page);
  await openTeamView(page);
  const length = panel(page).getByLabel('Length (weeks)');
  await length.fill('1');
  await length.blur();
  await expect(
    panel(page).getByText('Meeting “Sprint Review” is on day 14 and does not fit into 1 weeks.'),
  ).toBeVisible();
  await expect(length).toHaveAttribute('aria-invalid', 'true');
  await expect(length).toHaveAttribute('aria-describedby', /.+/);
  await expect(length).toHaveValue('1');
});

test('a refused removal keeps focus and links its error to the button', async ({ page }) => {
  await openExample(page);
  await openTeamView(page);
  const button = panel(page).getByRole('button', { name: 'Delete milestone Release' });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(panel(page).getByText('Still in use: Release')).toBeVisible();
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute('aria-describedby', /.+/);
});

test('the filter follows the active team', async ({ page }) => {
  await openExample(page);
  await openTeamView(page);
  await teamSelect(page).selectOption({ label: 'Team Beta' });
  await expect(page.getByText('All teams')).toHaveCount(0);
  await expect(page.locator('.context').getByLabel('Person')).toHaveValue('');
  await page.locator('.context').getByLabel('Person').selectOption({ label: 'Sam' });
  await expect(page.getByText('All teams')).toBeVisible();
  await teamSelect(page).selectOption({ label: 'Team Alpha' });
  await expect(page.getByText('All teams')).toBeVisible();
});

test('a duplicated team is named in the UI language', async ({ page }) => {
  await openExample(page);
  await page
    .getByRole('complementary')
    .getByLabel(/Language|Sprache/)
    .selectOption('de');
  await page.getByRole('button', { name: 'Team duplizieren' }).click();
  await expect(teamSelect(page).locator('option:checked')).toHaveText('Team Alpha (Kopie)');
});
