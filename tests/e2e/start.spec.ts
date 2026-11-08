import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const TODAY = '2027-03-17';
const calendar = (page: Page) => page.getByRole('tabpanel', { name: 'Calendar' });

async function start(page: Page) {
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  await page.goto('/');
}

test('a fresh start shows the welcome heading and the actions in order', async ({ page }) => {
  await start(page);
  const panel = calendar(page);
  await expect(panel.getByRole('heading', { level: 3, name: 'Welcome to Caldence' })).toBeVisible();
  for (const name of ['Scrum', 'Kanban', 'SAFe', 'Open a file…', 'Open the example'])
    await expect(panel.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Start with an empty workspace' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Read the manual' })).toBeVisible();
});

for (const template of ['Scrum', 'Kanban', 'SAFe']) {
  test(`${template} opens the dialog and the new team replaces the start screen`, async ({
    page,
  }) => {
    await start(page);
    await calendar(page).getByRole('button', { name: template, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: new RegExp(template) });
    await expect(dialog.getByLabel('Team name')).toHaveValue(template);
    await dialog.getByRole('button', { name: 'Create team' }).click();
    await expect(dialog).toBeHidden();
    await expect(calendar(page).getByRole('grid')).toBeVisible();
    await expect(calendar(page).getByRole('heading', { name: 'Welcome to Caldence' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('tab', { name: 'Calendar', exact: true })).toBeFocused();
    await expect(page.locator('.switcher select option:checked')).toHaveText(template);
  });
}

test('Open the example shows the example teams', async ({ page }) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Open the example' }).click();
  await expect(calendar(page).getByRole('grid')).toBeVisible();
  await expect(page.locator('.switcher select option')).not.toHaveCount(0);
});

test('Open a file reads a workspace file', async ({ page }) => {
  await start(page);
  const chooser = page.waitForEvent('filechooser');
  await calendar(page).getByRole('button', { name: 'Open a file…' }).click();
  await (await chooser).setFiles('tests/fixtures/valid-workspace.json');
  await expect(page.getByText('valid-workspace.json')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Welcome to|Willkommen bei/ })).toHaveCount(0);
  // The start screen is gone: the focus moves to the Calendar tab, not to the page.
  // (The fixture is a German workspace.)
  await expect(page.getByRole('tab', { name: 'Kalender', exact: true })).toBeFocused();
});

test('the two links switch to Team and Help', async ({ page }) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Start with an empty workspace' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Team' })).toBeVisible();
  await page.getByRole('tab', { name: 'Calendar', exact: true }).click();
  await calendar(page).getByRole('button', { name: 'Read the manual' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Help' })).toBeVisible();
});

test('New after a change, then Discard, shows the start screen again', async ({ page }) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Open the example' }).click();
  await expect(calendar(page).getByRole('grid')).toBeVisible();
  await page.getByLabel(/Language|Sprache/).selectOption('de');
  await page.getByLabel(/Language|Sprache/).selectOption('en');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard' }).click();
  await expect(calendar(page).getByRole('heading', { name: 'Welcome to Caldence' })).toBeVisible();
});

test('other views keep their own empty states', async ({ page }) => {
  await start(page);
  await page.getByRole('tab', { name: 'Weeks', exact: true }).click();
  const weeks = page.getByRole('tabpanel', { name: 'Weeks' });
  await expect(weeks.getByRole('heading', { name: 'No teams yet' })).toBeVisible();
  await expect(weeks.getByRole('heading', { name: 'Welcome to Caldence' })).toHaveCount(0);
});

for (const locale of ['de', 'en'] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations on the start screen (${locale}, ${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await start(page);
      await page.getByLabel(/Language|Sprache/).selectOption(locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const axe = () =>
        new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
      expect((await axe()).violations).toEqual([]);
      await page.getByRole('tabpanel').getByRole('button', { name: 'Scrum', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect((await axe()).violations).toEqual([]);
    });
  }
}

test('the start screen fits 375 px without horizontal scroll and passes axe', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await start(page);
  await expect(calendar(page).getByRole('heading', { name: 'Welcome to Caldence' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
