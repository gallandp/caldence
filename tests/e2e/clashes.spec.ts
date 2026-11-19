import { expect, test } from '@playwright/test';
import { ALEX_CLASHES, COMMERCE_CLASH_DAYS } from './calendar-expected';
import { openExample, pickUnit, setLanguage, showView, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
  // The overview starts in the current week: the first week of the example horizon.
  await page.clock.setFixedTime(new Date('2027-01-05T10:00:00'));
  await openExample(page);
  await setLanguage(page, 'en');
});

test('the area overview counts clash days and opens the example in the calendar', async ({
  page,
}) => {
  await pickUnit(page, 'Commerce');
  await showView(page, 'Area');
  await page.getByRole('group', { name: 'Page' }).getByRole('button', { name: 'Overview' }).click();
  const line = page.locator('[data-area-overview] [data-clashes]');
  await expect(line).toContainText(`Overlaps in the next 12 weeks: ${COMMERCE_CLASH_DAYS} days`);
  const example = line.getByRole('button');
  await expect(example).toHaveText(
    'e.g. Robin: Sprint Planning (Team Gamma) and Replenishment (Team Delta) on Mon 01/04/2027, 11:00–11:30',
  );
  await example.click();

  // The calendar shows that week for Robin, with the overlap named.
  const panel = page.getByRole('tabpanel', { name: 'Calendar' });
  await expect(panel.getByRole('button', { name: 'Week', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(panel.locator('[aria-live="polite"]')).toContainText('Week 1');
  await expect(page.getByLabel('Person', { exact: true })).toHaveValue('person-robin');
  const monday = panel.locator('section', {
    has: page.getByRole('heading', { name: 'Monday, January 4, 2027' }),
  });
  await expect(
    monday.getByText('Overlap: Sprint Planning (Team Gamma) and Replenishment (Team Delta)'),
  ).toBeVisible();
  // One click leads back to the overview.
  await page.getByRole('button', { name: 'Commerce overview' }).click();
  await expect(line).toBeVisible();
  // A load cell then opens the team's week for everyone: the person is no longer chosen.
  await page
    .locator(
      '[data-area-overview] [data-load] tr[data-team="team-gamma"] button[data-week="2027-01-04"]',
    )
    .click();
  await expect(page.locator('[data-week-focus="2027-01-04"]')).toBeVisible();
  await expect(page.getByLabel('Person', { exact: true })).toHaveValue('');
});

test('Meeting load lists one overlap line per person', async ({ page }) => {
  await showView(page, 'Meeting load');
  const panel = page.getByRole('tabpanel', { name: 'Meeting load' });
  const warnings = panel.getByRole('region', { name: 'Warnings', exact: true });
  const clashes = warnings.locator('li[data-clash]');
  // Team Alpha: Alex and Sam, both also in Team Beta.
  await expect(clashes).toHaveText([
    `Alex: ${ALEX_CLASHES} overlaps between Team Alpha and Team Beta, e.g. Sprint Planning and Replenishment on Thu 01/07/2027, 11:00–12:00`,
    /^Sam: \d+ overlaps between Team Alpha and Team Beta, e\.g\. /,
  ]);
  // The example's date opens its week for that person; back returns to Meeting load (#375).
  await clashes
    .first()
    .getByRole('button', { name: 'Show W1, 01/07/2027 for Alex in the Calendar' })
    .click();
  const calendar = page.getByRole('tabpanel', { name: 'Calendar' });
  await expect(calendar.locator('[aria-live="polite"]')).toContainText('Week 1');
  await expect(page.getByLabel('Person', { exact: true })).toHaveValue('person-alex');
  await page.goBack();
  await expect(panel).toBeVisible();
  await expect(clashes).toHaveCount(1);
  await setLanguage(page, 'de');
  await expect(page.locator('li[data-clash]')).toHaveText(
    `Alex: ${ALEX_CLASHES} Überschneidungen zwischen Team Alpha und Team Beta, z. B. Sprint Planning und Replenishment am Do 07.01.2027, 11:00–12:00`,
  );
});
