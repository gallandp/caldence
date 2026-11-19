import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  useFileFallback,
  currentUnit,
  unitNames,
  setLanguage,
  deleteAllUnits,
  changeHours,
} from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const TODAY = '2027-03-17';
/** The templates start their cadence on a Monday: the one after TODAY (a Wednesday). */
const MONDAY = '2027-03-22';
const calendar = (page: Page) => page.getByRole('tabpanel', { name: 'Calendar' });

async function start(page: Page) {
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  await page.goto('/');
}

test('a fresh start shows the welcome heading and the actions in order', async ({ page }) => {
  await start(page);
  const panel = calendar(page);
  await expect(panel.getByRole('heading', { level: 3, name: 'Welcome to Caldence' })).toBeVisible();
  for (const name of [
    'Line management',
    'Leading several teams',
    'Product ownership',
    'Agile coaching',
    'Open a file…',
    'Open the example',
    'Read the manual',
  ])
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
    await calendar(page).getByRole('button', { name: 'Product ownership' }).click();
    const dialog = page.getByRole('dialog', { name: 'Plan new' });
    await expect(dialog.getByText('Step 1 of 4')).toBeVisible();
    await dialog.getByRole('radio', { name: template, exact: true }).check();
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByLabel('Team name')).toHaveValue(template);
    await expect(dialog.getByLabel('Cadence starts on')).toHaveValue(MONDAY);
    await expect(dialog.getByLabel('Cadence starts on')).toHaveAccessibleDescription('');
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
    await expect(currentUnit(page)).toHaveText(template);
    await expect(
      page.getByLabel('Person', { exact: true }).locator('option', { hasText: 'Kim' }),
    ).toHaveCount(1);
  });
}

test('"I take part myself" makes the export start with my own calendar', async ({ page }) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Product ownership' }).click();
  const dialog = page.getByRole('dialog', { name: 'Plan new' });
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByLabel('I take part myself').check();
  await dialog.getByLabel('Your name').fill('Kim');
  await dialog.getByLabel('Your role').selectOption({ label: 'Product Owner' });
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Create team' }).click();
  await calendar(page).getByRole('button', { name: 'Share calendars' }).click();
  const exchange = page.getByRole('tabpanel', { name: 'Import / Export' });
  await expect(exchange.getByRole('radio', { name: 'Person', exact: true })).toBeChecked();
  await expect(exchange.getByLabel('Selected person').locator('option:checked')).toHaveText('Kim');
  // "Add to calendar" too, since Kim attends the team's meetings.
  await page.getByRole('tab', { name: 'Meetings & cadence', exact: true }).click();
  await page.getByRole('button', { name: 'Add to calendar…' }).click();
  await expect(exchange.getByLabel('Selected person').locator('option:checked')).toHaveText('Kim');
});

test('the wizard says when Scrum moves a picked date to the next Monday', async ({ page }) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Product ownership' }).click();
  const dialog = page.getByRole('dialog', { name: 'Plan new' });
  await dialog.getByRole('button', { name: 'Next' }).click();
  const field = dialog.getByLabel('Cadence starts on');
  await field.fill(TODAY);
  await expect(field).toHaveAccessibleDescription(
    'Scrum starts its cadence on a Monday, so yours starts on Monday, March 22, 2027.',
  );
  // A picked date stays when another way of working is chosen.
  await dialog.getByRole('button', { name: 'Back' }).click();
  await dialog.getByRole('radio', { name: 'Kanban', exact: true }).check();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(field).toHaveValue(TODAY);
  await dialog.getByRole('button', { name: 'Back' }).click();
  await dialog.getByRole('radio', { name: 'Scrum', exact: true }).check();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(field).toHaveValue(TODAY);
  for (let i = 0; i < 2; i++) await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Create team' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('tab', { name: 'Meetings & cadence', exact: true }).click();
  await expect(page.getByText(/from 03\/22\/2027/)).toBeVisible();
});

test('the wizard without a template creates an empty team', async ({ page }) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Product ownership' }).click();
  const dialog = page.getByRole('dialog', { name: 'Plan new' });
  await dialog.getByRole('radio', { name: 'No template' }).check();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByLabel('Team name')).toHaveValue('My team');
  // Without a template the picked date stays as it is.
  await expect(dialog.getByLabel('Cadence starts on')).toHaveValue(TODAY);
  await expect(dialog.getByLabel('Cadence starts on')).toHaveAccessibleDescription('');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByText(/no roles here yet/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Back' }).click();
  await dialog.getByLabel('Team name').fill('');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByText('The name must not be empty')).toBeVisible();
  await dialog.getByLabel('Team name').fill('Solo');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Create team' }).click();
  await expect(currentUnit(page)).toHaveText('Solo');
});

test('Open the example shows the example teams', async ({ page }) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Open the example' }).click();
  await expect(calendar(page).getByRole('grid')).toBeVisible();
  await expect(unitNames(page)).not.toHaveCount(0);
});

test('Open a file reads a workspace file', async ({ page }) => {
  await start(page);
  const chooser = page.waitForEvent('filechooser');
  await calendar(page).getByRole('button', { name: 'Open a file…' }).click();
  await (await chooser).setFiles('tests/fixtures/valid-workspace.json');
  await expect(page.getByText('valid-workspace-v2.json')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Welcome to|Willkommen bei/ })).toHaveCount(0);
  // The start screen is gone: the focus moves to the Calendar tab, not to the page.
  // (The fixture is a German workspace.)
  await expect(page.getByRole('tab', { name: 'Kalender', exact: true })).toBeFocused();
});

test('the frame step sets time zone and horizon for the workspace', async ({ page }) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Product ownership' }).click();
  const dialog = page.getByRole('dialog', { name: 'Plan new' });
  for (let i = 0; i < 3; i++) await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Time zone, holidays and planning horizon' }),
  ).toBeFocused();
  // The region is preset, not chosen: the wizard asks to check it (#341).
  await expect(dialog.getByLabel('Region (holidays)')).toHaveAccessibleDescription(/Please check/);
  await dialog.getByLabel('Time zone').selectOption('Europe/Vienna');
  // The horizon is preset and explained; its dates show on request.
  const horizon = dialog.getByRole('group', { name: 'Planning horizon' });
  await expect(horizon).toContainText('Planning runs from');
  await expect(horizon).toContainText('The calendar, meeting load and costs refer to it');
  await expect(dialog.getByLabel('Planning until')).toHaveCount(0);
  await horizon.getByRole('button', { name: 'Change dates' }).click();
  await expect(dialog.getByLabel('Planning from')).toBeFocused();
  await dialog.getByLabel('Planning until').fill('2027-03-01');
  await dialog.getByRole('button', { name: 'Create team' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByLabel('Planning until').fill('2027-12-31');
  await dialog.getByRole('button', { name: 'Create team' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Time zone')).toHaveValue('Europe/Vienna');
  await expect(page.getByLabel('Planning until')).toHaveValue('2027-12-31');
});

test('after the wizard a card offers the next steps once', async ({ page }) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Product ownership' }).click();
  const dialog = page.getByRole('dialog', { name: 'Plan new' });
  for (let i = 0; i < 3; i++) await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Create team' }).click();
  const card = calendar(page).getByRole('region', { name: 'Your team is ready' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('unsaved changes at the top is about the file only');
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
  await calendar(page).getByRole('button', { name: 'Product ownership' }).click();
  const dialog = page.getByRole('dialog', { name: 'Plan new' });
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByLabel('Team name')).toHaveValue('Scrum');
  await dialog.getByRole('button', { name: 'Back' }).click();
  await dialog.getByRole('radio', { name: 'Kanban', exact: true }).check();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByLabel('Team name')).toHaveValue('Kanban');
});

test('a click anywhere on an option card picks that way of working', async ({ page }) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Product ownership' }).click();
  const dialog = page.getByRole('dialog', { name: 'Plan new' });
  const kanban = dialog.getByRole('radio', { name: 'Kanban', exact: true });
  await expect(kanban).toHaveAccessibleDescription(/^Flow/);
  await dialog.getByText(/^Flow/).click();
  await expect(kanban).toBeChecked();
  const none = dialog.getByRole('radio', { name: 'No template', exact: true });
  const card = dialog.locator('label').filter({ hasText: 'No template' });
  const box = await card.boundingBox();
  if (!box) throw new Error('no card');
  // The empty right edge of the card, away from the radio and the text.
  await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
  await expect(none).toBeChecked();
});

test('the manual link switches to Help, on the guide for getting started', async ({ page }) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Read the manual' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Help' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Get started' })).toBeVisible();
});

test('New after a change, then Discard, shows the start screen again', async ({ page }) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Open the example' }).click();
  await expect(calendar(page).getByRole('grid')).toBeVisible();
  await changeHours(page, '39');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard' }).click();
  await expect(calendar(page).getByRole('heading', { name: 'Welcome to Caldence' })).toBeVisible();
});

test('the views that need a team offer the same way in', async ({ page }) => {
  await start(page);
  for (const name of ['Meeting load', 'Meetings & cadence', 'Team']) {
    await page.getByRole('tab', { name, exact: true }).click();
    const panel = page.getByRole('tabpanel', { name });
    await expect(panel.getByRole('heading', { name: 'No teams yet' })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Welcome to Caldence' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Plan new', exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Open the example' })).toBeVisible();
    // Nothing to edit without a team, not even the categories.
    await expect(panel.getByLabel('New category name')).toHaveCount(0);
  }
  // Plan new opens the wizard here too and ends in the calendar with the new team.
  await page
    .getByRole('tabpanel', { name: 'Team' })
    .getByRole('button', { name: 'Plan new', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Plan new' });
  await expect(dialog.getByText('Step 1 of 4')).toBeVisible();
  for (let step = 0; step < 3; step++) await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Create team' }).click();
  await expect(page.getByRole('tab', { name: 'Calendar', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Your team is ready' })).toBeVisible();
});

for (const locale of ['de', 'en'] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations on the start screen (${locale}, ${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await start(page);
      await setLanguage(page, locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const axe = () =>
        new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
      expect((await axe()).violations).toEqual([]);
      await page
        .getByRole('tabpanel')
        .getByRole('button', { name: /^(Product ownership|Produktverantwortung)$/ })
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

test('the whole tile opens the example, not only its label', async ({ page }) => {
  await start(page);
  // Click where the description is drawn; the button's overlay covers it, as it does for a user.
  const desc = calendar(page).getByText('Explore a ready-made example with several teams');
  await desc.scrollIntoViewIfNeeded();
  const box = await desc.boundingBox();
  if (!box) throw new Error('description not visible');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(calendar(page).getByRole('grid')).toBeVisible();
});

test('deleting the last team in the calendar returns to the start screen with focus kept', async ({
  page,
}) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Open the example' }).click();
  await expect(calendar(page).getByRole('grid')).toBeVisible();
  await deleteAllUnits(page);
  await expect(calendar(page).getByRole('heading', { name: 'Welcome to Caldence' })).toBeVisible();
  await expect(page.locator('#main')).toBeFocused();
});

test('the wizard names the template cadence with a proper plural', async ({ page }) => {
  await start(page);
  await calendar(page).getByRole('button', { name: 'Product ownership' }).click();
  const dialog = page.getByRole('dialog', { name: 'Plan new' });
  await expect(dialog.getByText(/week\(s\)/)).toHaveCount(0);
  await expect(dialog.getByText(/\b2 weeks\b/).first()).toBeVisible();
});
