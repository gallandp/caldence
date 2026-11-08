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

/** Loads the app and waits until the service worker controls the page. */
async function controlled(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
}

test('other pages in scope are not answered with the app', async ({ page }) => {
  await controlled(page);
  // README.txt is served by the server but not precached: the worker must let it through.
  const res = await page.goto('/README.txt');
  expect(res?.ok()).toBe(true);
  expect(await res!.text()).toContain('Caldence\n========');
  await expect(page.locator('#app')).toHaveCount(0);
});

test('the app opens offline with a query string', async ({ page, context }) => {
  await controlled(page);
  await context.setOffline(true);
  await page.goto('/?source=pwa');
  await expect(page.getByRole('tab', { name: 'Calendar' })).toBeVisible();
});
