import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Workspace } from '../../src/core/model';
import { openExample, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });

test('page has the app title and a language', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/^Caldence – /);
  await expect(page.locator('html')).toHaveAttribute('lang', /^[a-z]{2}/);
  await expect(page.getByRole('heading', { level: 1, name: 'Caldence' })).toBeVisible();
  await expect(page.getByText(/^Version \d+\.\d+\.\d+$/)).toBeVisible();
});

test('Ctrl+S saves a value that is still being edited', async ({ page }) => {
  await useFileFallback(page);
  await openExample(page);
  await page.getByRole('tab', { name: 'Team', exact: true }).click();
  const hours = page.getByLabel('Weekly hours of Alex in Team Alpha');
  await hours.fill('17');
  const download = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+s');
  const path = await (await download).path();
  const saved = JSON.parse(readFileSync(path, 'utf8')) as Workspace;
  const alex = saved.people.find((p) => p.name === 'Alex')!.id;
  expect(saved.teams[0]!.memberHours[alex]).toBe(17);
});

test('the vertical view list also follows ArrowDown and ArrowUp', async ({ page }) => {
  await page.goto('/');
  const list = page.getByRole('tablist');
  await expect(list).toHaveAttribute('aria-orientation', 'vertical');
  await page.getByRole('tab', { name: 'Calendar' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('tab', { name: 'Load' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Load' })).toHaveAttribute('aria-selected', 'true');
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
  await page.getByRole('tab', { name: 'Meetings & cadence', exact: true }).click();
  await page.getByRole('button', { name: 'Change cadence' }).click();
  const length = page.getByLabel('Length (weeks)');
  await length.fill('3');
  await length.blur();
  await expect(page.getByText('● Unsaved changes')).toBeVisible();
  await expect(save).toHaveClass(/primary/);
});

test('the views are grouped, with Help last', async ({ page }) => {
  await page.goto('/');
  const list = page.getByRole('tablist');
  // Dividers (decorative) before Meetings, Workspace settings and Help.
  const before = list.locator('.group + [role="tab"]');
  await expect(before).toHaveText(['Meetings & cadence', 'Workspace settings', 'Help']);
  await expect(list.locator('.group').first()).toHaveAttribute('aria-hidden', 'true');
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

test('the role and person filters show only where they apply', async ({ page }) => {
  await openExample(page);
  const filters = page.locator('.bar.context');
  for (const name of ['Calendar', 'Load']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(filters).toBeVisible();
  }
  await page.getByRole('combobox', { name: 'Role' }).selectOption({ label: 'Product Owner' });
  for (const name of ['Meetings & cadence', 'Team', 'Templates', 'Workspace settings', 'Help']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(filters).toBeHidden();
  }
  // Hidden, not reset: the choice is still there on return.
  await page.getByRole('tab', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Role' })).not.toHaveValue('');
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

test('on narrow screens the views open from a menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openExample(page);
  const toggle = page.getByRole('button', { name: /^Menu:/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('tab', { name: 'Meetings & cadence' })).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('tab', { name: 'Meetings & cadence' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Meetings & cadence' })).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toContainText('Meetings & cadence');
  await expect(page.locator('main')).toBeFocused();

  // Escape closes the menu and returns to its button.
  await toggle.click();
  await page.getByRole('tab', { name: 'Meetings & cadence' }).focus();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});

test('on narrow screens the file bar is one row with Save and a menu for the rest', async ({
  page,
}) => {
  await useFileFallback(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openExample(page);
  const bar = page.locator('.content > .bar:not(.context)');
  const save = bar.getByRole('button', { name: 'Save', exact: true });
  const more = bar.getByRole('button', { name: 'More file actions' });
  await expect(save).toBeVisible();
  await expect(bar.getByRole('button', { name: 'New', exact: true })).toBeHidden();
  const name = (await bar.locator('.name').boundingBox())!;
  const saveBox = (await save.boundingBox())!;
  expect(Math.abs(name.y - saveBox.y)).toBeLessThan(saveBox.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // The menu opens on its first entry and Escape returns to its button.
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(bar.getByRole('button', { name: 'New', exact: true })).toBeFocused();
  await expect(bar.getByRole('button', { name: 'Save as' })).toBeVisible();
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const result = await new AxeBuilder({ page }).include('.content > .bar').analyze();
    expect(result.violations).toEqual([]);
  }
  await page.keyboard.press('Escape');
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(more).toBeFocused();

  // An entry closes the menu and runs its action.
  await more.click();
  await bar.getByRole('button', { name: 'New', exact: true }).click();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('heading', { name: 'Welcome to Caldence' })).toBeVisible();
});

test('on narrow screens the role and person filters share one row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openExample(page);
  const role = (await page.getByLabel('Role', { exact: true }).boundingBox())!;
  const person = (await page.getByLabel('Person', { exact: true }).boundingBox())!;
  expect(Math.abs(role.y - person.y)).toBeLessThan(2);
  await expect(page.getByRole('region', { name: 'Show for' })).toBeVisible();
  // A chosen person adds "All teams" on its own row; the page does not widen.
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Alex' });
  await expect(page.getByText('All teams')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
