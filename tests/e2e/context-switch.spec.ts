import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openExample, openTeamView, pickUnit, showView, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const panel = (page: Page, name: string) => page.getByRole('tabpanel', { name });

/** Alex is in Team Alpha and Team Beta in the example; Team Gamma makes three (#321). */
async function addAlexToGamma(page: Page, reason?: string) {
  await openTeamView(page);
  await pickUnit(page, 'Team Gamma');
  const team = panel(page, 'Team');
  await team.getByLabel('Person', { exact: true }).fill('Alex');
  const callout = team.locator('[data-context-add]');
  await expect(callout).toContainText('with Team Gamma, Alex would be in 3 teams');
  await expect(callout).toContainText('about 40%');
  if (reason !== undefined) {
    await callout.getByLabel('Override this hint on purpose').check();
    await callout.getByLabel('Reason (optional)').fill(reason);
    await expect(callout).toContainText('Please write nothing about the person');
  }
  await team.getByRole('button', { name: 'Add member' }).click();
  await expect(callout).toBeHidden();
  return team;
}

test('adding someone to a third team shows the hint and never blocks', async ({ page }) => {
  await openExample(page);
  const team = await addAlexToGamma(page);
  const note = team.locator('[data-context-hint]');
  await expect(note).toHaveText(/Context switching: 3 teams, about 40%/);

  // Overriding later on this membership: muted, with the reason, and it can be undone.
  await note.getByRole('button', { name: /Override the context-switch hint for Alex/ }).click();
  await note.getByLabel('Reason (optional)').fill('Release weeks');
  await note.getByRole('button', { name: 'Override', exact: true }).click();
  await expect(note).toContainText('overridden');
  await expect(note).toContainText('Release weeks');
  await note.getByRole('button', { name: /Undo the override for Alex/ }).click();
  await expect(note).not.toContainText('overridden');

  // Load: a tag on the row, the line among the hints, the full text in the person detail.
  await showView(page, 'Meeting load');
  const load = panel(page, 'Meeting load');
  const alex = load.locator('tr[data-person="person-alex"]');
  await expect(alex.locator('[data-context-tag]')).toHaveText('Context switching');
  await expect(load.locator('[data-context-hints]')).toContainText(
    'Alex: in 3 teams, about 40% of the time lost to switching',
  );
  await alex.getByRole('button', { name: 'Alex' }).click();
  await expect(load.locator('[data-context-detail]')).toContainText(
    'Context switching: Alex is in 3 teams.',
  );
});

test('an override given while adding is stored on that membership and ends with it', async ({
  page,
}) => {
  await openExample(page);
  const team = await addAlexToGamma(page, 'Migration until June');
  const note = team.locator('[data-context-hint]');
  await expect(note).toContainText('overridden');
  await expect(note).toContainText('Migration until June');

  // A fourth team changes the count: the override no longer holds.
  await pickUnit(page, 'Team Delta');
  await team.getByLabel('Person', { exact: true }).fill('Alex');
  await expect(team.locator('[data-context-add]')).toContainText('Alex would be in 4 teams');
  await team.getByRole('button', { name: 'Add member' }).click();
  await expect(team.locator('[data-context-hint]')).toContainText('4 teams, about 60%');
  await expect(team.locator('[data-context-hint]')).not.toContainText('overridden');
});

test('the threshold comes from Settings', async ({ page }) => {
  await openExample(page);
  await addAlexToGamma(page);
  await showView(page, 'Settings');
  await page.getByLabel('Context-switch hint from').fill('4');
  await page.getByLabel('Context-switch hint from').blur();
  await showView(page, 'Meeting load');
  await expect(panel(page, 'Meeting load').locator('[data-context-hints]')).toHaveCount(0);
});

test('presenting shows how many people, never their names', async ({ page }) => {
  await openExample(page);
  await addAlexToGamma(page);
  await showView(page, 'Meeting load');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const hints = panel(page, 'Meeting load').locator('[data-context-hints]');
  await expect(hints).toHaveText('1 person is in 3 or more teams.');
  await expect(panel(page, 'Meeting load').locator('[data-context-tag]')).toHaveCount(0);
});

test('axe finds no violations in the hint, its override and the load detail', async ({ page }) => {
  await openExample(page);
  await openTeamView(page);
  await pickUnit(page, 'Team Gamma');
  const team = panel(page, 'Team');
  await team.getByLabel('Person', { exact: true }).fill('Alex');
  await team.locator('[data-context-add]').getByLabel('Override this hint on purpose').check();
  const add = await new AxeBuilder({ page }).include('[data-context-add]').analyze();
  expect(add.violations).toEqual([]);
  await team.getByRole('button', { name: 'Add member' }).click();
  const note = await new AxeBuilder({ page }).include('[data-context-hint]').analyze();
  expect(note.violations).toEqual([]);
});

test('another name in the add form starts without the override and its reason', async ({
  page,
}) => {
  await openExample(page);
  await openTeamView(page);
  await pickUnit(page, 'Team Gamma');
  const team = panel(page, 'Team');
  const name = team.getByLabel('Person', { exact: true });
  await name.fill('Alex');
  const callout = team.locator('[data-context-add]');
  await callout.getByLabel('Override this hint on purpose').check();
  await callout.getByLabel('Reason (optional)').fill('Only for Alex');
  // Sam is in Team Alpha and Team Beta too.
  await name.fill('Sam');
  await expect(callout).toContainText('Sam would be in 3 teams');
  await expect(callout.getByLabel('Override this hint on purpose')).not.toBeChecked();
  await team.getByRole('button', { name: 'Add member' }).click();
  await expect(team.locator('[data-context-hint]').last()).not.toContainText('overridden');
});
