import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openExample, useFileFallback } from './helpers';
const pct = (locale: Lang, fraction: number): string =>
  new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(fraction);
import {
  ALEX,
  ALEX_START_WEEK,
  CADENCE_START_WEEK,
  CATEGORY_HOURS,
  fmt,
  ROLE_HOURS,
} from './weeks-load-expected';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

type Lang = 'de' | 'en';
const tabName = { weeks: { de: 'Wochen', en: 'Weeks' }, load: { de: 'Auslastung', en: 'Load' } };

/** Opens the example with the clock fixed on `today` and shows a view in the given language. */
async function openView(
  page: Page,
  view: 'weeks' | 'load',
  today = '2027-03-10',
  lang: Lang = 'en',
) {
  await page.clock.setFixedTime(new Date(`${today}T12:00:00`));
  await openExample(page);
  await page.getByLabel(/Language|Sprache/).selectOption(lang);
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
  await page.getByRole('tab', { name: tabName[view][lang], exact: true }).click();
  return page.getByRole('tabpanel', { name: tabName[view][lang] });
}

const weekRow = (panel: ReturnType<Page['getByRole']>, monday: string) =>
  panel.locator(`tr[data-monday="${monday}"]`);

test('the cadence start week shows Sprint 1 and the hours of the example', async ({ page }) => {
  const panel = await openView(page, 'weeks');
  await expect(panel.getByRole('table')).toBeVisible();
  await expect(panel.locator('caption')).toHaveText('Weeks 01/01/2027–12/31/2027');
  const row = weekRow(panel, CADENCE_START_WEEK.monday);
  await expect(row.getByRole('rowheader')).toHaveText(`W${CADENCE_START_WEEK.isoWeek}`);
  // Team Alpha is in scope alone, so the team name is left out.
  await expect(row.getByRole('cell').nth(1)).toHaveText('Sprint 1');
  await expect(row.getByRole('cell').first()).toHaveText('01/04/2027');
  // One column per role in workspace order, then the total.
  await expect(panel.getByRole('columnheader')).toHaveText([
    'Week',
    'Monday',
    'Cadence',
    'Milestones',
    'Holidays',
    'School holidays',
    ...ROLE_HOURS.map((r) => r.name),
    'Total',
  ]);
  const hours = Object.values(CADENCE_START_WEEK.byRole).map((h) => fmt('en', h));
  await expect(row.getByRole('cell').nth(5)).toHaveText(hours[0]!);
  await expect(row.getByRole('cell').nth(6)).toHaveText(hours[1]!);
  await expect(row.getByRole('cell').nth(7)).toHaveText(fmt('en', CADENCE_START_WEEK.total));
  // The first row is the week of the horizon start with its holiday and school holiday.
  const first = weekRow(panel, '2026-12-28');
  await expect(first).toContainText("New Year's Day");
  await expect(first).toContainText('Christmas break');
  await expect(weekRow(panel, '2027-06-28').getByRole('cell').nth(2)).toHaveText('Release');
});

test('the person filter scopes cadence and milestones to the teams of the person', async ({
  page,
}) => {
  const panel = await openView(page, 'weeks');
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Alex' });
  const row = weekRow(panel, CADENCE_START_WEEK.monday);
  await expect(row.getByRole('cell').nth(1)).toContainText('Sprint 1 (Team Alpha)');
  await expect(row.getByRole('cell').nth(1)).toContainText('Period 1 (Team Beta)');
  // Alex only holds the Product Owner role.
  await expect(panel.getByRole('columnheader', { name: 'Scrum Master' })).toHaveCount(0);
  await expect(row.getByRole('cell').nth(5)).toHaveText(
    fmt('en', ALEX_START_WEEK.byRole['role-po']),
  );
  await expect(row.getByRole('cell').nth(6)).toHaveText(fmt('en', ALEX_START_WEEK.total));
  await expect(weekRow(panel, '2027-06-28').getByRole('cell').nth(2)).toHaveText(
    'Release (Team Alpha)',
  );
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'All' });
  await expect(row.getByRole('cell').nth(1)).toHaveText('Sprint 1');
});

test('the current week is marked by text and attribute, scrolled into view, focus stays', async ({
  page,
}) => {
  const panel = await openView(page, 'weeks', '2027-09-15');
  const current = panel.locator('tr[aria-current="date"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute('data-monday', '2027-09-13');
  await expect(current.getByText('This week')).toBeVisible();
  await expect(current).toBeInViewport();
  await expect(page.getByRole('tab', { name: 'Weeks', exact: true })).toBeFocused();
});

test('no row is marked when today is outside the horizon', async ({ page }) => {
  const panel = await openView(page, 'weeks', '2030-05-06');
  await expect(panel.getByRole('table')).toBeVisible();
  await expect(panel.locator('tr[aria-current]')).toHaveCount(0);
  await expect(panel.getByText('This week')).toHaveCount(0);
});

test('German labels and number format in the weeks table', async ({ page }) => {
  const panel = await openView(page, 'weeks', '2027-03-10', 'de');
  await expect(panel.locator('caption')).toHaveText('Wochen 01.01.2027–31.12.2027');
  const row = weekRow(panel, CADENCE_START_WEEK.monday);
  await expect(row.getByRole('rowheader')).toHaveText('KW 1');
  await expect(row.getByRole('cell').nth(1)).toHaveText('Sprint 1');
  await expect(row.getByRole('cell').nth(7)).toHaveText(fmt('de', CADENCE_START_WEEK.total));
  await expect(weekRow(panel, '2026-12-28')).toContainText('Neujahr');
});

test('a horizon that ends before the cadence starts gives rows without cadence', async ({
  page,
}) => {
  const panel = await openView(page, 'weeks');
  await page.getByRole('tab', { name: 'Workspace settings', exact: true }).click();
  await page.getByLabel('Horizon from').fill('2026-06-01');
  await page.getByLabel('Horizon to').fill('2026-12-31');
  await expect(page.getByLabel('Horizon to')).not.toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('tab', { name: 'Weeks', exact: true }).click();
  await expect(panel.locator('caption')).toHaveText('Weeks 06/01/2026–12/31/2026');
  expect(await panel.locator('tbody tr').count()).toBeGreaterThan(20);
  await expect(panel.getByText(/Sprint|Period/)).toHaveCount(0);
  await page.getByRole('tab', { name: 'Load', exact: true }).click();
  await expect(
    page.getByRole('tabpanel', { name: 'Load' }).getByRole('table').first(),
  ).toBeVisible();
});

test('empty workspace explains how to start in both views', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Weeks', 'Load']) {
    await page.getByRole('tab', { name, exact: true }).click();
    const panel = page.getByRole('tabpanel', { name });
    await expect(panel.getByRole('heading', { name: 'No teams yet' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Open example' })).toBeVisible();
    await expect(panel.getByRole('table')).toHaveCount(0);
  }
});

test('the load tables equal loadSummary of Team Alpha in the example (constants checked by a unit test)', async ({
  page,
}) => {
  const panel = await openView(page, 'load');
  const base = panel.getByRole('table', { name: 'Base load per week' });
  await expect(base.getByRole('columnheader')).toHaveText([
    'Category',
    ...ROLE_HOURS.map((r) => r.name),
    'Total',
  ]);
  for (const [id, name, roles] of CATEGORY_HOURS) {
    const row = base.locator(`tr[data-category="${id}"]`);
    await expect(row.getByRole('rowheader')).toHaveText(name);
    const cells = ROLE_HOURS.map((r) => fmt('en', roles[r.roleId] ?? 0));
    const total = fmt(
      'en',
      Object.values(roles).reduce((a, b) => a + b, 0),
    );
    await expect(row.getByRole('cell')).toHaveText([...cells, total]);
  }
  const perRole = panel.getByRole('table', { name: 'Per role' });
  await expect(perRole.getByRole('columnheader')).toHaveText([
    'Role',
    'Hours/week',
    '% of 40 h',
    'FTE',
  ]);
  for (const r of ROLE_HOURS) {
    await expect(perRole.locator(`tr[data-role="${r.roleId}"]`).getByRole('cell')).toHaveText([
      fmt('en', r.hours),
      pct('en', r.hours / 40),
      fmt('en', r.hours / 40, 2),
    ]);
  }
  // Switching the language reformats the numbers.
  await page.getByLabel('Language').selectOption('de');
  const roleDe = page
    .getByRole('tabpanel', { name: 'Auslastung' })
    .getByRole('table', { name: 'Pro Rolle' });
  await expect(roleDe.locator('tr[data-role="role-po"]').getByRole('cell').first()).toHaveText(
    fmt('de', ROLE_HOURS[0]!.hours),
  );
  await expect(roleDe.locator('tr[data-role="role-po"]').getByRole('cell').first()).toHaveText(
    '3,1',
  );
});

test('the person filter limits the person table and the warnings to that person', async ({
  page,
}) => {
  const panel = await openView(page, 'load');
  const people = panel.getByRole('table', { name: 'Per person' });
  await expect(people.locator('tbody tr')).toHaveCount(2);
  const all = panel.getByRole('region', { name: 'Warnings' }).getByRole('listitem');
  await expect(all).toHaveCount(ALEX.warnings.length + 1);
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Alex' });
  await expect(people.locator('tbody tr')).toHaveCount(1);
  await expect(people.locator('tr[data-person="person-alex"]').getByRole('cell')).toHaveText([
    fmt('en', ALEX.average),
    fmt('en', ALEX.fte, 2),
    `W${ALEX.peakWeek} (${fmt('en', ALEX.peakHours)} h)`,
  ]);
  const items = panel.getByRole('region', { name: 'Warnings' }).getByRole('listitem');
  await expect(items).toHaveCount(ALEX.warnings.length);
  for (const [i, [week, hours]] of ALEX.warnings.entries())
    await expect(items.nth(i)).toHaveText(`W${week}: Alex above average (${fmt('en', hours)} h)`);
  // The icon is generated by CSS, so it is not part of the text.
  await expect(items.first().locator('[aria-hidden]')).toHaveCount(0);
  // The tables follow the filter: Alex only holds the Product Owner role.
  const perRole = panel.getByRole('table', { name: 'Per role' });
  await expect(perRole.locator('tbody tr')).toHaveCount(1);
  await expect(perRole.locator('tr[data-role="role-po"]').getByRole('cell')).toHaveText([
    fmt('en', ALEX.roleHours),
    pct('en', ALEX.roleHours / 40),
    fmt('en', ALEX.roleHours / 40, 2),
  ]);
});

test('a person without meetings shows no peak week', async ({ page }) => {
  const panel = await openView(page, 'load');
  await page.getByRole('tab', { name: 'Workspace settings', exact: true }).click();
  const people = page.getByRole('region', { name: 'People' });
  await people.getByLabel('New person name').fill('Robin');
  await people.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('tab', { name: 'Load', exact: true }).click();
  const cells = panel.locator('tr[data-person]').filter({ hasText: 'Robin' }).getByRole('cell');
  await expect(cells).toHaveText([fmt('en', 0), fmt('en', 0, 2), '–']);
});

test('weeks above the FTE limit are listed as text', async ({ page }) => {
  const panel = await openView(page, 'load');
  await page.getByRole('tab', { name: 'Workspace settings', exact: true }).click();
  await page.getByLabel('Maximum FTE per person').fill('0.1');
  await page.getByRole('tab', { name: 'Load', exact: true }).click();
  const section = panel.getByRole('region', { name: 'Warnings' });
  await expect(
    section.getByText(/^W\d+: Alex above FTE limit \(\d+\.\d h\)$/).first(),
  ).toBeVisible();
  await expect(section.getByText(/Sam above FTE limit/).first()).toBeVisible();
});

test('without warnings the list says so', async ({ page }) => {
  const panel = await openView(page, 'load');
  await page.getByRole('tab', { name: 'Workspace settings', exact: true }).click();
  await page.getByLabel('Warning factor').fill('10');
  await page.getByRole('tab', { name: 'Load', exact: true }).click();
  const section = panel.getByRole('region', { name: 'Warnings' });
  await expect(section.getByText('No warnings')).toBeVisible();
  await expect(section.getByRole('listitem')).toHaveCount(0);
});

for (const view of ['weeks', 'load'] as const) {
  test(`no horizontal page scroll at 375 px (${view})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    const panel = await openView(page, view);
    await expect(panel.getByRole('table').first()).toBeVisible();
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(fits).toBe(true);
    const region = panel.getByRole('region').first();
    await expect(region).toHaveAttribute('tabindex', '0');
    if (view === 'weeks')
      expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  });
}

for (const lang of ['de', 'en'] as const) {
  for (const view of ['weeks', 'load'] as const) {
    test(`axe finds no violations in the ${view} view (${lang})`, async ({ page }) => {
      const panel = await openView(page, view, '2027-03-10', lang);
      await expect(panel.getByRole('table').first()).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
}
