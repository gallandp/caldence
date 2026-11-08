import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openWorkspaceFile } from './helpers';

test.use({ locale: 'en-US' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-expect-error removing optional browser APIs
    delete window.showOpenFilePicker;
    // @ts-expect-error removing optional browser APIs
    delete window.showSaveFilePicker;
  });
});

async function openSettings(page: Page) {
  await page.getByRole('tab', { name: /^(Workspace settings|Einstellungen)$/ }).click();
  await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible();
}

async function openExample(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open example' }).click();
  await expect(page.getByText('Untitled')).toBeVisible();
  await openSettings(page);
}

const roleNames = (page: Page) =>
  page.getByRole('region', { name: 'Roles' }).locator('input[type="text"][data-name]');

/** Members of the first team, as stored by autosave. */
async function storedMembers(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open('caldence', 1);
        req.onerror = () => resolve([]);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('autosave')) return resolve([]);
          const get = db.transaction('autosave').objectStore('autosave').get('current');
          get.onsuccess = () => {
            const v = get.result as
              { ws: { teams: { members: { personId: string; roleId: string }[] }[] } } | undefined;
            resolve(v ? v.ws.teams[0]!.members.map((m) => `${m.personId}:${m.roleId}`) : []);
          };
          get.onerror = () => resolve([]);
        };
      }),
  );
}

test('roles are added and reordered by keyboard in a new workspace', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  const add = page.getByLabel('New role name');
  await add.focus();
  await page.keyboard.type('Product Owner');
  await page.keyboard.press('Enter');
  await expect(add).toHaveValue('');
  await page.keyboard.type('Scrum Master');
  await page.keyboard.press('Enter');
  await expect(roleNames(page)).toHaveCount(2);
  await expect(roleNames(page).nth(1)).toHaveValue('Scrum Master');

  const up = page.getByRole('button', { name: 'Move Scrum Master up' });
  await up.focus();
  await page.keyboard.press('Enter');
  await expect(roleNames(page).nth(0)).toHaveValue('Scrum Master');
  // The button became disabled at the top, so focus moves to its sibling instead of getting lost.
  await expect(page.getByRole('button', { name: 'Move Scrum Master down' })).toBeFocused();

  await page.getByRole('button', { name: 'Delete Product Owner' }).focus();
  await page.keyboard.press('Enter');
  await expect(roleNames(page)).toHaveCount(1);
  await expect(page.getByLabel('Name of Scrum Master')).toBeFocused();
});

test('deleting a role in use asks for a replacement', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'Delete Scrum Master' }).click();
  const dialog = page.getByRole('dialog', { name: 'Replace Scrum Master' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Replace with').selectOption({ label: 'Developer' });
  await dialog.getByRole('button', { name: 'Replace' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Name of Scrum Master')).toHaveCount(0);
  await expect
    .poll(() => storedMembers(page))
    .toEqual(['person-alex:role-po', 'person-sam:role-dev']);
});

test('cancelling the replace dialog keeps the role', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'Delete Product Owner' }).click();
  const dialog = page.getByRole('dialog', { name: 'Replace Product Owner' });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Delete Product Owner' })).toBeFocused();
  await expect(page.getByLabel('Name of Product Owner')).toHaveCount(1);
});

test('deleting a person in a team asks for confirmation', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'Delete Alex' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete Alex?' });
  await expect(dialog).toContainText('member of 2 team(s)');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Name of Alex')).toHaveCount(1);
  await page.getByRole('button', { name: 'Delete Alex' }).click();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByLabel('Name of Alex')).toHaveCount(0);
});

test('a horizon that ends before it starts shows an error and is not committed', async ({
  page,
}) => {
  await openExample(page);
  const to = page.getByLabel('Horizon to');
  await to.fill('2026-01-01');
  await expect(to).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText(/before its start/)).toBeVisible();
  await expect(to).toHaveAttribute('aria-describedby', /.+/);
  await expect(to).toHaveValue('2026-01-01');
  // Leaving and returning shows what is really stored.
  await page.getByRole('tab', { name: 'Team', exact: true }).click();
  await openSettings(page);
  await expect(page.getByLabel('Horizon to')).toHaveValue('2027-12-31');
  await expect(page.getByText(/before its start/)).toHaveCount(0);
});

test('a colour with too little contrast shows a warning', async ({ page }) => {
  await openExample(page);
  const group = page.getByRole('group', { name: 'Colour of Product Owner' });
  await expect(group.getByRole('radio', { name: 'Blue' })).toBeChecked();
  await expect(group.getByText(/too little contrast/)).toHaveCount(0);
  await group.getByLabel('Custom colour').fill('#ffff00');
  await expect(group.getByText(/too little contrast/)).toBeVisible();
  await expect(group).toHaveAccessibleDescription(/too little contrast/);
  await group.getByRole('radio', { name: 'Green' }).check();
  await expect(group.getByText(/too little contrast/)).toHaveCount(0);
});

test('the language field switches the whole UI', async ({ page }) => {
  await openExample(page);
  await page.getByRole('tabpanel').getByLabel('Language').selectOption('de');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByRole('tab', { name: 'Einstellungen' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Rollen' })).toBeVisible();
  await expect(page.getByLabel('Zeitzone')).toBeVisible();
  await expect(page.getByText(/Team-spezifische Werte/)).toBeVisible();
});

/** Imports a region file through the file input (fallback path). */
async function importRegion(page: Page, name: string, text: string) {
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('button', { name: /^(Import region file…|Regionsdatei importieren…)$/ })
    .click();
  await (await chooser).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
}

const sampleRegion = () => readFileSync('tests/fixtures/regions/de-by-sample.json', 'utf8');
const regionSelect = (page: Page) => page.getByLabel('Region (holidays)');

test('an imported region file is added to the select and selected', async ({ page }) => {
  await openExample(page);
  await importRegion(page, 'de-by-sample.json', sampleRegion());
  await expect(regionSelect(page)).toHaveValue('de-by-sample');
  await expect(regionSelect(page).locator('option:checked')).toHaveText(
    'Bavaria (sample) (imported)',
  );
  await expect(regionSelect(page)).not.toHaveAttribute('aria-invalid', 'true');

  // Switching away offers to remove the imported region.
  await regionSelect(page).selectOption('de-sn');
  const remove = page.getByRole('button', { name: 'Remove imported region Bavaria (sample)' });
  await remove.click();
  await expect(regionSelect(page).locator('option')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Import region file…' })).toBeFocused();
});

test('one undo removes the imported region and restores the previous one', async ({ page }) => {
  await openExample(page);
  await importRegion(page, 'de-by-sample.json', sampleRegion());
  await expect(regionSelect(page)).toHaveValue('de-by-sample');
  await page.getByRole('button', { name: 'Import region file…' }).focus();
  await page.keyboard.press('Control+z');
  await expect(regionSelect(page)).toHaveValue('de-sn');
  await expect(regionSelect(page).locator('option')).toHaveCount(1);
});

test('a region file with a built-in id shows an inline error', async ({ page }) => {
  await openExample(page);
  await importRegion(page, 'de-sn.json', readFileSync('src/data/regions/de-sn.json', 'utf8'));
  await expect(page.getByText(/A built-in region already uses the id/)).toBeVisible();
  await expect(regionSelect(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(regionSelect(page)).toHaveAccessibleDescription(/built-in region/);
  await expect(regionSelect(page).locator('option')).toHaveCount(1);
});

test('a file that is not JSON shows an error and changes nothing', async ({ page }) => {
  await openExample(page);
  await importRegion(page, 'broken.json', 'not json');
  await expect(page.getByText('The file does not contain valid JSON')).toBeVisible();
  await expect(regionSelect(page)).toHaveValue('de-sn');
  await expect(regionSelect(page).locator('option')).toHaveCount(1);
  // Nothing was applied, so there is nothing to undo: the example stays unmodified.
  await page.getByRole('button', { name: 'Import region file…' }).focus();
  await page.keyboard.press('Control+z');
  await expect(regionSelect(page)).toHaveValue('de-sn');
  await expect(page.getByLabel('Horizon to')).toHaveValue('2027-12-31');
});

test('a horizon beyond the known school holidays shows a warning in Settings and Weeks', async ({
  page,
}) => {
  await openExample(page);
  const warning =
    /School holidays for Saxony are known only until 09\/01\/2028\. Later school holidays are missing\./;
  await expect(page.getByText(warning)).toHaveCount(0);
  await page.getByLabel('Horizon to').fill('2028-12-31');
  await page.getByLabel('Horizon to').blur();
  await expect(page.getByText(warning)).toBeVisible();
  await page.getByRole('tab', { name: 'Weeks', exact: true }).click();
  await expect(page.getByRole('tabpanel').getByText(warning)).toBeVisible();
});

for (const locale of ['de', 'en'] as const) {
  test(`axe finds no violations with an imported region and the coverage warning (${locale})`, async ({
    page,
  }) => {
    await openExample(page);
    await page
      .getByRole('tabpanel')
      .getByLabel(/Language|Sprache/)
      .selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await importRegion(page, 'de-by-sample.json', sampleRegion());
    await importRegion(page, 'broken.json', 'not json');
    await expect(page.locator('#err-region')).toBeVisible();
    await page.locator('#set-region').selectOption('de-sn');
    await importRegion(page, 'broken.json', 'not json');
    await page.locator('#set-to').fill('2028-12-31');
    await page.locator('#set-to').blur();
    await expect(page.locator('.settings p.help', { hasText: '2028' })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

async function openUnknownRegion(page: Page) {
  const ws = JSON.parse(readFileSync('tests/fixtures/valid-workspace.json', 'utf8'));
  ws.settings.locale = 'en';
  ws.settings.region = 'xx-gone';
  await page.goto('/');
  await openWorkspaceFile(page, ws, 'unknown-region.caldence.json');
  await openSettings(page);
}

test('a workspace with an unknown region opens and Settings says so', async ({ page }) => {
  await openUnknownRegion(page);
  await expect(regionSelect(page)).toHaveValue('xx-gone');
  const note = /The region xx-gone is unknown, so no holidays are used\./;
  await expect(page.getByText(note)).toBeVisible();
  await expect(regionSelect(page)).toHaveAccessibleDescription(note);
  await expect(regionSelect(page)).not.toHaveAttribute('aria-invalid', 'true');
  await regionSelect(page).selectOption('de-sn');
  await expect(page.getByText(note)).toHaveCount(0);
  await expect(regionSelect(page).locator('option')).toHaveCount(1);
});

for (const locale of ['de', 'en'] as const) {
  test(`axe finds no violations with an unknown region (${locale})`, async ({ page }) => {
    await openUnknownRegion(page);
    await page
      .getByRole('tabpanel')
      .getByLabel(/Language|Sprache/)
      .selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('#note-region')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

for (const locale of ['de', 'en'] as const) {
  test(`axe finds no violations in the settings (${locale})`, async ({ page }) => {
    await openExample(page);
    await page
      .getByRole('tabpanel')
      .getByLabel(/Language|Sprache/)
      .selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await page
      .getByLabel(/Custom colour|Eigene Farbe/)
      .first()
      .fill('#ffff00');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test('the last workday cannot be unchecked and the box stays checked', async ({ page }) => {
  await openExample(page);
  const days = page.getByRole('group', { name: 'Workdays' });
  for (const d of ['Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    await days.getByLabel(d).uncheck();
  const monday = days.getByLabel('Monday');
  await expect(monday).toBeChecked();
  await monday.click();
  await expect(page.getByText('At least one workday is required.')).toBeVisible();
  await expect(monday).toBeChecked();
});

test('invalid person hours show an inline error', async ({ page }) => {
  await openExample(page);
  const hours = page.getByLabel('Hours per week of Alex');
  await hours.fill('-3');
  await hours.blur();
  await expect(hours).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText(/Invalid number/).first()).toBeVisible();
  await hours.fill('20');
  await hours.blur();
  await expect(hours).not.toHaveAttribute('aria-invalid', 'true');
  await hours.fill('');
  await hours.blur();
  await expect(hours).toHaveAttribute('aria-invalid', 'true');
  await expect(hours).toHaveAttribute('aria-describedby', /.+/);
});

test('rows have visible labels', async ({ page }) => {
  await openExample(page);
  const roles = page.getByRole('region', { name: 'Roles' });
  await expect(roles.getByText('Name', { exact: true }).first()).toBeVisible();
  const people = page.getByRole('region', { name: 'People' });
  await expect(people.getByText('Hours per week', { exact: true }).first()).toBeVisible();
});

test('a stale error and draft disappear when the workspace changes elsewhere', async ({ page }) => {
  await openExample(page);
  const to = page.getByLabel('Horizon to');
  await to.fill('2026-01-01');
  await expect(page.getByText(/before its start/)).toBeVisible();
  await page.getByRole('complementary').getByLabel('Language').selectOption('de');
  await expect(page.getByText(/liegt vor dem Beginn|before its start/)).toHaveCount(0);
  await expect(page.getByLabel('Zeitraum bis')).toHaveValue('2027-12-31');
});

test('colour radios can be chosen with the arrow keys', async ({ page }) => {
  await openExample(page);
  const group = page.getByRole('group', { name: 'Colour of Product Owner' });
  await group.getByRole('radio', { name: 'Blue' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: 'Green' })).toBeChecked();
  await expect(group.getByRole('radio', { name: 'Green' })).toBeFocused();
});
