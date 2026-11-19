import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { currentUnit, openExample, showView, teamAction, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

/** Picks the organisation, the top entry of the switcher's list (#313). */
async function pickOrg(page: import('@playwright/test').Page) {
  await page.locator('.switcher .pick').click();
  await page.locator('.switcher .list button.org').click();
  await expect(page.locator('.switcher .meta')).toHaveText('Organisation · 1 area');
}

test('the organisation sits above the areas and shows the whole tree', async ({ page }) => {
  await openExample(page);
  await pickOrg(page);
  await expect(currentUnit(page)).toHaveText('Organisation');
  // No meetings of its own yet: Meetings & cadence steps aside, the page takes its place.
  await expect(page.getByRole('tab', { name: 'Meetings & cadence' })).toHaveCount(0);
  await showView(page, 'Organisation');
  // The organisation opens on its overview, like an area (#337).
  await page
    .getByRole('group', { name: 'Page' })
    .getByRole('button', { name: 'Structure' })
    .click();
  const tree = page.getByRole('list', { name: 'Structure of Organisation' });
  await expect(tree.locator('.node.root')).toContainText('1 area · 4 teams · 6 people');
  await expect(tree.locator('button.node.area')).toHaveText(/Commerce/);
  await expect(tree.locator('button.node.team .title')).toHaveText([
    'Team Gamma',
    'Team Delta',
    'Team Alpha',
    'Team Beta',
  ]);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  // A card opens its unit.
  await tree.locator('button.node.area').click();
  await expect(currentUnit(page)).toHaveText('Commerce');
  await expect(page.getByRole('heading', { level: 2 })).toContainText('Commerce');
});

test('the organisation is renamed, and an empty name gives the level word back', async ({
  page,
}) => {
  await openExample(page);
  await pickOrg(page);
  await teamAction(page, 'Rename organisation');
  const dialog = page.getByRole('dialog', { name: 'Rename organisation' });
  await dialog.getByLabel('Organisation name').fill('Nordwind GmbH');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(currentUnit(page)).toHaveText('Nordwind GmbH');

  // An empty name gives the level's word back.
  await teamAction(page, 'Rename organisation');
  await dialog.getByLabel('Organisation name').fill('');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(currentUnit(page)).toHaveText('Organisation');
});

test('calendar and load show every team and area for the organisation', async ({ page }) => {
  await openExample(page);
  await pickOrg(page);
  await showView(page, 'Calendar');
  const unit = page.getByLabel('Area or team');
  await expect(unit).toHaveValue('');
  // Meetings of teams outside the area and of the area itself are both in the calendar.
  await expect(page.locator('#panel-calendar').getByText('PO Forum').first()).toBeVisible();
  await expect(page.locator('#panel-calendar').getByText('Weekly Sync').first()).toBeVisible();
  await unit.selectOption({ label: 'Team Alpha' });
  await expect(page.locator('#panel-calendar').getByText('PO Forum')).toHaveCount(0);
  await showView(page, 'Meeting load');
  await expect(page.locator('#panel-load')).toBeVisible();
});
