import { expect, test } from '@playwright/test';
import { openExample, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`printing shows only the view, on white, without navigation (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1280, height: 900 });
    await openExample(page);
    await page.getByRole('tab', { name: 'Meeting load', exact: true }).click();
    await page.emulateMedia({ media: 'print', colorScheme: scheme });
    // A4 at 96 dpi minus the page margins.
    await page.setViewportSize({ width: 700, height: 1000 });
    await expect(page.locator('.sidebar')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Meeting load', level: 2 })).toBeVisible();
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe('rgb(255, 255, 255)');
    // Nothing is cut off at the right edge of the paper.
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(700);
  });
}

test('the calendar prints without its navigation buttons', async ({ page }) => {
  await openExample(page);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'Today' })).toBeHidden();
  await expect(page.locator('#panel-calendar table').first()).toBeVisible();
});

test('the Print button opens the browser print dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openExample(page);
  await page.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed++;
    };
  });
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
});
