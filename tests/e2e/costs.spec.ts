import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openExample, pickUnit } from './helpers';

test.use({ locale: 'en-US' });

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click();

async function setRate(page: Page, value: string) {
  await tab(page, 'Settings');
  const field = page.getByLabel('Hourly rate (optional)');
  await field.fill(value);
  await field.press('Enter');
}

test('costs appear only while an hourly rate is set', async ({ page }) => {
  await openExample(page);

  await tab(page, 'Meetings & cadence');
  await expect(page.getByRole('columnheader', { name: 'Cost' })).toHaveCount(0);
  await expect(page.locator('[data-costs]')).toHaveCount(0);
  await tab(page, 'Meeting load');
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
  await tab(page, 'Meeting load');
  await expect(page.locator('[data-costs] [data-cost-week]')).toContainText('/ week');
  await expect(page.locator('[data-costs] [data-cost-horizon]')).toContainText(
    'in the planning horizon (2027, 52\u00a0wks)',
  );

  await setRate(page, '');
  await tab(page, 'Meetings & cadence');
  await expect(page.getByRole('columnheader', { name: 'Cost' })).toHaveCount(0);
  await expect(page.locator('[data-costs]')).toHaveCount(0);
});

test('costs show per sprint and the preparation share; flow teams per week only', async ({
  page,
}) => {
  await openExample(page);
  await setRate(page, '100');
  await tab(page, 'Meetings & cadence');
  // Team Alpha: two-week sprints. Weekly Sync: €50 a week, no preparation.
  const sync = page.getByRole('row', { name: /Weekly Sync/ });
  await expect(sync.locator('[data-cost-cadence]')).toHaveText('Ø €100 / sprint');
  await expect(sync.locator('[data-cost-prep]')).toHaveCount(0);
  const planning = page.getByRole('row', { name: /Sprint Planning/ });
  await expect(planning.locator('[data-cost-prep]')).toHaveText('incl. 25% preparation');
  const card = page.locator('[data-costs]');
  // Twice the unrounded weekly cost, rounded once at the end.
  await expect(card.locator('[data-cost-week]')).toContainText('€561');
  await expect(card.locator('[data-cost-cadence]')).toHaveText('€1,123 / sprint');

  await pickUnit(page, 'Team Beta');
  await expect(page.locator('[data-cost-cadence]')).toHaveCount(0);
  await expect(page.locator('[data-costs] [data-cost-week]')).toBeVisible();
});

test('an hourly rate of 0 shows an error and is not committed', async ({ page }) => {
  await openExample(page);
  await setRate(page, '0');
  await expect(page.getByLabel('Hourly rate (optional)')).toHaveAttribute('aria-invalid', 'true');
  await tab(page, 'Meetings & cadence');
  await expect(page.locator('[data-costs]')).toHaveCount(0);
});

for (const view of ['Meetings & cadence', 'Meeting load', 'Settings']) {
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

test('without a rate the cost card invites one and applies it to the file', async ({ page }) => {
  await openExample(page);
  await tab(page, 'Meetings & cadence');
  const invite = page.locator('[data-rate-invite]');
  await expect(invite).toContainText('Applies to the whole file');
  const field = invite.getByLabel('€ per hour and person');
  await field.fill('0');
  await invite.getByRole('button', { name: 'Apply' }).click();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(invite.getByRole('alert')).toContainText('Enter an amount above 0');
  await field.fill('1.000');
  await invite.getByRole('button', { name: 'Apply' }).click();
  await expect(invite.getByRole('alert')).toBeVisible();
  await field.fill('85,5');
  await invite.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('[data-rate-invite]')).toHaveCount(0);
  await expect(page.locator('[data-costs] h3')).toBeFocused();
  await expect(page.locator('[data-costs]')).toContainText('At €86 per hour and person');
  await tab(page, 'Settings');
  await expect(page.getByLabel('Hourly rate (optional)')).toHaveValue('85.5');
});
