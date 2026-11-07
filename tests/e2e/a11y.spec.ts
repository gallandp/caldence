import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const locales = ['de', 'en'] as const;
const schemes = ['light', 'dark'] as const;
const tabNames = {
  de: [
    'Kalender',
    'Wochen',
    'Auslastung',
    'Termine',
    'Team',
    'Einstellungen',
    'Vorlagen',
    'Import / Export',
    'Hilfe',
  ],
  en: [
    'Calendar',
    'Weeks',
    'Load',
    'Meetings',
    'Team',
    'Workspace settings',
    'Templates',
    'Import / Export',
    'Help',
  ],
};

test.use({ locale: 'en-US' });

for (const locale of locales) {
  for (const scheme of schemes) {
    test(`axe finds no violations (${locale}, ${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      await page.getByLabel(/Language|Sprache/).selectOption(locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      for (const name of tabNames[locale]) {
        await page.getByRole('tab', { name, exact: true }).click();
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations, `${locale} ${scheme} ${name}`).toEqual([]);
      }
    });
  }
}

test('focus ring of a tab is not clipped by the tablist', async ({ page }) => {
  await page.goto('/');
  const tab = page.getByRole('tab').nth(1);
  await tab.focus();
  const [t, list, outline] = await Promise.all([
    tab.boundingBox(),
    page.getByRole('tablist').boundingBox(),
    tab.evaluate((el) => {
      const cs = getComputedStyle(el);
      return parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset);
    }),
  ]);
  expect(outline).toBeGreaterThanOrEqual(5);
  expect(t!.y - outline).toBeGreaterThanOrEqual(list!.y);
  expect(t!.y + t!.height + outline).toBeLessThanOrEqual(list!.y + list!.height);
});

test('modifier keys do not trigger tab navigation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab').first().focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(page.getByRole('tab').first()).toBeFocused();
});

test('skip link is visible on focus in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  // The app shows a loading state until the autosave is restored.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport({ ratio: 1 });
});

test('skip link is the first Tab stop and moves focus to main', async ({ page }) => {
  await page.goto('/');
  // The app shows a loading state until the autosave is restored.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();
});

test('view tabs follow the ARIA tab pattern', async ({ page }) => {
  await page.goto('/');
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(9);
  await expect(page.getByRole('tablist')).toHaveAccessibleName('Views');
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(1)).toHaveAttribute('tabindex', '-1');

  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveAccessibleName('Weeks');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.last()).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(tabs.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tabs.first()).toBeFocused();
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
});

test('reduced motion disables transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const duration = await page
    .getByRole('tab')
    .first()
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(duration).toBe('0s');
});

test('switching the language updates lang and labels', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Language').selectOption('de');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByRole('tab', { name: 'Kalender' })).toBeVisible();
  await expect(page.getByLabel('Sprache')).toBeVisible();
  await page.getByLabel('Sprache').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('tab', { name: 'Calendar' })).toBeVisible();
});
