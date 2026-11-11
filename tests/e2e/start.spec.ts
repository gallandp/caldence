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
  for (const name of ['Plan new', 'Open a file…', 'Open the example', 'Read the manual'])
    await expect(panel.getByRole('button', { name, exact: true })).toBeVisible();
  // Nothing to filter or save yet, and the start screen is the only way in.
  await expect(page.getByLabel('Role', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add team' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Open a file…' })).toHaveAccessibleDescription(
    'Continue a saved plan',
  );
  // The other views still offer the team bar.
  await page.getByRole('tab', { name: 'Team', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add team' })).toBeVisible();
});

for (const template of ['Scrum', 'Kanban', 'SAFe']) {
  test(`the wizard creates a ${template} team with its people`, async ({ page }) => {
    await start(page);
    await calendar(page).getByRole('button', { name: 'Plan new', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Plan new' });
    await expect(dialog.getByText('Step 1 of 4')).toBeVisible();
    await dialog.getByRole('radio', { name: template, exact: true }).check();
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByLabel('Team name')).toHaveValue(template);
    await expect(dialog.getByLabel('Cadence starts on')).toHaveValue(TODAY);
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByRole('heading', { name: 'Who is in the team?' })).toBeFocused();
    await dialog.getByLabel('I take part myself').check();
    await dialog.getByLabel('Your name').fill('Kim');
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByText('Step 4 of 4')).toBeVisible();
    await dialog.getByRole('button', { name: 'Create team' }).click();
    await expect(dialog).toBeHidden();
    await expect(calendar(page).getByRole('grid')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Calendar', exact: true })).toBeFocused();
    await expect(page.locator('.switcher select option:checked')).toHaveText(template);
    await expect(
      page.getByLabel('Person', { exact: true }).locator('option', { hasText: 'Kim' }),
    ).toHaveCount(1);
  });
}

test('the wizard without a template creates an empty team', async ({ page }) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Plan new', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Plan new' });
  await dialog.getByRole('radio', { name: 'No template' }).check();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByLabel('Team name')).toHaveValue('My team');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByText(/no roles yet/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Back' }).click();
  await dialog.getByLabel('Team name').fill('');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByText('The name must not be empty')).toBeVisible();
  await dialog.getByLabel('Team name').fill('Solo');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Create team' }).click();
  await expect(page.locator('.switcher select option:checked')).toHaveText('Solo');
});

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

test('the frame step sets time zone and horizon for the workspace', async ({ page }) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Plan new', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Plan new' });
  for (let i = 0; i < 3; i++) await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Time zone, holidays and horizon' }),
  ).toBeFocused();
  await dialog.getByLabel('Time zone').selectOption('Europe/Vienna');
  await dialog.getByLabel('Horizon to').fill('2027-03-01');
  await dialog.getByRole('button', { name: 'Create team' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByLabel('Horizon to').fill('2027-12-31');
  await dialog.getByRole('button', { name: 'Create team' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('tab', { name: 'Workspace settings', exact: true }).click();
  await expect(page.getByLabel('Time zone')).toHaveValue('Europe/Vienna');
  await expect(page.getByLabel('Horizon to')).toHaveValue('2027-12-31');
});

test('after the wizard a card offers the next steps once', async ({ page }) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Plan new', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Plan new' });
  for (let i = 0; i < 3; i++) await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Create team' }).click();
  const card = calendar(page).getByRole('region', { name: 'Your team is ready' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('saved automatically');
  await card.getByRole('button', { name: 'Share calendars' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Import / Export' })).toBeVisible();
  await page.getByRole('tab', { name: 'Calendar', exact: true }).click();
  await expect(card).toHaveCount(0);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('choosing another way of working starts the later steps afresh', async ({ page }) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Plan new', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Plan new' });
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByLabel('Team name')).toHaveValue('Scrum');
  await dialog.getByRole('button', { name: 'Back' }).click();
  await dialog.getByRole('radio', { name: 'Kanban', exact: true }).check();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByLabel('Team name')).toHaveValue('Kanban');
});

test('the manual link switches to Help', async ({ page }) => {
  await start(page);
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
      await page
        .getByRole('tabpanel')
        .getByRole('button', { name: /Plan new|Neu planen/ })
        .click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      expect((await axe()).violations).toEqual([]);
      for (let i = 0; i < 3; i++) {
        await dialog.getByRole('button', { name: /Next|Weiter/ }).click();
        await expect(dialog.getByText(new RegExp(`(Step|Schritt) ${i + 2} `))).toBeVisible();
        expect((await axe()).violations).toEqual([]);
      }
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
