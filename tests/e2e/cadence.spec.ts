import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openExample, teamAction, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const teamSelect = (page: Page) => page.locator('.switcher select');
const panel = (page: Page) =>
  page.getByRole('tabpanel', { name: /^(Meetings & cadence|Termine & Takt)$/ });
const cadence = (page: Page) => panel(page).getByRole('region', { name: 'Cadence' });

async function openMeetings(page: Page) {
  await openExample(page);
  await page.getByRole('tab', { name: 'Meetings & cadence', exact: true }).click();
  await expect(panel(page).getByRole('table', { name: 'Meetings of Team Alpha' })).toBeVisible();
}

async function editCadence(page: Page) {
  const change = cadence(page).getByRole('button', { name: 'Change cadence' });
  await change.click();
  await expect(cadence(page).getByRole('button', { name: 'Done' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
}

test('the cadence is one line above the meetings and opens for changes', async ({ page }) => {
  await openMeetings(page);
  await expect(cadence(page)).toContainText('Sprint · 2 weeks · from 01/07/2027');
  await expect(cadence(page).getByLabel('Length (weeks)')).toBeHidden();
  await editCadence(page);
  await cadence(page).getByLabel('Length (weeks)').fill('3');
  await cadence(page).getByLabel('Length (weeks)').blur();
  await expect(cadence(page)).toContainText('Sprint · 3 weeks · from 01/07/2027');
  await cadence(page).getByRole('button', { name: 'Done' }).click();
  await expect(cadence(page).getByLabel('Length (weeks)')).toBeHidden();
  await expect(cadence(page).getByRole('button', { name: 'Change cadence' })).toBeFocused();
});

test('the cadence follows the team switcher and a duplicated team', async ({ page }) => {
  await openMeetings(page);
  await teamSelect(page).selectOption({ label: 'Team Beta' });
  await expect(cadence(page)).toContainText('Flow · 1 week ·');
  await teamSelect(page).selectOption({ label: 'Team Alpha' });
  await teamAction(page, 'Duplicate team');
  await expect(teamSelect(page).locator('option:checked')).toHaveText('Team Alpha (copy)');
  await editCadence(page);
  await expect(cadence(page).getByLabel('Type')).toHaveValue('sprint');
  await expect(cadence(page).getByLabel('Length (weeks)')).toHaveValue('2');
  await expect(cadence(page).getByLabel('Start date')).toHaveValue('2027-01-07');
});

test('cadence length is validated inline and the draft is kept', async ({ page }) => {
  await openMeetings(page);
  await editCadence(page);
  const length = cadence(page).getByLabel('Length (weeks)');
  await length.fill('0');
  await length.blur();
  await expect(length).toHaveAttribute('aria-invalid', 'true');
  await expect(length).toHaveValue('0');
  await length.fill('3');
  await length.blur();
  await expect(length).not.toHaveAttribute('aria-invalid', 'true');
  await cadence(page).getByLabel('Type').selectOption('pi');
  await expect(cadence(page).getByLabel('Type')).toHaveValue('pi');
});

test('shrinking the cadence below a meeting day explains why', async ({ page }) => {
  await openMeetings(page);
  await editCadence(page);
  const length = cadence(page).getByLabel('Length (weeks)');
  await length.fill('1');
  await length.blur();
  await expect(
    cadence(page).getByText('Meeting “Sprint Review” is on day 14 and does not fit into 1 weeks.'),
  ).toBeVisible();
  await expect(length).toHaveAttribute('aria-invalid', 'true');
  await expect(length).toHaveAttribute('aria-describedby', /.+/);
  await expect(length).toHaveValue('1');
  // Done drops the refused draft; the saved cadence stays.
  await cadence(page).getByRole('button', { name: 'Done' }).click();
  await expect(cadence(page)).toContainText('Sprint · 2 weeks');
  await expect(cadence(page).getByText(/does not fit/)).toHaveCount(0);
});

test('changing the cadence keeps an open meeting form', async ({ page }) => {
  await openMeetings(page);
  await panel(page).getByRole('button', { name: 'Add meeting' }).click();
  const form = panel(page).getByRole('region', { name: 'New meeting' });
  await form.getByLabel('Name', { exact: true }).fill('Keep me');
  await editCadence(page);
  await cadence(page).getByLabel('Length (weeks)').fill('3');
  await cadence(page).getByLabel('Length (weeks)').blur();
  await expect(cadence(page)).toContainText('3 weeks');
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('Keep me');
});

test('cycles and milestones can be edited; referenced ones cannot be dropped', async ({ page }) => {
  await openMeetings(page);
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

test('a refused removal keeps focus and links its error to the button', async ({ page }) => {
  await openMeetings(page);
  const button = panel(page).getByRole('button', { name: 'Delete milestone Release' });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(panel(page).getByText('Still in use: Release')).toBeVisible();
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute('aria-describedby', /.+/);
});

test('each cycle names its number of milestones', async ({ page }) => {
  await openMeetings(page);
  const cycle = panel(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('textbox', { name: 'Name of cycle Release 1' }) });
  await expect(cycle).toContainText('1 milestone');
});

for (const lang of ['de', 'en'] as const) {
  test(`axe finds no violations in cadence and cycles (${lang})`, async ({ page }) => {
    await openMeetings(page);
    if (lang === 'de')
      await page
        .getByRole('complementary')
        .getByLabel(/Language|Sprache/)
        .selectOption('de');
    await panel(page)
      .getByRole('button', { name: lang === 'de' ? 'Takt ändern' : 'Change cadence' })
      .click();
    await panel(page)
      .getByLabel(lang === 'de' ? 'Länge (Wochen)' : 'Length (weeks)')
      .fill('0');
    await panel(page)
      .getByLabel(lang === 'de' ? 'Länge (Wochen)' : 'Length (weeks)')
      .blur();
    await panel(page)
      .getByRole('button', {
        name: lang === 'de' ? 'Meilenstein Release löschen' : 'Delete milestone Release',
      })
      .click();
    await expect(panel(page).locator('.field-error')).toHaveCount(2);
    const result = await new AxeBuilder({ page }).include('#panel-meetings').analyze();
    expect(result.violations).toEqual([]);
  });
}

test('another team starts with its cadence closed and no drafts of the first team', async ({
  page,
}) => {
  await openMeetings(page);
  await editCadence(page);
  await panel(page).getByLabel('New cycle name').fill('Draft');
  await teamSelect(page).selectOption({ label: 'Team Beta' });
  await expect(cadence(page).getByRole('button', { name: 'Change cadence' })).toBeVisible();
  await expect(cadence(page).getByLabel('Length (weeks)')).toBeHidden();
  await expect(panel(page).getByLabel('New cycle name')).toHaveValue('');
});
