import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openExample, openWorkspaceFile, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const TODAY = '2027-01-04'; // the Outlook sample's single event (2027-02-10) is still ahead
const OUTLOOK = 'tests/fixtures/ics/outlook-sample.ics';
const panel = (page: Page) => page.getByRole('tabpanel', { name: 'Import / Export' });

async function openExchange(page: Page) {
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  await openExample(page);
  await page.getByRole('tab', { name: 'Import / Export', exact: true }).click();
  await expect(panel(page)).toBeVisible();
}

async function chooseIcs(page: Page, file: string | Buffer, name = 'in.ics') {
  const chooser = page.waitForEvent('filechooser');
  await panel(page)
    .getByRole('button', { name: /Choose .ics file…|.ics-Datei wählen…/ })
    .click();
  const buffer = typeof file === 'string' ? readFileSync(file) : file;
  await (await chooser).setFiles({ name, mimeType: 'text/calendar', buffer });
}

async function exportText(page: Page): Promise<{ text: string; name: string }> {
  const download = page.waitForEvent('download');
  await panel(page).getByRole('button', { name: 'Export .ics…' }).click();
  const file = await download;
  return { text: readFileSync((await file.path())!, 'utf8'), name: file.suggestedFilename() };
}

const rowsOf = (page: Page) => panel(page).locator('tbody tr');

test('exporting the example team downloads a file that matches the status', async ({ page }) => {
  await openExchange(page);
  await panel(page).getByLabel('Selected team').selectOption({ label: 'Team Alpha' });
  const { text, name } = await exportText(page);
  expect(name).toBe('caldence-team-alpha.ics');
  const status = await panel(page).getByRole('status').textContent();
  const [, series, single] = /(\d+) recurring series and (\d+) single events/.exec(status!)!;
  expect(text.split('BEGIN:VEVENT').length - 1).toBe(Number(series) + Number(single));
  expect(Number(series)).toBeGreaterThan(0);
  expect(status).toContain('caldence-team-alpha.ics');
});

test('an inverted period shows an error and a scope without events disables export', async ({
  page,
}) => {
  await openExchange(page);
  const button = panel(page).getByRole('button', { name: 'Export .ics…' });
  await panel(page).getByLabel('From', { exact: true }).fill('2027-06-01');
  await panel(page).getByLabel('To', { exact: true }).fill('2027-05-01');
  await expect(
    panel(page).getByText('The start date must not be after the end date.'),
  ).toBeVisible();
  await expect(button).toBeDisabled();
  await panel(page).getByLabel('To', { exact: true }).fill('2027-06-30');
  await expect(button).toBeEnabled();
  await panel(page).getByLabel('From', { exact: true }).fill('1999-01-01');
  await panel(page).getByLabel('To', { exact: true }).fill('1999-01-02');
  await expect(button).toBeDisabled();
  await expect(panel(page).getByText('There is nothing to export for this scope')).toBeVisible();
});

test('the Outlook sample lists six rows and the left-out items', async ({ page }) => {
  await openExchange(page);
  await chooseIcs(page, OUTLOOK, 'outlook-sample.ics');
  await expect(rowsOf(page)).toHaveCount(6);
  await expect(
    panel(page).getByRole('checkbox', { name: /Import Jahresplanung/ }),
  ).not.toBeChecked();
  await expect(panel(page).getByRole('checkbox', { name: /Import Daily/ })).toBeChecked();
  await expect(panel(page).getByRole('button', { name: 'Import 5 meetings' })).toBeEnabled();
  await panel(page).getByText('Left out items').click();
  const details = panel(page).locator('details');
  await expect(details).toContainText('Betriebsausflug: All-day item');
  await expect(details).toContainText('Abgesagt: Lieferantentermin: Cancelled event');
  await expect(details).toContainText('Architektur-Runde (verschoben): Changed single instance');
});

test('importing the selected rows is one undo step', async ({ page }) => {
  await openExchange(page);
  await page.getByRole('tab', { name: 'Meetings', exact: true }).click();
  const meetings = page.getByRole('tabpanel', { name: 'Meetings' });
  const before = await meetings.locator('tbody tr').count();
  await page.getByRole('tab', { name: 'Import / Export', exact: true }).click();
  await chooseIcs(page, OUTLOOK, 'outlook-sample.ics');
  await panel(page).getByRole('checkbox', { name: 'Product Owner' }).check();
  await panel(page).getByRole('button', { name: 'Import 5 meetings' }).click();
  await expect(panel(page).getByRole('status')).toContainText('5 meetings were imported');
  await expect(panel(page).getByRole('button', { name: 'Open Meetings' })).toBeFocused();
  await panel(page).getByRole('button', { name: 'Open Meetings' }).click();
  await expect(meetings.locator('tbody tr')).toHaveCount(before + 5);
  await expect(meetings).toContainText('Team-Abstimmung');
  await page.getByRole('heading', { level: 2, name: 'Meetings' }).click();
  await page.keyboard.press('Control+z');
  await expect(meetings.locator('tbody tr')).toHaveCount(before);
});

test('importing a file Caldence just exported marks every row as present', async ({ page }) => {
  await openExchange(page);
  const { text } = await exportText(page);
  await chooseIcs(page, Buffer.from(text), 'caldence-team-alpha.ics');
  const rows = rowsOf(page);
  expect(await rows.count()).toBeGreaterThan(0);
  for (const row of await rows.all()) {
    await expect(row).toContainText('Already in Caldence');
    await expect(row.getByRole('checkbox')).not.toBeChecked();
  }
  await expect(panel(page).getByRole('button', { name: 'Import 0 meetings' })).toBeDisabled();
});

test('a file that is not iCalendar shows an error and changes nothing', async ({ page }) => {
  await openExchange(page);
  await chooseIcs(page, Buffer.from('hello'), 'hello.ics');
  await expect(panel(page).getByRole('alert')).toHaveText(
    'The file is not an iCalendar file (.ics).',
  );
  await expect(rowsOf(page)).toHaveCount(0);
  await expect(page.getByText('● Unsaved changes')).toHaveCount(0);
});

test('no horizontal page scroll at 375 px with the table filled', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openExchange(page);
  await chooseIcs(page, OUTLOOK, 'outlook-sample.ics');
  await expect(rowsOf(page)).toHaveCount(6);
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(fits).toBe(true);
  const wrap = panel(page).locator('.table-wrap');
  expect(await wrap.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});

test('a time zone this browser does not know still loads, is flagged and blocks export', async ({
  page,
}) => {
  const ws = JSON.parse(readFileSync('tests/fixtures/valid-workspace.json', 'utf8'));
  ws.settings.locale = 'en';
  ws.settings.timezone = 'Mitteleuropa';
  await page.goto('/');
  await openWorkspaceFile(page, ws, 'old.caldence.json');
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Workspace settings' }).click();
  const zone = page.getByLabel('Time zone');
  await expect(zone).toHaveAttribute('aria-invalid', 'true');
  await expect(zone).toHaveAccessibleDescription(/does not know the time zone Mitteleuropa/);
  await expect(page.getByLabel('Region')).not.toHaveAttribute('aria-invalid');

  await page.getByRole('tab', { name: 'Import / Export', exact: true }).click();
  const button = panel(page).getByRole('button', { name: 'Export .ics…' });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAccessibleDescription(/workspace time zone Mitteleuropa/);
  await expect(panel(page).getByRole('button', { name: /Choose .ics file…/ })).toBeDisabled();

  await page.getByRole('tab', { name: 'Workspace settings' }).click();
  await zone.selectOption('Europe/Berlin');
  await expect(zone).not.toHaveAttribute('aria-invalid');
  await page.getByRole('tab', { name: 'Import / Export', exact: true }).click();
  await expect(button).toBeEnabled();
});

for (const locale of ['de', 'en'] as const) {
  test(`axe finds no violations with the import table filled (${locale})`, async ({ page }) => {
    await openExchange(page);
    await page.getByLabel(/Language|Sprache/).selectOption(locale);
    await chooseIcs(page, OUTLOOK, 'outlook-sample.ics');
    await expect(rowsOf(page)).toHaveCount(6);
    await panel(page).locator('details summary').click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
