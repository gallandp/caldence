import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openExample, teamAction, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

/** The example with an area "Platform" over Team Alpha and Team Beta, on Meetings & cadence. */
async function openAreaMeetings(page: Page) {
  await openExample(page);
  await teamAction(page, 'Add area');
  const dialog = page.getByRole('dialog', { name: 'Add area' });
  await dialog.getByLabel('Area name').fill('Platform');
  for (const team of ['Team Alpha', 'Team Beta'])
    await dialog.getByRole('checkbox', { name: team }).check();
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('tab', { name: 'Meetings & cadence', exact: true }).click();
  return page.getByRole('tabpanel', { name: 'Meetings & cadence' });
}

/** Plans "Scrum of Scrums" with "Scrum Master from every team". */
async function addScrumOfScrums(page: Page) {
  const panel = page.getByRole('tabpanel', { name: 'Meetings & cadence' });
  await panel.getByRole('button', { name: 'Add meeting' }).click();
  const form = panel.locator('.eventform');
  await form.getByLabel('Name', { exact: true }).fill('Scrum of Scrums');
  await form.getByLabel('Role', { exact: true }).selectOption({ label: 'Scrum Master' });
  await expect(form.getByLabel('Who: Scrum Master')).toHaveValue('teams');
  return form;
}

test('an area plans its own meetings and invites a role from every team', async ({ page }) => {
  const panel = await openAreaMeetings(page);
  await expect(panel.getByText(/^Meetings of Platform\. For meetings of the teams/)).toBeVisible();
  await expect(panel.getByText(/^No cadence of its own/)).toBeVisible();

  const form = await addScrumOfScrums(page);
  // The row says whom it reaches, which team lacks the role, and who has no area hours.
  await expect(form.getByText('1 person: Sam (Team Alpha)')).toBeVisible();
  await expect(form.getByText('No Scrum Master in Team Beta')).toBeVisible();
  await expect(form.getByText('Sam has 0 h in the area')).toBeVisible();
  // The form's effect is measured in the area.
  await expect(form.locator('.effect')).toContainText('Meeting load · Platform');

  // Only the area's members count without "every team": here nobody.
  await form.getByLabel('Who: Scrum Master').selectOption({ label: 'Area' });
  await expect(form.getByText('Nobody has this role yet')).toBeVisible();
  await form.getByLabel('Who: Scrum Master').selectOption({ label: 'Every team' });
  await form.getByRole('button', { name: 'Save' }).click();

  const row = panel.getByRole('row', { name: /Scrum of Scrums/ });
  await expect(row.getByText('Scrum Master · every team (1)')).toBeVisible();
  await expect(row.getByText('No Scrum Master in Team Beta')).toBeVisible();
});

test('the area gets a cadence of its own and can drop it again', async ({ page }) => {
  const panel = await openAreaMeetings(page);
  await panel.getByRole('button', { name: 'Set cadence' }).click();
  await expect(panel.getByLabel('Length (weeks)')).toHaveValue('10');
  await panel.getByRole('button', { name: 'Remove cadence' }).click();
  await expect(panel.getByText(/^No cadence of its own/)).toBeVisible();
});

test('the area is a calendar of its own, also in the ZIP of the area', async ({ page }) => {
  await openAreaMeetings(page);
  const form = await addScrumOfScrums(page);
  await form.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('tab', { name: 'Import / Export', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: 'Import / Export' });
  // The selected area is preselected; its file holds its own meetings only.
  await expect(panel.getByLabel('Selected team or area')).toHaveValue(/.+/);
  let download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Export .ics…' }).click();
  let file = await download;
  expect(file.suggestedFilename()).toBe('caldence-platform.ics');
  const text = readFileSync((await file.path())!, 'utf8');
  expect(text).toContain('SUMMARY:Scrum of Scrums');
  expect(text).not.toContain('SUMMARY:Daily');

  download = page.waitForEvent('download');
  // The example has a second area, so the ZIP holds this area and its teams.
  await panel
    .getByRole('button', { name: 'One file for Platform and one per team (ZIP)…' })
    .click();
  file = await download;
  expect(readFileSync((await file.path())!).toString('latin1')).toContain('caldence-platform.ics');
});

test('an area without own meetings leads with one file per team', async ({ page }) => {
  await openAreaMeetings(page);
  await page.getByRole('tab', { name: 'Import / Export', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: 'Import / Export' });
  await expect(panel.getByLabel('Selected team or area')).toHaveValue(/.+/);
  await expect(panel.getByRole('button', { name: 'Export .ics…' })).toBeDisabled();
  const zip = panel.getByRole('button', {
    name: 'One file per team of Platform (ZIP)…',
  });
  await expect(zip).toBeEnabled();
  await expect(zip).toHaveClass(/primary/);
  await expect(
    panel.getByText(
      'Platform has no meetings of its own. One file per team of Platform (ZIP)… creates a file for each team.',
    ),
  ).toBeVisible();
  // A team with meetings leads with its own file again.
  await panel.getByLabel('Selected team or area').selectOption({ label: 'Team Alpha' });
  await expect(panel.getByRole('button', { name: 'Export .ics…' })).toHaveClass(/primary/);
  await expect(panel.getByRole('button', { name: 'One file per team (ZIP)…' })).not.toHaveClass(
    /primary/,
  );
});

for (const scheme of ['light', 'dark'] as const) {
  test(`axe finds no violations in the area meeting form and list (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openAreaMeetings(page);
    await addScrumOfScrums(page);
    const results = await new AxeBuilder({ page }).include('#panel-meetings').analyze();
    expect(results.violations).toEqual([]);
  });
}
