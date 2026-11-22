import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  openExample,
  pickUnit,
  showView,
  openWorkspaceFile,
  useFileFallback,
  setLanguage,
} from './helpers';

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
  await showView(page, 'Import / Export');
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

test('a re-export with a later From keeps the series start and says when the series end', async ({
  page,
}) => {
  await openExchange(page);
  await panel(page).getByLabel('Selected team').selectOption({ label: 'Team Alpha' });
  const to = panel(page).getByLabel('To', { exact: true });
  await to.fill('2027-06-30');
  await expect(to).toHaveAccessibleDescription(
    'The series end on 06/30/2027; export again before then.',
  );
  const starts = (text: string) =>
    text
      .split('BEGIN:VEVENT')
      .filter((b) => b.includes('RRULE:'))
      .map((b) => /DTSTART[^\r\n]*/.exec(b)![0])
      .sort();
  const first = await exportText(page);
  await panel(page).getByLabel('From', { exact: true }).fill('2027-03-01');
  const second = await exportText(page);
  expect(starts(second.text)).toEqual(starts(first.text));
  expect(starts(first.text).some((s) => s < 'DTSTART;TZID=Europe/Berlin:20270301')).toBe(true);
  // Nothing changed, so every entry keeps its SEQUENCE.
  const seq = (text: string) =>
    new Map(
      [...text.matchAll(/UID:(\S+)\r\nDTSTAMP:\S+\r\nSEQUENCE:(\d+)/g)].map((m) => [m[1], m[2]]),
    );
  const before = seq(first.text);
  expect(seq(second.text).size).toBeGreaterThan(0);
  for (const [uid, n] of seq(second.text)) expect(n).toBe(before.get(uid));
});

test('one file per person comes as a ZIP with a calendar for each person', async ({ page }) => {
  await openExchange(page);
  await panel(page).getByRole('radio', { name: 'Person', exact: true }).check();
  const download = page.waitForEvent('download');
  await panel(page).getByRole('button', { name: 'One file per person (ZIP)…' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('caldence-people.zip');
  const bytes = readFileSync((await file.path())!);
  expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
  const text = bytes.toString('latin1');
  const names = [...text.matchAll(/caldence-[a-z0-9-]+\.ics/g)].map((m) => m[0]);
  expect(new Set(names).size).toBeGreaterThan(1);
  expect(text).toContain('BEGIN:VCALENDAR');
  await expect(panel(page).getByRole('status')).toContainText('caldence-people.zip saved with');
});

test('team files in the ZIP hold the area meetings their people are invited to (#507)', async ({
  page,
}) => {
  await openExchange(page);
  const download = page.waitForEvent('download');
  await panel(page).getByRole('button', { name: 'One file per team (ZIP)…' }).click();
  const text = readFileSync((await (await download).path())!).toString('latin1');
  const gamma = text.slice(text.indexOf('caldence-team-gamma.ics'));
  const gammaFile = gamma.slice(0, gamma.indexOf('END:VCALENDAR'));
  expect(gammaFile).toContain('UID:ev-po-forum.area-commerce.');
  const alpha = text.slice(text.indexOf('caldence-team-alpha.ics'));
  expect(alpha.slice(0, alpha.indexOf('END:VCALENDAR'))).not.toContain('UID:ev-po-forum.');
  await expect(panel(page).getByRole('status')).toContainText(
    'Each team file also holds the meetings in the area its people are invited to',
  );
});

test('an inverted period shows an error and an empty period says so on export', async ({
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
  // Whether the period holds meetings is only known once the file is built.
  await button.click();
  await expect(panel(page).getByRole('status')).toHaveText(
    'There is nothing to export for this scope and period.',
  );
  // Changing the form clears the message.
  await panel(page).getByRole('radio', { name: 'Role' }).check();
  await expect(panel(page).getByRole('status')).toHaveText('');
});

test('an empty date shows "Enter a date" on that field only', async ({ page }) => {
  await openExchange(page);
  const from = panel(page).getByLabel('From', { exact: true });
  const to = panel(page).getByLabel('To', { exact: true });
  const button = panel(page).getByRole('button', { name: 'Export .ics…' });
  await to.fill('');
  await expect(to).toHaveAttribute('aria-invalid', 'true');
  await expect(to).toHaveAccessibleDescription('Enter a date.');
  await expect(from).not.toHaveAttribute('aria-invalid');
  await expect(panel(page).getByText('The start date must not be after the end date.')).toHaveCount(
    0,
  );
  await expect(button).toBeDisabled();
  await from.fill('');
  await expect(from).toHaveAccessibleDescription('Enter a date.');
  await from.fill('2027-02-01');
  await to.fill('2027-03-01');
  await expect(from).not.toHaveAttribute('aria-invalid');
  await expect(to).not.toHaveAttribute('aria-invalid');
  await expect(button).toBeEnabled();
});

test('DTSTAMP is the export time and a form change clears the export status', async ({ page }) => {
  await openExchange(page);
  await panel(page).getByLabel('Reminder').selectOption({ index: 1 });
  await page.clock.setFixedTime(new Date('2027-01-04T15:30:00Z'));
  const { text } = await exportText(page);
  expect(text).toContain('DTSTAMP:20270104T153000Z');
  await expect(panel(page).getByRole('status')).toContainText('caldence-team-alpha.ics');
  await panel(page)
    .getByRole('checkbox', { name: /holidays/i })
    .first()
    .check();
  await expect(panel(page).getByRole('status')).toHaveText('');
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
  const details = panel(page).locator('details:not(.holiday-drops)');
  await expect(details).toContainText('Betriebsausflug: All-day item');
  await expect(details).toContainText('Abgesagt: Lieferantentermin: Cancelled event');
  await expect(details).toContainText('Architektur-Runde: Changed single instance');
});

test('importing the selected rows is one undo step', async ({ page }) => {
  await openExchange(page);
  await page.getByRole('tab', { name: 'Meetings & cadence', exact: true }).click();
  const meetings = page.getByRole('tabpanel', { name: 'Meetings & cadence' });
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
  await page.getByRole('heading', { level: 2, name: 'Meetings & cadence' }).click();
  await page.keyboard.press('Control+z');
  await expect(meetings.locator('tbody tr')).toHaveCount(before);
});

test('importing a file Caldence just exported marks every row as present', async ({ page }) => {
  await openExchange(page);
  const { text } = await exportText(page);
  await chooseIcs(page, Buffer.from(text), 'caldence-team-alpha.ics');
  const rows = rowsOf(page);
  // Reading the file is asynchronous: wait for the review before counting its rows.
  await expect(rows.first()).toBeVisible();
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

  await page.getByRole('tab', { name: 'Settings' }).click();
  const zone = page.getByLabel('Time zone');
  await expect(zone).toHaveAttribute('aria-invalid', 'true');
  await expect(zone).toHaveAccessibleDescription(/does not know the time zone Mitteleuropa/);
  await expect(page.getByLabel('Region')).not.toHaveAttribute('aria-invalid');

  await page.getByRole('tab', { name: 'Import / Export', exact: true }).click();
  const button = panel(page).getByRole('button', { name: 'Export .ics…' });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAccessibleDescription(/time zone Mitteleuropa of this file/);
  await expect(panel(page).getByRole('button', { name: /Choose .ics file…/ })).toBeDisabled();

  await page.getByRole('tab', { name: 'Settings' }).click();
  await zone.selectOption('Europe/Berlin');
  await expect(zone).not.toHaveAttribute('aria-invalid');
  await page.getByRole('tab', { name: 'Import / Export', exact: true }).click();
  await expect(button).toBeEnabled();
});

for (const locale of ['de', 'en'] as const) {
  test(`axe finds no violations with the import table filled (${locale})`, async ({ page }) => {
    await openExchange(page);
    await setLanguage(page, locale);
    await chooseIcs(page, OUTLOOK, 'outlook-sample.ics');
    await expect(rowsOf(page)).toHaveCount(6);
    await panel(page).locator('details:not(.holiday-drops) summary').click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test('a second export updates the first and cancels a deleted meeting (#21)', async ({ page }) => {
  await openExchange(page);
  const first = await exportText(page);
  expect(first.text).toMatch(/\r\nSEQUENCE:\d+\r\n/);
  expect(first.text).not.toContain('STATUS:CANCELLED');

  // Delete the Weekly Sync of Team Alpha, then export the same team again.
  await showView(page, 'Meetings & cadence');
  const meetings = page.getByRole('tabpanel', { name: 'Meetings & cadence' });
  await meetings.locator('[data-more]').first().waitFor();
  const row = meetings.locator('tr', { hasText: 'Weekly Sync' });
  await row.locator('[data-more]').click();
  await meetings
    .getByRole('button', { name: /^Delete/ })
    .first()
    .click();
  await expect(meetings.locator('tr', { hasText: 'Weekly Sync' })).toHaveCount(0);

  await showView(page, 'Import / Export');
  const second = await exportText(page);
  expect(second.text).toContain('STATUS:CANCELLED');
  expect(second.text).toMatch(/UID:ev-sync\.team-alpha\.[^\r]+\r\n/);
  await expect(panel(page).getByRole('status')).toContainText('included as cancelled: 1');
});

test('"Add to calendar" opens the export for this team, then for the person exported last', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  await openExample(page);
  await page.getByRole('tab', { name: 'Meetings & cadence', exact: true }).click();
  await page.getByRole('button', { name: 'Add to calendar…' }).click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole('radio', { name: 'Team', exact: true })).toBeChecked();
  await expect(panel(page).getByLabel('Selected team')).toHaveValue(/team-alpha/);
  // Export one person's meetings: the next "Add to calendar" starts there.
  await panel(page).getByRole('radio', { name: 'Person', exact: true }).check();
  const person = panel(page).getByLabel('Selected person');
  await person.selectOption({ label: 'Sam' });
  const picked = await person.inputValue();
  await exportText(page);
  await page.getByRole('tab', { name: 'Meetings & cadence', exact: true }).click();
  await page.getByRole('button', { name: 'Add to calendar…' }).click();
  await expect(panel(page).getByRole('radio', { name: 'Person', exact: true })).toBeChecked();
  await expect(panel(page).getByLabel('Selected person')).toHaveValue(picked);
  // A team export forgets the person again.
  await panel(page).getByRole('radio', { name: 'Team', exact: true }).check();
  await exportText(page);
  await page.getByRole('tab', { name: 'Meetings & cadence', exact: true }).click();
  await page.getByRole('button', { name: 'Add to calendar…' }).click();
  await expect(panel(page).getByRole('radio', { name: 'Team', exact: true })).toBeChecked();
});

test('"Add to calendar" falls back to the team when the remembered person is not in it', async ({
  page,
}) => {
  await openExchange(page);
  await panel(page).getByRole('radio', { name: 'Person', exact: true }).check();
  await panel(page).getByLabel('Selected person').selectOption({ label: 'Sam' });
  await exportText(page);
  await pickUnit(page, 'Team Gamma');
  await page.getByRole('tab', { name: 'Meetings & cadence', exact: true }).click();
  await page.getByRole('button', { name: 'Add to calendar…' }).click();
  await expect(panel(page).getByRole('radio', { name: 'Team', exact: true })).toBeChecked();
  await expect(panel(page).getByLabel('Selected team')).toHaveValue('team-gamma');
});

test('after a team export, Import / Export opens on the unit selected now', async ({ page }) => {
  await openExchange(page);
  await panel(page).getByLabel('Selected team').selectOption({ label: 'Team Alpha' });
  await exportText(page);
  await pickUnit(page, 'Team Gamma');
  await showView(page, 'Calendar');
  await showView(page, 'Import / Export');
  await expect(panel(page).getByRole('radio', { name: 'Team', exact: true })).toBeChecked();
  await expect(panel(page).getByLabel('Selected team')).toHaveValue('team-gamma');
});

test('Import / Export opens on the last export, which points to the manual', async ({ page }) => {
  await openExchange(page);
  await panel(page).getByRole('radio', { name: 'Person', exact: true }).check();
  await panel(page).getByLabel('Selected person').selectOption({ label: 'Sam' });
  const picked = await panel(page).getByLabel('Selected person').inputValue();
  await exportText(page);
  await expect(panel(page).getByRole('status')).toContainText(
    'calendar apps that support updates replace the entries',
  );
  await showView(page, 'Calendar');
  await showView(page, 'Import / Export');
  await expect(panel(page).getByRole('radio', { name: 'Person', exact: true })).toBeChecked();
  await expect(panel(page).getByLabel('Selected person')).toHaveValue(picked);
  await exportText(page);
  await panel(page).getByRole('button', { name: 'How to bring this into your calendar' }).click();
  await expect(page.getByRole('heading', { name: 'Import into your calendar' })).toBeFocused();
});
