import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// These tests change the built sw.js, which the preview server reads on each request.
// They run in their own project after all other tests (playwright.config.ts), so no other
// test sees a new version.
const swFile = fileURLToPath(new URL('../../dist/sw.js', import.meta.url));

/** Replaces sw.js in one step, so a request never gets a half-written file. */
function writeSw(text: string) {
  writeFileSync(`${swFile}.tmp`, text);
  renameSync(`${swFile}.tmp`, swFile);
}

let original = '';
test.beforeEach(() => {
  original = readFileSync(swFile, 'utf8');
});
test.afterEach(() => writeSw(original));

/** Loads the app and waits until the service worker controls the page. */
async function controlled(page: Page) {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
}

/** Publishes a changed sw.js and lets the open page look for it. */
async function deployNewVersion(page: Page) {
  writeSw(`${original}\n// next version\n`);
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
}

for (const hardReload of [false, true]) {
  test(`Reload in the update notice loads the new version${hardReload ? ' after a hard reload' : ''}`, async ({
    page,
    context,
  }) => {
    if (hardReload) {
      // A second, controlled tab keeps the old worker; this tab bypasses it like Cmd+Shift+R (#181).
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
