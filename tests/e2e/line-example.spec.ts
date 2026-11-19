import { expect, test } from '@playwright/test';

test('the start screen opens the line example on the organisation (#323)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open the large line example' }).click();
  await expect(page.getByText('Untitled')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Velmora Group' })).toBeVisible();
  await expect(page.getByRole('tab', { selected: true })).toHaveAttribute('id', 'tab-team');
  // The organisation opens on its overview (#337); the structure lists the platforms.
  await page
    .getByRole('group', { name: 'Page' })
    .getByRole('button', { name: 'Structure' })
    .click();
  await expect(page.getByRole('main').getByText('Ordermatik', { exact: true })).toBeVisible();
});
