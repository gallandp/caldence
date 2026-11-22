import { expect, test } from '@playwright/test';
import { openExample, showView, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
  await page.clock.setFixedTime(new Date('2027-03-10T12:00:00'));
});

test('load figures name their basis and recurring peaks (#510)', async ({ page }) => {
  await openExample(page);
  await showView(page, 'Meeting load');
  const panel = page.getByRole('tabpanel', { name: 'Meeting load' });
  await expect(
    panel.getByRole('columnheader', { name: 'Ø hours/week in the planning horizon' }),
  ).toBeVisible();
  await expect(panel.getByText(/Tall blue bars are recurring peaks/)).toBeVisible();
  // The example's peak week W25 has no load spike: it comes back with the cadence (#510).
  await expect(panel.locator('[data-peak] .sub')).toHaveText('12.3 h in that week (recurring)');
  await expect(panel.locator('tr[data-person="person-alex"] td.peak')).toHaveText(
    'W25 (7.5 h) (recurring)',
  );
});
