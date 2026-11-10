import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Workspace } from '../../src/core/model';
import { openExample, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });

test('page has the app title and a language', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Caldence');
  await expect(page.locator('html')).toHaveAttribute('lang', /^[a-z]{2}/);
  await expect(page.getByRole('heading', { level: 1, name: 'Caldence' })).toBeVisible();
  await expect(page.getByText(/^Version \d+\.\d+\.\d+$/)).toBeVisible();
});

test('Ctrl+S saves a value that is still being edited', async ({ page }) => {
  await useFileFallback(page);
  await openExample(page);
  await page.getByRole('tab', { name: 'Workspace settings' }).click();
  const hours = page.getByLabel('Hours per week of Alex');
  await hours.fill('17');
  const download = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+s');
  const path = await (await download).path();
  const saved = JSON.parse(readFileSync(path, 'utf8')) as Workspace;
  expect(saved.people.find((p) => p.name === 'Alex')?.hoursPerWeek).toBe(17);
});

test('the vertical view list also follows ArrowDown and ArrowUp', async ({ page }) => {
  await page.goto('/');
  const list = page.getByRole('tablist');
  await expect(list).toHaveAttribute('aria-orientation', 'vertical');
  await page.getByRole('tab', { name: 'Calendar' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('tab', { name: 'Weeks' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Weeks' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('tab', { name: 'Calendar' })).toBeFocused();
});

test('every view runs under the Content Security Policy without violations (#42)', async ({
  page,
}) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`Refused to load: ${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await openExample(page);
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  for (const tab of await page.getByRole('tab').all()) {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  expect(violations).toEqual([]);
});
