import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openExample, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const bar = (page: Page) => page.getByRole('banner');
const whatIfBar = (page: Page) => page.getByRole('region', { name: 'What if' });

async function present(page: Page) {
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(bar(page).getByText(/Presenting · changes only as what-ifs/)).toBeVisible();
}

async function openMeetings(page: Page) {
  await page.getByRole('tab', { name: /^Meetings/ }).click();
}

test('presenting hides editing and the workspace views; Escape ends it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openExample(page);
  await present(page);
  // File actions and the rail toggle step aside; the four views of the plan stay.
  for (const name of ['New', 'Open', 'Save', 'Save as'])
    await expect(bar(page).getByRole('button', { name, exact: true })).toBeHidden();
  await expect(page.locator('.rail-toggle')).toBeHidden();
  const tabs = page.getByRole('tablist', { name: 'Views' }).getByRole('tab');
  await expect(tabs).toHaveText(['Calendar', 'Meeting load', 'Meetings', 'Team']);
  await expect(page.locator('html')).toHaveClass(/presenting/);
  await expect(whatIfBar(page)).toContainText('While presenting, you can change');

  // Meetings: no add, no delete menu, no categories; the pencil is a what-if.
  await openMeetings(page);
  const panel = page.locator('#panel-meetings');
  await expect(panel.getByRole('button', { name: 'Add meeting' })).toBeHidden();
  await expect(panel.locator('[data-more]').first()).toBeHidden();
  await expect(
    panel.getByRole('button', { name: 'What if: Weekly Sync', exact: true }),
  ).toBeVisible();
  // "[" does not fold the sidebar and Ctrl+S saves nothing while presenting.
  await page.locator('#main').focus();
  await page.keyboard.press('[');
  await expect(page.locator('.layout')).toHaveClass(/present/);
  await page.keyboard.press('Control+s');
  await expect(bar(page).getByText('Untitled')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(bar(page).getByRole('button', { name: 'Present', exact: true })).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/presenting/);
  await expect(panel.getByRole('button', { name: 'Add meeting' })).toBeVisible();
});

test('a cadence what-if shows its effect, counts in the bar and is gone after Escape', async ({
  page,
}) => {
  await openExample(page);
  await present(page);
  await openMeetings(page);
  const cadence = page.locator('#panel-meetings .cadence');
  await expect(cadence).toContainText('Sprint · 2 weeks');
  await cadence.getByRole('button', { name: 'What if …' }).click();
  const sheet = page.getByRole('dialog', { name: 'Cadence · Team Alpha' });
  // A length that would cut off the sprint review is refused with the reason.
  await sheet.getByLabel('Length (weeks)').fill('1');
  await expect(sheet.getByText(/Sprint Review/)).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await sheet.getByLabel('Length (weeks)').fill('3');
  await expect(sheet.getByText('Hours in meetings, everyone')).toBeVisible();
  await expect(sheet.getByText(/^Meeting load · Team Alpha$/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Apply' }).click();
  await expect(sheet).toBeHidden();
  await expect(cadence).toContainText('Sprint · 3 weeks');
  await expect(whatIfBar(page)).toContainText('What if · 1 change');
  // Escape in a sheet closes only the sheet; on the page it ends presenting.
  await cadence.getByRole('button', { name: 'What if …' }).click();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(whatIfBar(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(whatIfBar(page)).toBeHidden();
  await expect(cadence).toContainText('Sprint · 2 weeks');
  // The file is as it was: nothing unsaved.
  await expect(bar(page).getByText('Unsaved changes')).toHaveCount(0);
});

test('a meeting what-if changes duration and rhythm; Reset brings the plan back', async ({
  page,
}) => {
  await openExample(page);
  await present(page);
  await openMeetings(page);
  const panel = page.locator('#panel-meetings');
  await panel.getByRole('button', { name: 'What if: Weekly Sync', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Weekly Sync' });
  await expect(sheet.getByText('What if', { exact: true })).toBeVisible();
  await sheet.getByLabel('Duration (minutes)').fill('30');
  // Twice the time for everyone in Weekly Sync: more hours per week.
  await expect(sheet.getByText(/^\+\d+\.\d h per week$/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Apply' }).click();
  const row = panel.locator('tr.row').filter({ hasText: 'Weekly Sync' });
  await expect(row).toContainText('30 min');
  await expect(whatIfBar(page)).toContainText('What if · 1 change');
  // Undo works on what-ifs as well.
  await page.locator('#main').focus();
  await page.keyboard.press('Control+z');
  await expect(row).toContainText('15 min');
  await panel.getByRole('button', { name: 'What if: Weekly Sync', exact: true }).click();
  await sheet.getByLabel('Duration (minutes)').fill('45');
  await sheet.getByRole('button', { name: 'Apply' }).click();
  await whatIfBar(page).getByRole('button', { name: 'Reset' }).click();
  await expect(row).toContainText('15 min');
  await expect(whatIfBar(page)).toContainText('While presenting, you can change');
});

test('names can be hidden while presenting and come back when it ends', async ({ page }) => {
  await openExample(page);
  await present(page);
  await page.getByRole('tab', { name: 'Meeting load', exact: true }).click();
  const people = page
    .getByRole('table', { name: 'Per person' })
    .or(page.getByRole('table', { name: 'People' }));
  await expect(people).toContainText('Alex');
  await bar(page).getByLabel('Hide names').check();
  await expect(people).not.toContainText('Alex');
  await expect(people).toContainText('Person 1');
  await bar(page).getByLabel('Hide names').uncheck();
  await expect(people).toContainText('Alex');
  await bar(page).getByLabel('Hide names').check();
  await bar(page).getByRole('button', { name: 'End presentation' }).click();
  await expect(people).toContainText('Alex');
  await expect(bar(page).getByText('Unsaved changes')).toHaveCount(0);
});

test('a reload while presenting brings back the plan without the what-ifs', async ({ page }) => {
  await openExample(page);
  await present(page);
  await openMeetings(page);
  const cadence = page.locator('#panel-meetings .cadence');
  await cadence.getByRole('button', { name: 'What if …' }).click();
  const sheet = page.getByRole('dialog', { name: 'Cadence · Team Alpha' });
  await sheet.getByLabel('Length (weeks)').fill('3');
  await sheet.getByRole('button', { name: 'Apply' }).click();
  await expect(cadence).toContainText('Sprint · 3 weeks');
  // Longer than the autosave delay, so a stored what-if would be on disk by now.
  await page.waitForTimeout(800);
  await page.reload();
  await openMeetings(page);
  await expect(page.locator('#panel-meetings .cadence')).toContainText('Sprint · 2 weeks');
  await expect(bar(page).getByRole('button', { name: 'Present', exact: true })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`axe finds no violations while presenting and in the what-if sheet (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openExample(page);
    await present(page);
    await openMeetings(page);
    const page1 = await new AxeBuilder({ page }).analyze();
    expect(page1.violations).toEqual([]);
    await page.getByRole('button', { name: 'What if: Weekly Sync', exact: true }).click();
    const sheet = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(sheet.violations).toEqual([]);
  });
}
