import { expect, test } from '@playwright/test';

test('links a manifest with name, start_url, display and a maskable icon', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const res = await request.get(new URL(href!, page.url()).toString());
  const manifest = await res.json();
  expect(manifest.name).toBe('Caldence');
  expect(manifest.start_url).toBe('./');
  expect(manifest.display).toBe('standalone');
  expect(
    manifest.icons.some(
      (i: { sizes: string; purpose?: string }) =>
        i.sizes === '512x512' && (i.purpose ?? '').includes('maskable'),
    ),
  ).toBe(true);
});

test('the service worker controls the page after one reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
});

test('works offline once the service worker is installed', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Calendar' })).toBeVisible();
  await page.getByRole('button', { name: 'Open example' }).click();
  await expect(page.getByText('Untitled')).toBeVisible();
});

test('the update notice is hidden on a normal start', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Calendar' })).toBeVisible();
  await expect(page.getByText('A new version of Caldence is available.')).toHaveCount(0);
});
