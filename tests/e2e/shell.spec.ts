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
