import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { demandWorkspace } from './demand-fixture';
import { currentUnit, openWorkspaceFile, pickUnit, showView, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

/**
 * Team Delta (Commerce) asks for 2 FTE: Robin 0.1 FTE (4 h, below the 3.25 h of meetings plus
 * margin, so under the Mindestzusage) and Jordan 0.5 FTE. Team Gamma asks for 1 FTE, nobody
 * committed. Teams Alpha and Beta are in no area and ask for nothing.
 */
function workspace() {
  const ws = demandWorkspace();
  const delta = ws.teams.find((t: { id: string }) => t.id === 'team-delta');
  delta.memberHours['person-robin'] = 4;
  ws.assignments[0].fte = 0.1;
  const gamma = ws.teams.find((t: { id: string }) => t.id === 'team-gamma');
  gamma.demands = [{ id: 'd1', fte: 1, roleId: 'role-dev' }];
  return ws;
}

async function openOrgOverview(page: Page) {
  await page.goto('/');
  await openWorkspaceFile(page, workspace());
  await page.locator('.switcher .pick').click();
  await page.locator('.switcher .list button.org').click();
  await showView(page, 'Organisation');
  await page.getByRole('group', { name: 'Page' }).getByRole('button', { name: 'Overview' }).click();
  return page.locator('[data-staffing-map]');
}

test('the organisation overview shows the staffing map with counts, never people', async ({
  page,
}) => {
  const map = await openOrgOverview(page);
  await expect(map.getByRole('heading', { name: 'Staffing' })).toBeVisible();
  await expect(map.locator('[data-map-tile="full"]')).toContainText('0 of 2');
  await expect(map.locator('[data-map-tile="demand"]')).toContainText('3.0 · 0.6 FTE');
  await expect(map.locator('[data-map-tile="demand"]')).toContainText('2.4 FTE open');

  // One row per platform; the teams in no area come last. Rows start closed.
  const commerce = map.locator('[data-platform="area-commerce"]');
  await expect(commerce).toContainText('2 teams · 0.6 of 3.0 FTE');
  await expect(commerce).toContainText('2 open');
  await expect(commerce).toContainText('1 under minimum commitment');
  await expect(map.locator('button.product')).toHaveCount(0);
  await map.getByRole('button', { name: 'Expand all' }).click();
  const delta = map.locator('[data-product="team-delta"]');
  await expect(delta).toContainText('1.4 FTE open');
  await expect(delta).toContainText('1 under minimum commitment');
  await expect(delta.getByRole('img', { name: '30% of the demand committed' })).toBeVisible();
  await expect(map.locator('[data-product="team-alpha"]')).toContainText('no demand');
  // No names of line staff on the map.
  await expect(map).not.toContainText('Robin');
  await expect(map).not.toContainText('Jordan');

  const results = await new AxeBuilder({ page })
    .include('[data-staffing-map]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  // Filters: the status dims products inside an open platform and hides platforms without match.
  await map
    .getByRole('group', { name: 'Status' })
    .getByRole('button', { name: 'With hint' })
    .click();
  await expect(delta).not.toHaveClass(/dim/);
  await expect(map.locator('[data-product="team-gamma"]')).toHaveClass(/dim/);
  await expect(map.getByText('1 area hidden by the filter.')).toBeVisible();
  await map.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'All' }).click();
  await map.getByRole('searchbox').fill('gamma');
  await expect(map.locator('[data-product="team-gamma"]')).not.toHaveClass(/dim/);
  await expect(delta).toHaveClass(/dim/);
  await map.getByRole('searchbox').fill('Ledgerline');
  await expect(map.getByText('No teams match the filter.')).toBeVisible();
  await map.getByRole('searchbox').fill('');
  await map
    .getByRole('group', { name: 'Skill family' })
    .getByRole('button', { name: 'Ledgerline' })
    .click();
  await expect(map.locator('[data-platform]')).toHaveCount(1);

  // A tile opens the product's page.
  await delta.click();
  await expect(currentUnit(page)).toHaveText('Team Delta');
});

test("an area's overview shows the map of its products", async ({ page }) => {
  await page.goto('/');
  await openWorkspaceFile(page, workspace());
  await pickUnit(page, 'Commerce');
  await showView(page, 'Area');
  await page.getByRole('group', { name: 'Page' }).getByRole('button', { name: 'Overview' }).click();
  const map = page.locator('[data-staffing-map]');
  await expect(map.locator('[data-map-tile="full"]')).toContainText('0 of 2');
  // One platform: always open, no skill family filter, no expand.
  await expect(map.locator('button.product')).toHaveCount(2);
  await expect(map.getByRole('group', { name: 'Skill family' })).toHaveCount(0);
  await expect(map.getByRole('button', { name: 'Expand all' })).toHaveCount(0);
});

test('a file without demands shows no staffing map', async ({ page }) => {
  await page.goto('/');
  const ws = workspace();
  for (const t of ws.teams) delete t.demands;
  ws.assignments = [];
  await openWorkspaceFile(page, ws);
  await page.locator('.switcher .pick').click();
  await page.locator('.switcher .list button.org').click();
  await showView(page, 'Organisation');
  await page.getByRole('group', { name: 'Page' }).getByRole('button', { name: 'Overview' }).click();
  await expect(page.getByText('Meeting time per typical week')).toBeVisible();
  await expect(page.locator('[data-staffing-map]')).toHaveCount(0);
});
