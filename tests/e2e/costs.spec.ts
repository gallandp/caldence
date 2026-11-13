import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openExample } from './helpers';

test.use({ locale: 'en-US' });

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click();

async function setRate(page: Page, value: string) {
  await tab(page, 'Workspace settings');
  const field = page.getByLabel('Hourly rate (optional)');
  await field.fill(value);
  await field.press('Enter');
}

test('costs appear only while an hourly rate is set', async ({ page }) => {
  await openExample(page);

  await tab(page, 'Meetings & cadence');
  await expect(page.getByRole('columnheader', { name: 'Cost' })).toHaveCount(0);
  await expect(page.locator('[data-costs]')).toHaveCount(0);
  await tab(page, 'Load');
  await expect(page.locator('[data-costs]')).toHaveCount(0);

  await setRate(page, '100');
  await tab(page, 'Meetings & cadence');
  await expect(page.getByRole('columnheader', { name: 'Cost' })).toBeVisible();
  // Weekly Sync: 15 minutes, Product Owner and Scrum Master, one person each.
  const sync = page.getByRole('row', { name: /Weekly Sync/ });
  await expect(sync.locator('[data-cost]')).toContainText('€50');
  await expect(sync.locator('[data-cost]')).toContainText('Ø €50 / week');
  const card = page.locator('[data-costs]');
  await expect(card.getByRole('heading', { name: 'Costs' })).toBeVisible();
  await expect(card).toContainText('At €100 per hour and person');
  await tab(page, 'Load');
  await expect(page.locator('[data-costs] [data-cost-week]')).toContainText('/ week');

  await setRate(page, '');
  await tab(page, 'Meetings & cadence');
  await expect(page.getByRole('columnheader', { name: 'Cost' })).toHaveCount(0);
  await expect(page.locator('[data-costs]')).toHaveCount(0);
});

test('an hourly rate of 0 shows an error and is not committed', async ({ page }) => {
  await openExample(page);
  await setRate(page, '0');
  await expect(page.getByLabel('Hourly rate (optional)')).toHaveAttribute('aria-invalid', 'true');
  await tab(page, 'Meetings & cadence');
  await expect(page.locator('[data-costs]')).toHaveCount(0);
});

for (const view of ['Meetings & cadence', 'Load', 'Workspace settings']) {
  test(`axe finds no violations with costs in ${view}`, async ({ page }) => {
    await openExample(page);
    await setRate(page, '85');
    await tab(page, view);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
