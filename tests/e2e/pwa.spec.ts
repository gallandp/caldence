import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
  await page.getByRole('button', { name: 'Open the example' }).click();
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

const swFile = fileURLToPath(new URL('../../dist/sw.js', import.meta.url));

/**
 * Changes the built sw.js (the preview server reads files on each request), so the next
 * update check finds a new version. Restored after each test.
 */
async function deployNewVersion(page: import('@playwright/test').Page) {
  appendFileSync(swFile, '\n// next version\n');
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
}

test.describe('update notice', () => {
  let original = '';
  test.beforeEach(() => {
    original = readFileSync(swFile, 'utf8');
  });
  test.afterEach(() => writeFileSync(swFile, original));

  for (const hardReload of [false, true]) {
    test(`Reload in the update notice loads the new version${hardReload ? ' after a hard reload' : ''}`, async ({
      page,
      context,
    }) => {
      if (hardReload) {
        // A second, controlled tab keeps the old worker; this tab bypasses it like Cmd+Shift+R.
        await controlled(await context.newPage());
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.setBypassServiceWorker', { bypass: true });
        await page.goto('/');
      } else {
        await controlled(page);
      }
      await deployNewVersion(page);
      const notice = page.getByText('A new version of Caldence is available.');
      await expect(notice).toBeVisible();
      const reloaded = page.waitForEvent('framenavigated');
      await page.getByRole('button', { name: 'Reload' }).click();
      await reloaded;
      await expect(page.getByRole('tab', { name: 'Calendar' })).toBeVisible();
      await expect(notice).toHaveCount(0);
    });
  }
});
