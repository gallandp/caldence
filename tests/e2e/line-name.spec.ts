import { expect, test, type Page } from '@playwright/test';
import { currentUnit } from './helpers';

/** The switcher's actions; the example names its levels Platform / Product. */
async function rename(page: Page) {
  await page.locator('.switcher').getByRole('button', { name: 'Product actions' }).click();
  await page.locator('.switcher').getByRole('button', { name: 'Rename line', exact: true }).click();
}

/**
 * The line's root has a name of its own (#417): sister companies of one group staff a product
 * organisation that is called differently.
 */
test('the line root is named apart from the product organisation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open the large line example' }).click();
  await expect(currentUnit(page)).toHaveText('Velmora Platforms');
  const worlds = page.getByRole('radiogroup', { name: 'World' });
  await worlds.getByRole('radio', { name: 'Line' }).click();
  await expect(currentUnit(page)).toHaveText('Velmora Group');

  await rename(page);
  const dialog = page.getByRole('dialog', { name: 'Rename line' });
  await expect(dialog.getByLabel('Line name')).toHaveValue('Velmora Group');
  await dialog.getByLabel('Line name').fill('Velmora Holding');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(currentUnit(page)).toHaveText('Velmora Holding');

  // The product organisation keeps its own name.
  await worlds.getByRole('radio', { name: 'Products' }).click();
  await expect(currentUnit(page)).toHaveText('Velmora Platforms');

  // Without its own name the line shows the organisation's again.
  await worlds.getByRole('radio', { name: 'Line' }).click();
  await rename(page);
  await dialog.getByLabel('Line name').fill('');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(currentUnit(page)).toHaveText('Velmora Platforms');
});
