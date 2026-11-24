import { expect, test, type Page } from '@playwright/test';
import { openExample, showView, useFileFallback } from './helpers';

test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
  await page.clock.setFixedTime(new Date('2027-03-10T12:00:00'));
});

async function openOrgLoad(page: Page, view: string) {
  await openExample(page);
  await showView(page, view);
  await page.locator('.switcher .pick').click();
  await page.locator('.switcher .list button.org').click();
  return page.getByRole('tabpanel', { name: view });
}

test.use({ locale: 'en-US' });
test.describe('Meeting load basis', () => {
  test('load figures name their basis and only recurring peaks are marked (#510)', async ({
    page,
  }) => {
    const panel = await openOrgLoad(page, 'Meeting load');
    await expect(
      panel.getByRole('columnheader', { name: 'Ø hours/week in the planning horizon' }),
    ).toBeVisible();
    await expect(
      panel.getByText(/Tall bars without a warning are either recurring peaks/),
    ).toBeVisible();
    // Jordan's peak comes back every sprint; Alex's W25 is a one-off peak below the spike threshold.
    await expect(panel.locator('tr[data-person="person-jordan"] td.peak')).toHaveText(
      'W1 (1.1 h) (recurring)',
    );
    await expect(panel.locator('tr[data-person="person-alex"] td.peak')).toHaveText(
      'W25 (7.5 h) (below spike threshold)',
    );
    // Robin is over the limit in W25 (#529), so the org peak week has a warning: no mark.
    await expect(panel.locator('[data-peak] .sub')).toHaveText('28.9 h in that week');
  });
});
