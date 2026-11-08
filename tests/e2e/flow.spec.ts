import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

// A Wednesday; the horizon of a new workspace starts here and runs for a year.
const TODAY = '2026-11-04';
const MEETING_DAY = '2026-11-11';

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const panel = (page: Page, name: RegExp | string) => page.getByRole('tabpanel', { name });

async function addTeam(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add team' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add team' });
  await dialog.getByLabel('Team name').fill(name);
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();
}

async function addMemberAndMeeting(page: Page, team: string, firstTeam: boolean) {
  await page.getByRole('combobox', { name: 'Team', exact: true }).selectOption({ label: team });
  await tab(page, 'Team').click();
  const teamPanel = panel(page, 'Team');
  await teamPanel.getByLabel('Person', { exact: true }).selectOption({ label: 'Kim' });
  await teamPanel.getByLabel('Role', { exact: true }).selectOption({ label: 'Product Owner' });
  await teamPanel.getByRole('button', { name: 'Add member' }).click();
  await expect(teamPanel.getByRole('table', { name: `Members of ${team}` })).toContainText('Kim');

  await tab(page, 'Meetings').click();
  const meetings = panel(page, 'Meetings');
  if (firstTeam) {
    await meetings.getByLabel('New category name').fill('Planning');
    await meetings.getByLabel('New category name').press('Enter');
  }
  await meetings.getByRole('button', { name: 'Add meeting' }).click();
  const form = meetings.getByRole('region', { name: 'New meeting' });
  await form.getByLabel('Name', { exact: true }).fill(`Sync ${team}`);
  await form.getByLabel('Weekday').selectOption({ label: 'Wednesday' });
  await form.getByLabel('Time (HH:MM)').fill('10:00');
  await form.getByLabel('Duration (minutes)').fill('60');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(meetings.getByRole('table', { name: `Meetings of ${team}` })).toContainText(
    `Sync ${team}`,
  );
}

async function expectEverything(page: Page) {
  await tab(page, 'Meetings').click();
  for (const team of ['Team A', 'Team B']) {
    await page.getByRole('combobox', { name: 'Team', exact: true }).selectOption({ label: team });
    const table = panel(page, 'Meetings').getByRole('table', { name: `Meetings of ${team}` });
    await expect(table).toContainText(`Sync ${team}`);
    await expect(table).toContainText('Weekly on Wednesday');
    await expect(table).toContainText('10:00');
    await expect(table).toContainText('Product Owner (100%)');
    await tab(page, 'Team').click();
    const members = panel(page, 'Team').getByRole('table', { name: `Members of ${team}` });
    await expect(members.getByRole('row').filter({ hasText: 'Kim' })).toContainText(
      'Product Owner',
    );
    await tab(page, 'Meetings').click();
  }
  await tab(page, 'Workspace settings').click();
  await expect(page.getByLabel('Name of Kim')).toBeVisible();
  await expect(page.getByLabel('Name of Product Owner')).toBeVisible();
  await expect(page.getByLabel('Name of Developer')).toBeVisible();
  await expect(page.getByLabel('Hours per week of Kim')).toHaveValue('30');
  await tab(page, 'Team').click();
  const options = page.getByRole('combobox', { name: 'Team', exact: true }).locator('option');
  await expect(options).toHaveText(['Team A', 'Team B']);

  await tab(page, 'Load').click();
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Kim' });
  await expect(
    panel(page, 'Load').getByRole('table', { name: 'Per role' }).locator('tr[data-role]').first(),
  ).toContainText('2.0');
  await tab(page, 'Calendar').click();
  const calendar = panel(page, 'Calendar');
  await calendar.locator(`td[data-date="${MEETING_DAY}"]`).click();
  await expect(
    calendar.getByText('Overlap: Sync Team A (Team A) and Sync Team B (Team B)'),
  ).toBeVisible();
}

test('from an empty workspace to saved, restored and reopened data', async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open the example' }).first()).toBeVisible();

  // Roles and a person in the workspace settings.
  await tab(page, 'Workspace settings').click();
  for (const role of ['Product Owner', 'Developer']) {
    await page.getByLabel('New role name').fill(role);
    await page.getByLabel('New role name').press('Enter');
  }
  await page.getByLabel('New person name').fill('Kim');
  await page.getByLabel('New person name').press('Enter');
  const hours = page.getByLabel('Hours per week of Kim');
  await hours.fill('30');
  await hours.blur();
  await expect(hours).toHaveValue('30');

  // Two teams with Kim as Product Owner and one weekly meeting each.
  await tab(page, 'Team').click();
  await addTeam(page, 'Team A');
  await addTeam(page, 'Team B');
  await addMemberAndMeeting(page, 'Team A', true);
  await addMemberAndMeeting(page, 'Team B', false);

  // The person filter combines both teams.
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Kim' });
  await tab(page, 'Load').click();
  const load = panel(page, 'Load');
  // Both meetings count one hour of Product Owner each week.
  await expect(
    load
      .getByRole('table', { name: 'Per role' })
      .locator('tr[data-role]')
      .first()
      .getByRole('cell')
      .first(),
  ).toHaveText('2.0');
  const kim = load.getByRole('table', { name: 'Per person' }).locator('tr[data-person]');
  await expect(kim).toHaveCount(1);
  // The average over the horizon is a little below 2.0 where a holiday skips a Wednesday.
  const average = Number((await kim.getByRole('cell').first().innerText()).replace(',', '.'));
  expect(average).toBeGreaterThanOrEqual(1.8);
  expect(average).toBeLessThanOrEqual(2);

  // Both meetings are on the same Wednesday at 10:00: the calendar shows the conflict.
  await tab(page, 'Calendar').click();
  const calendar = panel(page, 'Calendar');
  const day = calendar.locator(`td[data-date="${MEETING_DAY}"]`);
  await expect(day.getByRole('img', { name: 'Has overlap' })).toBeVisible();
  await day.click();
  await expect(
    calendar.getByText('Overlap: Sync Team A (Team A) and Sync Team B (Team B)'),
  ).toBeVisible();

  // Save as, reload (autosave), New (discard), then Open the downloaded file.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('workspace.caldence.json');
  const path = await file.path();
  await expect(page.getByText('✓ Saved')).toBeVisible();

  await page.reload();
  await expect(page.getByText('workspace.caldence.json')).toBeVisible();
  await expectEverything(page);

  await page.getByRole('button', { name: 'New', exact: true }).click();
  await tab(page, 'Team').click();
  await expect(page.getByText('There is no team yet.').first()).toBeVisible();

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  // The download lives under a temporary name, so the file is offered under its real one.
  await (
    await chooser
  ).setFiles({
    name: 'workspace.caldence.json',
    mimeType: 'application/json',
    buffer: readFileSync(path),
  });
  await expect(page.getByText('workspace.caldence.json')).toBeVisible();
  await expectEverything(page);
});

for (const locale of ['de', 'en'] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations in the help view (${locale}, ${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      await page.getByLabel(/Language|Sprache/).selectOption(locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await page
        .getByRole('tab', { name: locale === 'de' ? 'Hilfe' : 'Help', exact: true })
        .click();
      await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible();
      await expect(page.getByRole('table')).toHaveCount(3);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
}

test('the help view shows the platform key and the German texts', async ({ page }) => {
  await page.goto('/');
  await tab(page, 'Help').click();
  const keys = panel(page, 'Help').getByRole('table', { name: 'Keyboard shortcuts' });
  await expect(keys.getByRole('row').nth(1)).toContainText(/^(Ctrl|⌘)\+S\s*Save$/);
  await page.getByLabel('Language').selectOption('de');
  await expect(panel(page, 'Hilfe').getByRole('heading', { name: 'Erste Schritte' })).toBeVisible();
  await expect(panel(page, 'Hilfe').getByRole('table', { name: 'Tastenkürzel' })).toContainText(
    /Strg|⌘/,
  );
  await expect(panel(page, 'Hilfe').getByRole('heading', { name: 'Vorlagen' })).toBeVisible();
  await expect(
    panel(page, 'Hilfe').getByRole('heading', { name: 'In den eigenen Kalender importieren' }),
  ).toBeVisible();
  await page.getByLabel('Sprache').selectOption('en');
  await expect(panel(page, 'Help').getByRole('heading', { name: 'Templates' })).toBeVisible();
  await expect(
    panel(page, 'Help').getByRole('heading', { name: 'Import into your calendar' }),
  ).toBeVisible();
});
