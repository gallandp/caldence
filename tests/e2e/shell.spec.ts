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

test.describe('imprint and privacy links', () => {
  // page.route does not see requests that a service worker makes.
  test.use({ serviceWorkers: 'block' });

  test('appear only when the operator put the pages there', async ({ page }) => {
    // The preview server answers missing pages with the app itself: no links.
    const checked = page.waitForResponse((r) => r.url().endsWith('/imprint.html'));
    await page.goto('/');
    await checked;
    await expect(page.getByRole('tab', { name: 'Calendar' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Legal' })).toHaveCount(0);

    await page.route('**/imprint.html', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Imprint</h1>' }),
    );
    await page.route('**/privacy.html', (route) => route.fulfill({ status: 404, body: '' }));
    await page.reload();
    const legal = page.getByRole('navigation', { name: 'Legal' });
    await expect(legal.getByRole('link', { name: 'Imprint' })).toHaveAttribute(
      'href',
      './imprint.html',
    );
    await expect(legal.getByRole('link')).toHaveCount(1);
  });
});

test('the sidebar links to the source code in a new tab', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: /^GitHub/ });
  await expect(link).toHaveAttribute('href', 'https://github.com/gallandp/caldence');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(link).toHaveAccessibleName('GitHub (source code, opens in a new tab)');
});

test('Save stands out only while there are unsaved changes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open the example' }).click();
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).not.toHaveClass(/primary/);
  await page.getByRole('tab', { name: 'Members & cadence', exact: true }).click();
  const length = page.getByLabel('Length (weeks)');
  await length.fill('3');
  await length.blur();
  await expect(page.getByText('● Unsaved changes')).toBeVisible();
  await expect(save).toHaveClass(/primary/);
});

test('the views are grouped, with Help last', async ({ page }) => {
  await page.goto('/');
  const list = page.getByRole('tablist');
  await expect(list.locator('.group')).toHaveText(['View', 'Plan', 'Workspace']);
  await expect(list.getByRole('tab').last()).toHaveText('Help');
});

test('on wide screens the view title and the filters share one row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openExample(page);
  const centre = async (selector: string) => {
    const box = (await page.locator(selector).first().boundingBox())!;
    return box.y + box.height / 2;
  };
  const title = '#panel-calendar h2';
  const role = page.getByRole('combobox', { name: 'Role' });
  expect(Math.abs((await centre(title)) - (await centre('.bar.context select')))).toBeLessThan(4);
  // The bar spans the title's row, but the filters still take clicks and keys.
  await role.click();
  await expect(role).toBeFocused();
  await role.selectOption({ label: 'Product Owner' });
  await expect(role).toHaveValue(/.+/);

  // Narrow: the filters sit above the title again.
  await page.setViewportSize({ width: 700, height: 900 });
  const filtersBottom = (await page.locator('.bar.context').boundingBox())!;
  const titleBox = (await page.locator(title).boundingBox())!;
  expect(titleBox.y).toBeGreaterThanOrEqual(filtersBottom.y + filtersBottom.height);
});

test('appearance overrides the system scheme and is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const group = page.getByRole('radiogroup', { name: 'Appearance' });
  await expect(group.getByRole('radio', { name: 'Match system' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const systemDark = await bg();

  await group.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const light = await bg();
  expect(light).not.toBe(systemDark);

  await page.reload();
  await expect(group.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
  expect(await bg()).toBe(light);

  // Arrow keys move through the options; back to the system scheme drops the override.
  await group.getByRole('radio', { name: 'Light' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: 'Match system' })).toBeFocused();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
  expect(await bg()).toBe(systemDark);
});
