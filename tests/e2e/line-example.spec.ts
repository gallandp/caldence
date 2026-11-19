import { expect, test } from '@playwright/test';

test('the start screen opens the line example on the organisation (#323)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open the large line example' }).click();
  await expect(page.getByText('Untitled')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Velmora Platforms' })).toBeVisible();
  await expect(page.getByRole('tab', { selected: true })).toHaveAttribute('id', 'tab-team');
  // The organisation opens on its overview (#337); the structure lists the platforms.
  await page
    .getByRole('group', { name: 'Page' })
    .getByRole('button', { name: 'Structure' })
    .click();
  await expect(page.getByRole('main').getByText('Ordermatik', { exact: true })).toBeVisible();
});

test('a whole line names the first 50 people with overlaps and offers the rest (#316 budget)', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open the large line example' }).click();
  await page.getByRole('tab', { name: 'Meeting load', exact: true }).click();
  const clashes = page.locator('li[data-clash]');
  await expect(clashes).toHaveCount(50);
  const all = page.locator('[data-all-clashes]');
  await expect(all).toHaveText(/^Show all [\d,]+ people with overlaps$/);
  const n = Number((await all.textContent())!.replace(/\D/g, ''));
  await all.click();
  await expect(clashes).toHaveCount(n);
});
