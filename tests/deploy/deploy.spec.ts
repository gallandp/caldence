import { expect, test } from '@playwright/test';

// Base URLs of deployed copies, comma-separated, each ending in "/".
const urls = (process.env.DEPLOY_URLS ?? '')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);
// Plain servers (python http.server) set no headers and no slash redirect: skip those assertions.
const checkHeaders = process.env.DEPLOY_CHECK_HEADERS !== '0';

if (urls.length === 0) {
  test('DEPLOY_URLS is set', () => {
    throw new Error('Set DEPLOY_URLS to a comma-separated list of base URLs ending in "/".');
  });
}

for (const base of urls) {
  test.describe(base, () => {
    if (checkHeaders) {
      test('the URL without trailing slash ends at the app', async ({ page }) => {
        await page.goto(base.replace(/\/$/, ''));
        expect(page.url()).toBe(base);
        await expect(page.getByRole('tablist').first()).toBeVisible();
      });
    }

    test('serves the app at the URL', async ({ page }) => {
      await page.goto(base);
      await expect(page.getByRole('tablist').first()).toBeVisible();
    });

    test('content types and caching', async ({ page, request }) => {
      test.skip(!checkHeaders, 'headers are not checked on this server');
      await page.goto(base);
      const manifest = await request.get(base + 'manifest.webmanifest');
      expect(manifest.headers()['content-type']).toContain('application/manifest+json');
      expect(manifest.headers()['cache-control']).toContain('no-cache');

      const html = await request.get(base + 'index.html');
      expect(html.headers()['cache-control']).toContain('no-cache');
      const sw = await request.get(base + 'sw.js');
      expect(sw.headers()['cache-control']).toContain('no-cache');

      const src = await page.locator('script[src*="assets/"]').first().getAttribute('src');
      expect(src).toBeTruthy();
      const asset = await request.get(new URL(src!, base).toString());
      expect(asset.headers()['content-type']).toContain('javascript');
      expect(asset.headers()['cache-control']).toContain('immutable');
    });

    test('the service worker controls the page and it works offline', async ({ page, context }) => {
      await page.goto(base);
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
      await page.reload();
      await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
        .toBe(true);
      await context.setOffline(true);
      await page.reload();
      await expect(page.getByRole('tablist').first()).toBeVisible();
    });
  });
}
