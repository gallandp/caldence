import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { staffingWorkspace } from './line-fixture';
import { currentUnit, openWorkspaceFile, pickUnit, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
  await page.goto('/');
});

async function openMatrix(page: Page) {
  await openWorkspaceFile(page, staffingWorkspace(), 'matrix.caldence.json');
  await pickUnit(page, 'Payments');
  await page.locator('#tab-team').click();
  await page.getByRole('group', { name: 'Page' }).getByRole('button', { name: 'Matrix' }).click();
  return page.getByRole('table', { name: /Matrix of Payments/ });
}

test('line teams × products with FTE, free time and open demand (#396)', async ({ page }) => {
  const table = await openMatrix(page);
  await expect(table.getByRole('columnheader', { name: 'Payments' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Team Gamma' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Free' })).toBeVisible();
  await expect(table.getByRole('rowheader', { name: /Orvalis Ware/ })).toBeVisible();
  await expect(table.getByRole('rowheader', { name: /Orvalis Geld/ })).toBeVisible();
  // People rows are open by default: Sam works 0.2 FTE in Gamma.
  const sam = table.getByRole('row', { name: /^Sam/ });
  await expect(sam.getByRole('button', { name: /0\.2 FTE of Sam in Team Gamma/ })).toBeVisible();
  await expect(table.getByRole('rowheader', { name: 'Open demand' })).toBeVisible();

  // Folding a line team hides its people.
  await table.getByRole('button', { name: 'Hide the people of Orvalis Ware' }).click();
  await expect(sam).toHaveCount(0);
  const all = page.getByRole('checkbox', { name: 'Show people' });
  await all.uncheck();
  await expect(table.getByRole('row', { name: /^Kim/ })).toHaveCount(0);
  await all.check();
  await expect(sam).toBeVisible();

  expect(
    (await new AxeBuilder({ page }).include('.matrix').analyze()).violations.map((v) => v.id),
  ).toEqual([]);
});

test('a cell shows who is behind it and opens the product or the line (#396)', async ({ page }) => {
  const table = await openMatrix(page);
  const cell = table
    .getByRole('row', { name: /^Sam/ })
    .getByRole('button', { name: /in Team Gamma/ });
  await cell.click();
  const pop = page.getByRole('dialog', { name: 'Sam in Team Gamma' });
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('Orvalis Lager');
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
  await expect(cell).toBeFocused();
  // A second click on the open cell closes it.
  await cell.click();
  await expect(pop).toBeVisible();
  await expect(cell).toHaveAttribute('aria-expanded', 'true');
  await cell.click();
  await expect(pop).toBeHidden();

  await cell.click();
  await pop.getByRole('button', { name: 'Sam in the line' }).click();
  await expect(currentUnit(page)).toHaveText('Orvalis Ware');

  await pickUnit(page, 'Payments');
  await page.getByRole('group', { name: 'Page' }).getByRole('button', { name: 'Matrix' }).click();
  await page
    .getByRole('table', { name: /Matrix of Payments/ })
    .getByRole('row', { name: /^Sam/ })
    .getByRole('button', { name: /in Team Gamma/ })
    .click();
  await page
    .getByRole('dialog', { name: 'Sam in Team Gamma' })
    .getByRole('button', { name: 'Open Team Gamma' })
    .click();
  await expect(currentUnit(page)).toHaveText('Team Gamma');
});

test('presenting shows no names and no people (#396)', async ({ page }) => {
  const table = await openMatrix(page);
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(table.getByRole('rowheader', { name: /Orvalis Ware/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /^Sam/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Show people' })).toHaveCount(0);
  await table
    .getByRole('row', { name: /Orvalis Ware/ })
    .getByRole('button', { name: /in Team Gamma/ })
    .click();
  const pop = page.getByRole('dialog', { name: 'Orvalis Ware in Team Gamma' });
  await expect(pop).toContainText('Orvalis Lager');
  await expect(pop).not.toContainText('Sam');
});

test('the matrix scrolls in its own box at 390 px (#396)', async ({ page }) => {
  const table = await openMatrix(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(table).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});
