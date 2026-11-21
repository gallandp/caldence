import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  currentUnit,
  openExample,
  openWorkspaceFile,
  showView,
  teamAction,
  useFileFallback,
} from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

/** Picks the organisation, the top entry of the switcher's list (#313). */
async function pickOrg(page: import('@playwright/test').Page) {
  await page.locator('.switcher .pick').click();
  await page.locator('.switcher .list button.org').click();
  await expect(page.locator('.switcher .meta')).toHaveText('Organisation · 1 area');
}

test('the organisation sits above the areas and shows the whole tree', async ({ page }) => {
  await openExample(page);
  await pickOrg(page);
  await expect(currentUnit(page)).toHaveText('Organisation');
  // The organisation plans meetings of its own (#328).
  await expect(page.getByRole('tab', { name: 'Meetings & cadence' })).toHaveCount(1);
  await showView(page, 'Organisation');
  const tree = page.getByRole('list', { name: 'Structure of Organisation' });
  await expect(tree.locator('.node.root')).toContainText('1 area · 4 teams · 6 people');
  await expect(tree.locator('button.node.area')).toHaveText(/Commerce/);
  await expect(tree.locator('button.node.team .title')).toHaveText([
    'Team Gamma',
    'Team Delta',
    'Team Alpha',
    'Team Beta',
  ]);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  // A card opens its unit.
  await tree.locator('button.node.area').click();
  await expect(currentUnit(page)).toHaveText('Commerce');
  await expect(page.getByRole('heading', { level: 2 })).toContainText('Commerce');
});

test('the organisation is renamed, and an empty name gives the level word back', async ({
  page,
}) => {
  await openExample(page);
  await pickOrg(page);
  await teamAction(page, 'Rename organisation');
  const dialog = page.getByRole('dialog', { name: 'Rename organisation' });
  await dialog.getByLabel('Organisation name').fill('Nordwind GmbH');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(currentUnit(page)).toHaveText('Nordwind GmbH');

  // An empty name gives the level's word back.
  await teamAction(page, 'Rename organisation');
  await dialog.getByLabel('Organisation name').fill('');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(currentUnit(page)).toHaveText('Organisation');
});

test('calendar and load show every team and area for the organisation', async ({ page }) => {
  await openExample(page);
  await pickOrg(page);
  await showView(page, 'Calendar');
  const unit = page.getByLabel('Area or team');
  await expect(unit).toHaveValue('');
  // Meetings of teams outside the area and of the area itself are both in the calendar.
  await expect(page.locator('#panel-calendar').getByText('PO Forum').first()).toBeVisible();
  await expect(page.locator('#panel-calendar').getByText('Weekly Sync').first()).toBeVisible();
  await unit.selectOption({ label: 'Team Alpha' });
  await expect(page.locator('#panel-calendar').getByText('PO Forum')).toHaveCount(0);
  await showView(page, 'Meeting load');
  await expect(page.locator('#panel-load')).toBeVisible();
});

test('the organisation shows alignment and cost per team, also without an area (#450)', async ({
  page,
}) => {
  await openExample(page);
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  const rate = page.getByLabel('Hourly rate (optional)');
  await rate.fill('100');
  await rate.press('Enter');
  await pickOrg(page);
  await showView(page, 'Organisation');
  const summary = page.locator('[data-area-overview]');

  // Every team is compared with the cadence most of them share; those without an area too.
  const kpi = summary.locator('[data-kpi="cadence"]');
  // Team Gamma fits Commerce's PI; Team Alpha, without an area, starts on Thursday.
  await expect(kpi.locator('b')).toHaveText('3 of 4');
  await expect(kpi.locator('.tag')).toHaveText('Differ: Team Alpha');
  await expect(summary.locator('.lead')).toHaveText(
    'Teams whose area has a cadence of its own are compared with it, all others with the cadence of Team Beta, which most teams share',
  );
  // The key figures come before the tree, the cost table after it.
  const order = await page.evaluate(() =>
    ['.kpis', '.tree', '[data-area-costs]'].map(
      (s) => document.querySelector(s)!.getBoundingClientRect().top,
    ),
  );
  expect(order).toEqual([...order].sort((a, b) => a - b));

  // One row per team and one for the area's own meetings; the organisation has none of its own.
  const costs = summary.locator('[data-area-costs]');
  for (const id of ['team-gamma', 'team-delta', 'team-alpha', 'team-beta', 'area-commerce'])
    await expect(costs.locator(`[data-cost-row="${id}"]`)).toHaveCount(1);
  await expect(costs.locator('[data-cost-row="@organisation"]')).toHaveCount(0);
  await expect(costs.locator('[data-area-share]')).toHaveCount(0);
  // Teams are grouped under their area with its own meetings; teams without one come last (#467).
  await expect(costs.locator('tbody th[scope="rowgroup"]')).toHaveText(['Commerce', 'No area']);
  expect(
    await costs
      .locator('tbody tr[data-cost-row]')
      .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-cost-row'))),
  ).toEqual(['team-gamma', 'team-delta', 'area-commerce', 'team-alpha', 'team-beta']);
  // Under its heading the area's own row does not repeat the area's name.
  await expect(costs.locator('[data-cost-row="area-commerce"] button.link')).toHaveText(
    'Meetings in the area',
  );
  const week = (await costs.locator('[data-cost-total] .cost').textContent())!.trim();
  await expect(summary.locator('[data-kpi="cost"] b')).toHaveText(week);
  await costs.getByRole('button', { name: 'In the planning horizon' }).click();
  const horizon = (await costs.locator('[data-cost-total] .cost').textContent())!.trim();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  // The totals are the cost in Meeting load for the whole organisation.
  await showView(page, 'Meeting load');
  await expect(page.locator('[data-costs] [data-cost-week] .value')).toHaveText(week);
  await expect(page.locator('[data-costs] [data-cost-horizon] .value')).toHaveText(horizon);

  // A team row opens the team's meetings.
  await showView(page, 'Organisation');
  await costs.locator('[data-cost-row="team-alpha"] button.link').click();
  await expect(currentUnit(page)).toHaveText('Team Alpha');
});

test('the organisation summary fits a phone and prints (#450)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openExample(page);
  await pickOrg(page);
  await showView(page, 'Organisation');
  const summary = page.locator('[data-area-overview]');
  await expect(summary.locator('[data-kpi="cadence"]')).toBeVisible();
  await expect(summary.locator('[data-area-costs]')).toBeVisible();
  await expect(
    summary.locator('[data-area-costs] th[scope="rowgroup"]', { hasText: 'Commerce' }),
  ).toBeVisible();
  // Without an hourly rate the third figure is the time in all meetings, as in the table.
  await expect(summary.locator('[data-kpi="time"] b')).toHaveText(
    (await summary.locator('[data-cost-total] td.num').first().textContent())!.trim(),
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.emulateMedia({ media: 'print' });
  await expect(summary.locator('[data-kpi="cadence"]')).toBeVisible();
  await expect(summary.locator('[data-cost-total]')).toBeVisible();
  await expect(summary.locator('[data-area-costs] th[scope="rowgroup"]').first()).toBeVisible();
});

test("the organisation's own meetings close the cost table, in no area's group (#467)", async ({
  page,
}) => {
  await page.goto('/');
  const ws = JSON.parse(readFileSync('src/data/examples/example.caldence.json', 'utf8'));
  ws.settings.locale = 'en';
  ws.organisation = {
    events: [{ ...ws.areas[0].events[0], id: 'ev-sync', name: 'Portfolio Sync' }],
  };
  await openWorkspaceFile(page, ws);
  await pickOrg(page);
  await showView(page, 'Organisation');
  const costs = page.locator('[data-area-costs]');
  const org = costs.locator('tbody:has([data-cost-row="@organisation"])');
  await expect(org.locator('tr')).toHaveCount(1);
  await expect(org.locator('th[scope="rowgroup"]')).toHaveCount(0);
  await expect(costs.locator('tbody').last()).toHaveText(/Portfolio Sync/);
});
