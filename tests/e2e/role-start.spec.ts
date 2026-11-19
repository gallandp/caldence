import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { autosaved, setLanguage, showAreaPage, useFileFallback } from './helpers';

/** The start screen asks who you are and sets up your level of the organisation (#387). */
test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
  await page.clock.setFixedTime(new Date('2027-03-17T12:00:00'));
  await page.goto('/');
});

const calendar = (page: Page) => page.getByRole('tabpanel', { name: 'Calendar' });
const axe = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

test('every role card says what it sets up', async ({ page }) => {
  const roles = calendar(page).getByRole('list', { name: 'Your role' });
  await expect(roles.getByRole('listitem')).toHaveCount(4);
  await expect(roles.getByRole('button', { name: 'Line management' })).toHaveAccessibleDescription(
    /^e\.g\. line manager, .* Set up line teams$/,
  );
  await expect(roles.getByRole('button', { name: 'Agile coaching' })).toHaveAccessibleDescription(
    /Scrum Master, .* Set up the product organisation$/,
  );
});

test('a line manager sets up line teams and lands on their page', async ({ page }) => {
  await calendar(page).getByRole('button', { name: 'Line management' }).click();
  const dialog = page.getByRole('dialog', { name: 'Set up line teams' });
  await expect(dialog.getByText('Step 1 of 2')).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Your line teams' })).toBeFocused();
  // Fictional examples guide the first entries (placeholders, not values).
  await expect(dialog.getByLabel('Organisation name')).toHaveAttribute(
    'placeholder',
    'e.g. Velmora Group',
  );
  await expect(dialog.getByLabel('Line teams')).toHaveAttribute('placeholder', /^e\.g\. /);
  await expect(dialog.getByLabel('Line teams')).toHaveValue('');
  // At least one line team.
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByLabel('Line teams')).toBeFocused();
  await expect(dialog.getByText('Please enter at least one name.')).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
  await dialog.getByLabel('Organisation name').fill('Nordlicht');
  await dialog.getByLabel('Specialist group above them').fill('Engineering');
  // Line unit names are unique, the group's too.
  await dialog.getByLabel('Line teams').fill('Backend, engineering');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByLabel('Line teams')).toBeFocused();
  await expect(dialog.getByText('This name is already taken in the line.')).toBeVisible();
  await dialog.getByLabel('Line teams').fill('Backend\nFrontend, Data');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Time zone, holidays and horizon' }),
  ).toBeFocused();
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();
  const team = page.getByRole('tabpanel', { name: 'Overview' });
  await expect(team.getByRole('heading', { level: 2, name: 'Engineering' })).toBeVisible();
  for (const name of ['Backend', 'Frontend', 'Data'])
    await expect(team.getByText(name).first()).toBeVisible();
  // No product yet: the product world's calendar offers the way in instead of the start screen.
  const worlds = page.getByRole('radiogroup', { name: 'World' });
  await worlds.getByRole('radio', { name: 'Products' }).click();
  await page.getByRole('tab', { name: 'Calendar', exact: true }).click();
  await expect(calendar(page).getByRole('heading', { name: 'No teams yet' })).toBeVisible();
  await expect(calendar(page).getByRole('heading', { name: 'Welcome to Caldence' })).toHaveCount(0);
  // The product side can follow at any level, without asking for the frame again.
  await calendar(page).getByRole('button', { name: 'Set up a unit and its teams' }).click();
  const area = page.getByRole('dialog', { name: 'Set up a unit and its teams' });
  await expect(area.getByText('Step 1 of 2')).toBeVisible();
  await area.getByRole('button', { name: 'Cancel' }).click();
  // After a reload the line page is still there.
  await worlds.getByRole('radio', { name: 'Line' }).click();
  await autosaved(page, 'Frontend');
  await page.reload();
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Engineering' })).toBeVisible();
});

test('a platform owner sets up one platform with its products', async ({ page }) => {
  await calendar(page).getByRole('button', { name: 'Leading several teams' }).click();
  const dialog = page.getByRole('dialog', { name: 'Set up a unit and its teams' });
  await expect(dialog.getByText('Step 1 of 3')).toBeVisible();
  await dialog.getByRole('radio', { name: 'Scrum', exact: true }).check();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByRole('heading', { name: 'Structure' })).toBeFocused();
  await dialog.getByLabel('Your level names').selectOption({ label: 'Platform / Product' });
  await expect(dialog.getByLabel('Platform name')).toBeVisible();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByLabel('Platform name')).toBeFocused();
  await expect(dialog.getByText('Please enter a name.')).toBeVisible();
  await dialog.getByLabel('Platform name').fill('Payments');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByLabel('Products')).toBeFocused();
  await dialog.getByLabel('Products').fill('Kestrel, Osprey');
  expect((await axe(page)).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();
  const panel = page.getByRole('tabpanel', { name: 'Platform' });
  await expect(panel.getByRole('heading', { level: 2, name: 'Payments' })).toBeVisible();
  await expect(panel.getByText('Kestrel').first()).toBeVisible();
  await expect(panel.getByText('Osprey').first()).toBeVisible();
});

test('an agile coach sets up the product organisation with several areas', async ({ page }) => {
  await calendar(page).getByRole('button', { name: 'Agile coaching' }).click();
  const dialog = page.getByRole('dialog', { name: 'Set up the product organisation' });
  await dialog.getByRole('radio', { name: 'No template' }).check();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Structure of the organisation' }),
  ).toBeFocused();
  await dialog.getByLabel('Organisation name').fill('Nordlicht');
  const first = dialog.getByRole('group', { name: 'Area 1' });
  await first.getByLabel('Area name').fill('Payments');
  await first.getByLabel('Teams').fill('Kestrel');
  await dialog.getByRole('button', { name: '+ Add another area' }).click();
  const second = dialog.getByRole('group', { name: 'Area 2' });
  await expect(second.getByLabel('Area name')).toBeFocused();
  await second.getByLabel('Area name').fill('Travel');
  await second.getByLabel('Teams').fill('Wren\nHeron');
  // An extra empty area is ignored.
  await dialog.getByRole('button', { name: '+ Add another area' }).click();
  expect((await axe(page)).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();
  const panel = page.getByRole('tabpanel', { name: 'Organisation' });
  await expect(panel.getByRole('heading', { level: 2, name: 'Nordlicht' })).toBeVisible();
  // The organisation opens on its overview (#337); the tree is on Structure.
  await showAreaPage(page, 'Structure');
  for (const name of ['Payments', 'Travel', 'Kestrel', 'Wren', 'Heron'])
    await expect(panel.getByText(name, { exact: true }).first()).toBeVisible();
});

test('a product owner takes part in their own team as Product Owner', async ({ page }) => {
  await calendar(page).getByRole('button', { name: 'Product ownership' }).click();
  const dialog = page.getByRole('dialog', { name: 'Plan new' });
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByLabel('I take part myself').check();
  await expect(dialog.getByLabel('Your role').locator('option:checked')).toHaveText(
    'Product Owner',
  );
});

for (const scheme of ['light', 'dark'] as const)
  test(`the role cards pass axe in German (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await setLanguage(page, 'de');
    await expect(page.getByRole('button', { name: 'Linienverantwortung' })).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
  });
