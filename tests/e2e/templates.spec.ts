import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openExample, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const TODAY = '2027-03-17'; // a Wednesday
const panel = (page: Page) => page.getByRole('tabpanel', { name: 'Templates' });

async function openTemplates(page: Page) {
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Templates', exact: true }).click();
  await expect(panel(page)).toBeVisible();
}

async function chooseFile(
  page: Page,
  click: () => Promise<void>,
  file: string | object,
  name: string,
) {
  const chooser = page.waitForEvent('filechooser');
  await click();
  const buffer = typeof file === 'string' ? readFileSync(file) : Buffer.from(JSON.stringify(file));
  await (await chooser).setFiles({ name, mimeType: 'application/json', buffer });
}

test('applying Scrum takes two clicks and a confirmed name', async ({ page }) => {
  await openTemplates(page);
  await panel(page)
    .getByRole('article', { name: 'Scrum' })
    .getByRole('button', { name: 'Apply' })
    .click();
  const dialog = page.getByRole('dialog', { name: /Scrum/ });
  await expect(dialog.getByLabel('Team name')).toHaveValue('Scrum');
  await dialog.getByRole('button', { name: 'Create team' }).click();
  await expect(dialog).toBeHidden();
  await expect(panel(page).getByRole('status')).toContainText('Scrum');
  await expect(panel(page).getByRole('button', { name: 'Open team' })).toBeFocused();
  await panel(page).getByRole('button', { name: 'Open team' }).click();

  const team = page.getByRole('tabpanel', { name: 'Members & cadence' });
  await expect(team.getByLabel('Type')).toHaveValue('sprint');
  await expect(team.getByLabel('Length (weeks)')).toHaveValue('2');
  await expect(page.locator('.switcher select option:checked')).toHaveText('Scrum');

  await page.getByRole('tab', { name: 'Calendar', exact: true }).click();
  const cal = page.getByRole('tabpanel', { name: 'Calendar' });
  await cal.locator('td[data-date="2027-03-22"]').click();
  await expect(cal.getByRole('region', { name: /March 22, 2027/ })).toContainText('Daily Scrum');
});

test('undo removes the applied team', async ({ page }) => {
  await openTemplates(page);
  await panel(page)
    .getByRole('article', { name: 'Kanban' })
    .getByRole('button', { name: 'Apply' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create team' }).click();
  await expect(panel(page).getByRole('status')).toContainText('Kanban');
  await page.getByRole('tab', { name: 'Members & cadence', exact: true }).click();
  await expect(page.locator('.switcher select option:checked')).toHaveText('Kanban');
  await page.getByRole('heading', { level: 2, name: 'Members & cadence' }).click();
  await page.keyboard.press('Control+z');
  await expect(page.locator('.switcher select')).toHaveCount(0);
});

test('importing a custom template shows a preview and creates a team', async ({ page }) => {
  await openTemplates(page);
  await chooseFile(
    page,
    () => panel(page).getByRole('button', { name: 'Import template file…' }).click(),
    'tests/fixtures/templates/custom.caldence-template.json',
    'custom.caldence-template.json',
  );
  const preview = panel(page).getByRole('region', { name: 'Preview' });
  await expect(preview).toContainText('Pairing Rhythm');
  await expect(preview).toContainText('A weekly pairing session and a retrospective.');
  await expect(preview).toContainText('Roles: 1');
  await expect(preview).toContainText('Categories: 1');
  await expect(preview).toContainText('Meetings: 2');
  await expect(preview).toContainText('Cadence: Sprint, 1 week(s)');
  await expect(preview.getByLabel('Team name')).toHaveValue('Pairing Rhythm');
  await preview.getByLabel('Team name').fill('Pair Team');
  await preview.getByRole('button', { name: 'Create team' }).click();
  await expect(panel(page).getByRole('status')).toContainText('Pair Team');
  await expect(panel(page).getByRole('button', { name: 'Open team' })).toBeFocused();
  await panel(page).getByRole('button', { name: 'Open team' }).click();
  await expect(page.locator('.switcher select option:checked')).toHaveText('Pair Team');
});

test('a workspace file is refused and nothing changes', async ({ page }) => {
  await openExample(page);
  await page.getByRole('tab', { name: 'Templates', exact: true }).click();
  const before = await page.locator('.switcher select option').allTextContents();
  await chooseFile(
    page,
    () => panel(page).getByRole('button', { name: 'Import template file…' }).click(),
    JSON.parse(readFileSync('tests/fixtures/valid-workspace.json', 'utf8')),
    'ws.caldence.json',
  );
  await expect(panel(page).getByRole('alert')).toContainText('This is not a template file');
  await expect(panel(page).getByRole('region', { name: 'Preview' })).toHaveCount(0);
  await expect(page.locator('.switcher select option')).toHaveText(before);
});

test('exporting a team downloads a template without people', async ({ page }) => {
  await openExample(page);
  await page.getByRole('tab', { name: 'Templates', exact: true }).click();
  await panel(page).getByLabel('Team', { exact: true }).selectOption({ label: 'Team Alpha' });
  await expect(panel(page).getByLabel('Template name')).toHaveValue('Team Alpha');
  const download = page.waitForEvent('download');
  await panel(page).getByRole('button', { name: 'Export template…' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('team-alpha.caldence-template.json');
  const text = readFileSync((await file.path())!, 'utf8');
  const json = JSON.parse(text);
  expect(json.kind).toBe('caldence-template');
  expect(json.id).toBe('team-alpha');
  for (const name of ['Alex', 'Sam']) expect(text).not.toContain(`"${name}"`);
  await expect(panel(page).getByRole('status')).toContainText('team-alpha.caldence-template.json');
});

test('export is disabled without teams', async ({ page }) => {
  await openTemplates(page);
  await expect(panel(page).getByRole('button', { name: 'Export template…' })).toBeDisabled();
  await expect(panel(page).getByText(/There is no team to export yet/)).toBeVisible();
});

const apply = (page: Page, name: string) =>
  panel(page).getByRole('article', { name }).getByRole('button', { name: 'Apply' });

for (const how of ['Escape', 'Cancel'] as const) {
  test(`${how} closes the apply dialog, returns focus and changes nothing`, async ({ page }) => {
    await openTemplates(page);
    await apply(page, 'Scrum').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    if (how === 'Escape') await page.keyboard.press('Escape');
    else await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(apply(page, 'Scrum')).toBeFocused();
    await expect(page.getByText('● Unsaved changes')).toHaveCount(0);
    await expect(panel(page).getByRole('status')).toHaveText('');
    await expect(page.locator('.switcher select')).toHaveCount(0);
  });
}

test('an empty or blank team name is refused inline in the dialog', async ({ page }) => {
  await openTemplates(page);
  await apply(page, 'Scrum').click();
  const dialog = page.getByRole('dialog');
  const input = dialog.getByLabel('Team name');
  for (const value of ['', '   ']) {
    await input.fill(value);
    await dialog.getByRole('button', { name: 'Create team' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('The name must not be empty')).toBeVisible();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAttribute('aria-describedby', /.+/);
    await expect(input).toBeFocused();
    await expect(page.getByText('● Unsaved changes')).toHaveCount(0);
  }
  await input.fill('Fixed');
  await expect(dialog.getByText('The name must not be empty')).toBeHidden();
  await expect(input).not.toHaveAttribute('aria-invalid', /.*/);
});

test('a blank name is refused in the import form too', async ({ page }) => {
  await openTemplates(page);
  await chooseFile(
    page,
    () => panel(page).getByRole('button', { name: 'Import template file…' }).click(),
    'tests/fixtures/templates/custom.caldence-template.json',
    'custom.caldence-template.json',
  );
  const preview = panel(page).getByRole('region', { name: 'Preview' });
  const input = preview.getByLabel('Team name');
  await input.fill('  ');
  await preview.getByRole('button', { name: 'Create team' }).click();
  await expect(preview.getByText('The name must not be empty')).toBeVisible();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toHaveAttribute('aria-describedby', /.+/);
  await expect(input).toBeFocused();
  await expect(page.getByText('● Unsaved changes')).toHaveCount(0);
});

test('importing again clears the old error and the old preview', async ({ page }) => {
  await openTemplates(page);
  const importButton = () => panel(page).getByRole('button', { name: 'Import template file…' });
  const good = 'tests/fixtures/templates/custom.caldence-template.json';
  const preview = panel(page).getByRole('region', { name: 'Preview' });
  await chooseFile(page, () => importButton().click(), good, 'custom.caldence-template.json');
  await expect(preview).toBeVisible();
  // A wrong file removes the preview of the good one.
  await chooseFile(
    page,
    () => importButton().click(),
    JSON.parse(readFileSync('tests/fixtures/valid-workspace.json', 'utf8')),
    'ws.caldence.json',
  );
  await expect(panel(page).getByRole('alert')).toContainText('This is not a template file');
  await expect(preview).toHaveCount(0);
  // A good file clears the alert.
  await chooseFile(page, () => importButton().click(), good, 'custom.caldence-template.json');
  await expect(preview).toBeVisible();
  await expect(panel(page).getByRole('alert')).toHaveText('');
});

test('duplicate team names are allowed and do not crash', async ({ page }) => {
  await openTemplates(page);
  for (let i = 0; i < 2; i++) {
    await apply(page, 'Scrum').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Create team' }).click();
    await expect(panel(page).getByRole('status')).toContainText('Scrum');
    await expect(page.getByRole('dialog')).toBeHidden();
  }
  await expect(panel(page).getByRole('alert')).toHaveText('');
  await panel(page).getByRole('button', { name: 'Open team' }).click();
  await expect(page.locator('.switcher select option')).toHaveText(['Scrum', 'Scrum']);
});

test('no horizontal page scroll at 375 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openExample(page);
  await page.getByRole('tab', { name: 'Templates', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Export template…' })).toBeVisible();
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(fits).toBe(true);
});

for (const locale of ['de', 'en'] as const) {
  test(`axe finds no violations in the templates view and dialog (${locale})`, async ({ page }) => {
    await openTemplates(page);
    await page.getByLabel(/Language|Sprache/).selectOption(locale);
    const run = async (label: string) => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations, label).toEqual([]);
    };
    await run('view');
    await page.locator('#panel-templates article').first().getByRole('button').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await run('dialog');
  });
}
