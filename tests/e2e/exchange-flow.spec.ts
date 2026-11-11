import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { useFileFallback, teamAction } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const TODAY = '2027-03-17'; // a Wednesday
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const panel = (page: Page, name: string) => page.getByRole('tabpanel', { name });

const SCRUM_EVENTS = [
  'Daily Scrum',
  'Backlog Refinement',
  'Sprint Planning',
  'Sprint Review',
  'Sprint Retrospective',
];

test('Scrum template to .ics export, new workspace and import with a role', async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  await page.goto('/');

  // 1. Apply Scrum.
  await tab(page, 'Templates').click();
  await panel(page, 'Templates')
    .getByRole('article', { name: 'Scrum' })
    .getByRole('button', { name: 'Apply' })
    .click();
  const dialog = page.getByRole('dialog', { name: /Scrum/ });
  await dialog.getByRole('button', { name: 'Create team' }).click();
  await expect(dialog).toBeHidden();

  // 2. Add a person as Product Owner.
  await tab(page, 'Workspace settings').click();
  await page.getByLabel('New person name').fill('Kim');
  await page.getByLabel('New person name').press('Enter');
  await tab(page, 'Members & cadence').click();
  const team = panel(page, 'Members & cadence');
  await team.getByLabel('Person', { exact: true }).selectOption({ label: 'Kim' });
  await team.getByLabel('Role', { exact: true }).selectOption({ label: 'Product Owner' });
  await team.getByRole('button', { name: 'Add member' }).click();
  await expect(team.getByRole('table', { name: 'Members of Scrum' })).toContainText('Kim');

  // 3. Export that person as .ics.
  await tab(page, 'Import / Export').click();
  const exchange = panel(page, 'Import / Export');
  await exchange.getByRole('radio', { name: 'Person' }).check();
  await exchange.getByLabel('Selected person').selectOption({ label: 'Kim' });
  const download = page.waitForEvent('download');
  await exchange.getByRole('button', { name: 'Export .ics…' }).click();
  const file = await download;
  const text = readFileSync((await file.path())!, 'utf8');
  for (const name of SCRUM_EVENTS) expect(text).toContain(`SUMMARY:${name}`);

  // 4. Start a new workspace (discard).
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Unsaved changes' })
    .getByRole('button', { name: 'Discard' })
    .click();
  await tab(page, 'Members & cadence').click();
  await expect(page.getByText('There is no team yet.').first()).toBeVisible();

  // 5. A role, a category and an empty team, then import with that role.
  await tab(page, 'Workspace settings').click();
  await page.getByLabel('New role name').fill('Product Owner');
  await page.getByLabel('New role name').press('Enter');
  await tab(page, 'Members & cadence').click();
  await teamAction(page, 'Add team');
  const addTeam = page.getByRole('dialog', { name: 'Add team' });
  await addTeam.getByLabel('Team name').fill('Imported');
  await addTeam.getByRole('button', { name: 'Apply' }).click();
  await expect(addTeam).toBeHidden();
  await tab(page, 'Meetings').click();
  await panel(page, 'Meetings').getByLabel('New category name').fill('Scrum');
  await panel(page, 'Meetings').getByLabel('New category name').press('Enter');

  await tab(page, 'Import / Export').click();
  const chooser = page.waitForEvent('filechooser');
  await exchange.getByRole('button', { name: 'Choose .ics file…' }).click();
  await (
    await chooser
  ).setFiles({ name: 'scrum.ics', mimeType: 'text/calendar', buffer: Buffer.from(text) });
  const rows = exchange.locator('tbody tr');
  await expect(rows).toHaveCount(5);
  // A fresh workspace has a new id and no events: nothing counts as already present.
  await expect(exchange.getByText('Already in Caldence')).toHaveCount(0);
  await exchange.getByRole('checkbox', { name: 'Product Owner' }).check();
  await exchange.getByRole('button', { name: 'Import 5 meetings' }).click();
  await expect(exchange.getByRole('status')).toContainText('5 meetings were imported');
  await exchange.getByRole('button', { name: 'Open Meetings' }).click();

  const table = panel(page, 'Meetings').getByRole('table', { name: 'Meetings of Imported' });
  for (const name of SCRUM_EVENTS) {
    await expect(table.getByRole('row').filter({ hasText: name })).toHaveCount(1);
  }
  await expect(table.getByRole('row').filter({ hasText: 'Sprint Planning' })).toContainText(
    'Every 2 weeks on',
  );
});
