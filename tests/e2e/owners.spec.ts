import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  openExample,
  openPeoplePool,
  openTeamView,
  pickUnit,
  showView,
  useFileFallback,
} from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

test('owner tandems: mark a role, fill the gap, choose one half (#331)', async ({ page }) => {
  await openExample(page);
  await openTeamView(page);
  const panel = page.getByRole('tabpanel', { name: 'Team' });
  const card = panel.locator('[data-owner-card]');
  // Files without tandem roles look as before.
  await expect(card).toHaveCount(0);

  await openPeoplePool(page);
  await panel.getByLabel('Owner tandem of Product Owner').selectOption('business');
  await expect(card).toContainText('Alex');
  await expect(card).toContainText('not filled');

  // "Assign" creates the technical role and hands over to the members form.
  await card.getByRole('button', { name: 'Assign Technical Product Owner' }).click();
  await expect(panel.locator('[data-member-add]')).toBeFocused();
  await page.keyboard.type('Mira Falk');
  await page.keyboard.press('Enter');
  await expect(card).toContainText('Mira Falk');
  await expect(card).not.toContainText('not filled');

  const results = await new AxeBuilder({ page })
    .include('[data-owner-card]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  // Only the wanted half shows; the other stays a member and comes back with the tandem.
  await card.getByRole('button', { name: 'Technical only' }).click();
  await expect(card).not.toContainText('Alex');
  await expect(panel.getByRole('list', { name: 'Members of Team Alpha' })).toContainText('Alex');
  await card.getByRole('button', { name: 'Tandem' }).click();
  await expect(card).toContainText('Alex');

  // The organisation tree counts the gaps of the area and its teams.
  await page.locator('.switcher .pick').click();
  await page.locator('.switcher .list button.org').click();
  await showView(page, 'Organisation');
  await expect(page.locator('button.node.area')).toContainText('4 owner gaps');

  // The area has its own owner card.
  await pickUnit(page, 'Commerce');
  await showView(page, 'Area');
  await expect(page.locator('[data-owner-card]')).toContainText('Area owner');
});
