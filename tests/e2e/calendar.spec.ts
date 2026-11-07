import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { Workspace } from '../../src/core/model';
import { ALEX_OVERLAP_DAY, DAY_HOURS, fmt } from './calendar-expected';
import { openExample, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const example = JSON.parse(
  readFileSync('src/data/examples/example.caldence.json', 'utf8'),
) as Workspace;

const panel = (page: Page) => page.getByRole('tabpanel', { name: /Calendar|Kalender/ });
const cellOf = (page: Page, date: string) => panel(page).locator(`td[data-date="${date}"]`);

/** Opens the example with the clock fixed on `today` (the calendar starts in that month). */
async function openCalendar(page: Page, today: string, lang: 'de' | 'en' = 'en') {
  await page.clock.setFixedTime(new Date(`${today}T12:00:00`));
  await openExample(page);
  await page.getByLabel(/Language|Sprache/).selectOption(lang);
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

test('Christmas shows the holiday name in the UI language with 0 h', async ({ page }) => {
  await openCalendar(page, '2027-12-10', 'de');
  await expect(panel(page).getByRole('grid', { name: 'Dezember 2027' })).toBeVisible();
  const day = cellOf(page, '2027-12-25');
  await expect(day).toContainText('1. Weihnachtstag');
  await expect(day).toContainText('0,0 h');
  await page.getByLabel('Sprache').selectOption('en');
  await expect(panel(page).getByRole('grid', { name: 'December 2027' })).toBeVisible();
  await expect(day).toContainText('Christmas Day');
  await expect(day).toContainText('0.0 h');
  await expect(
    panel(page).getByRole('gridcell', {
      name: /^Saturday, December 25, 2027, Non-working day, Holiday: Christmas Day/,
    }),
  ).toBeVisible();
});

test('a skipped holiday meeting counts 0 h but is explained in the details', async ({ page }) => {
  // Ascension Day 2027-05-06 is a Thursday: Team Beta's weekly Replenishment is skipped.
  await openCalendar(page, '2027-05-10');
  await page
    .getByRole('combobox', { name: 'Team', exact: true })
    .selectOption({ label: 'Team Beta' });
  const day = cellOf(page, '2027-05-06');
  await expect(day).toContainText('Ascension Day');
  await expect(day).toContainText('0.0 h');
  await day.click();
  const details = panel(page).getByRole('region', { name: /May 6, 2027/ });
  await expect(details.getByText('Holiday: Ascension Day')).toBeVisible();
  await expect(details).toContainText('Replenishment');
  await expect(details).toContainText('skipped because of a holiday');
});

test('day hours equal dayLoad of the example (constants checked by a unit test)', async ({
  page,
}) => {
  await openCalendar(page, '2027-03-15');
  // The constants are dayLoad for exactly this filter.
  await page
    .getByRole('combobox', { name: 'Team', exact: true })
    .selectOption({ label: 'Team Alpha' });
  for (const [d, h] of Object.entries(DAY_HOURS))
    await expect(cellOf(page, d)).toContainText(`${fmt('en', h)} h`);
  await expect(cellOf(page, '2027-03-02')).toContainText('1 meeting');
});

test('cadence start and milestones are shown as text', async ({ page }) => {
  await openCalendar(page, '2027-01-15');
  // Sprint 1 starts 2027-01-07, sprint 2 on 2027-01-21.
  await expect(cellOf(page, '2027-01-07')).toContainText('Sprint 1');
  await expect(cellOf(page, '2027-01-21')).toContainText('Sprint 2');
  await expect(cellOf(page, '2027-01-01')).toContainText('Christmas break');
  for (let i = 0; i < 5; i++) await panel(page).getByRole('button', { name: 'Next month' }).click();
  await expect(cellOf(page, '2027-06-30')).toContainText('Milestone: Release');
});

test('the person filter shows the overlap in the day details and the cell', async ({ page }) => {
  await openCalendar(page, ALEX_OVERLAP_DAY);
  await page.getByLabel('Person').selectOption({ label: 'Alex' });
  const day = cellOf(page, ALEX_OVERLAP_DAY);
  await expect(day.getByRole('img', { name: 'Has overlap' })).toHaveText('!');
  await day.click();
  const details = panel(page).getByRole('region', { name: /\d{4}/ });
  await expect(details.getByText(/Overlap: .+ \(Team .+\) and .+ \(Team .+\)/)).toBeVisible();
  await expect(details.locator('span[aria-hidden="true"]')).toHaveText('⚠');
  await expect(
    panel(page).getByRole('gridcell', { name: /Thursday, January 7, 2027.*Has overlap/ }),
  ).toBeVisible();
  await expect(day).toHaveAttribute('aria-selected', 'true');
  // Without a person filter the marker is gone.
  await page.getByLabel('Person').selectOption({ label: 'All' });
  await expect(day.getByRole('img', { name: 'Has overlap' })).toHaveCount(0);
});

test('the person filter marks cadence starts only of the teams of the person', async ({ page }) => {
  await openCalendar(page, '2027-01-15');
  await page.getByLabel('Person').selectOption({ label: 'Alex' });
  await expect(cellOf(page, '2027-01-07')).toContainText('Sprint 1 (Team Alpha)');
  await expect(cellOf(page, '2027-01-04')).toContainText('Period 1 (Team Beta)');
  await page.getByLabel('Person').selectOption({ label: 'All' });
  await expect(cellOf(page, '2027-01-04')).not.toContainText('Period 1');
});

test('Today is clamped to the horizon', async ({ page }) => {
  await openCalendar(page, '2026-11-07');
  const label = panel(page).locator('[aria-live="polite"]');
  await expect(label).toHaveText('January 2027');
  await panel(page).getByRole('button', { name: 'Next month' }).click();
  await panel(page).getByRole('button', { name: 'Today' }).click();
  await expect(label).toHaveText('January 2027');
});

test('arrow keys, Home, End, PageUp and PageDown move the focus in the grid', async ({ page }) => {
  await openCalendar(page, '2027-03-10');
  await cellOf(page, '2027-03-10').focus();
  await page.keyboard.press('ArrowRight');
  await expect(cellOf(page, '2027-03-11')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(cellOf(page, '2027-03-18')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect(cellOf(page, '2027-03-10')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(cellOf(page, '2027-03-08')).toBeFocused();
  await page.keyboard.press('End');
  await expect(cellOf(page, '2027-03-14')).toBeFocused();
  await page.keyboard.press('PageDown');
  await expect(panel(page).getByRole('grid', { name: 'April 2027' })).toBeVisible();
  await expect(cellOf(page, '2027-04-14')).toBeFocused();
  await page.keyboard.press('PageUp');
  await expect(cellOf(page, '2027-03-14')).toBeFocused();
  // Crossing the month by arrow keys changes the month and keeps the focus.
  await cellOf(page, '2027-03-14').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(panel(page).getByRole('grid', { name: 'April 2027' })).toBeVisible();
  await expect(cellOf(page, '2027-04-11')).toBeFocused();
  // Enter selects the day and opens its details below the grid.
  await page.keyboard.press('Enter');
  await expect(cellOf(page, '2027-04-11')).toHaveAttribute('aria-selected', 'true');
  await expect(
    panel(page).getByRole('heading', { level: 3, name: 'Sunday, April 11, 2027' }),
  ).toBeVisible();
  // The details take the focus; Escape closes them and returns it to the cell.
  await expect(
    panel(page).getByRole('heading', { level: 3, name: /April 11, 2027/ }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel(page).getByRole('region', { name: /April 11, 2027/ })).toHaveCount(0);
  await expect(cellOf(page, '2027-04-11')).toBeFocused();
  // Navigating to another month closes the details of a day.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await cellOf(page, '2027-04-11').focus();
  await page.keyboard.press('PageDown');
  await expect(panel(page).getByRole('region', { name: /April 11, 2027/ })).toHaveCount(0);
  // Only one cell is in the tab order (roving tabindex).
  await expect(panel(page).locator('td[tabindex="0"]')).toHaveCount(1);
});

test('toolbar: previous, today, next and the week view', async ({ page }) => {
  await openCalendar(page, '2027-03-10');
  const label = panel(page).locator('[aria-live="polite"]');
  await expect(label).toHaveText('March 2027');
  await panel(page).getByRole('button', { name: 'Next month' }).click();
  await expect(label).toHaveText('April 2027');
  await panel(page).getByRole('button', { name: 'Today' }).click();
  await expect(label).toHaveText('March 2027');

  const week = panel(page).getByRole('button', { name: 'Week', exact: true });
  await week.click();
  await expect(week).toHaveAttribute('aria-pressed', 'true');
  await expect(label).toContainText('Week 10');
  await expect(panel(page).getByRole('heading', { level: 3 })).toHaveCount(7);
  const tuesday = panel(page).locator('section', {
    has: page.getByRole('heading', { name: 'Tuesday, March 9, 2027' }),
  });
  await expect(tuesday).toContainText('09:30');
  await expect(tuesday).toContainText('Weekly Sync');
  await expect(tuesday).toContainText('Team Alpha');
  await panel(page).getByRole('button', { name: 'Next week' }).click();
  await expect(label).toContainText('Week 11');
});

test('days outside the planning horizon show no data', async ({ page }) => {
  await openCalendar(page, '2027-01-15');
  await panel(page).getByRole('button', { name: 'Previous month' }).click();
  const day = cellOf(page, '2026-12-25');
  await expect(day).toContainText('Outside planning horizon');
  await expect(day).not.toContainText('Christmas');
  await expect(day).not.toContainText(/\d h\b/);
});

test('a workspace without teams shows the start screen', async ({ page }) => {
  await page.goto('/');
  await expect(panel(page).getByRole('button', { name: 'Open example' })).toBeVisible();
  await expect(panel(page).getByRole('grid')).toHaveCount(0);
});

test('teams without meetings show a hint that leads to the Meetings view', async ({ page }) => {
  const ws = structuredClone(example);
  ws.settings.locale = 'en';
  for (const team of ws.teams) team.events = [];
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'empty.caldence.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ws)),
  });
  await expect(page.getByText('empty.caldence.json')).toBeVisible();
  await expect(panel(page).getByText('There are no meetings yet')).toBeVisible();
  await expect(panel(page).getByRole('grid')).toBeVisible();
  await panel(page).getByRole('button', { name: 'Go to Meetings' }).click();
  await expect(page.getByRole('tab', { name: 'Meetings', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tab', { name: 'Meetings', exact: true })).toBeFocused();
});

test('no horizontal page scroll at 375 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openCalendar(page, '2027-03-10');
  await expect(panel(page).getByRole('grid')).toBeVisible();
  const fits = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
  expect(await fits()).toBe(true);
  // The table scrolls inside its own labelled region.
  const region = panel(page).getByRole('region', { name: 'Month grid' });
  await expect(region).toHaveAttribute('tabindex', '0');
  await panel(page).getByRole('button', { name: 'Week', exact: true }).click();
  await expect(panel(page).getByRole('heading', { level: 3 })).toHaveCount(7);
  expect(await fits()).toBe(true);
});

for (const lang of ['de', 'en'] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations in month and week view (${lang}, ${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openCalendar(page, ALEX_OVERLAP_DAY, lang);
      const axe = () =>
        new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
      expect((await axe()).violations, 'month').toEqual([]);
      // With a person filter and a selected day: marker and details are checked as well.
      await page.getByLabel(/Person/).selectOption({ label: 'Alex' });
      await cellOf(page, ALEX_OVERLAP_DAY).click();
      expect((await axe()).violations, 'month with details').toEqual([]);
      await panel(page)
        .getByRole('button', { name: lang === 'de' ? 'Woche' : 'Week', exact: true })
        .click();
      expect((await axe()).violations, 'week').toEqual([]);
    });
  }
}
