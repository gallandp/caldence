import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { areaWorkspace } from './area-fixture';
import {
  currentUnit,
  openMenuIfNarrow,
  openWorkspaceFile,
  pickUnit,
  useFileFallback,
} from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
  // The overview starts in the current week; pin it to the first week of the example horizon.
  await page.clock.setFixedTime(new Date('2027-01-05T10:00:00'));
});

async function openOverview(page: Page) {
  await page.goto('/');
  const ws = areaWorkspace();
  ws.settings.locale = 'en';
  await openWorkspaceFile(page, ws);
  await pickUnit(page, 'Payments');
  await openMenuIfNarrow(page);
  await page.getByRole('tab', { name: 'Team', exact: true }).click();
  const overview = page.locator('[data-area-overview]');
  await expect(overview).toBeVisible();
  return overview;
}

test('the area overview compares cadences, shows load and the area steering', async ({ page }) => {
  const overview = await openOverview(page);
  await expect(overview.locator('.lead')).toContainText('4 teams · 8 people');
  await expect(overview.locator('.lead')).toContainText('Cadence: PI, 10 weeks');

  // Gamma's 3-week sprints and Delta's Wednesday start are out of step.
  const kpi = overview.locator('[data-kpi="cadence"]');
  await expect(kpi.locator('b')).toHaveText('2 of 4');
  await expect(kpi.locator('.tag')).toHaveText('Out of step: Team Gamma and Team Delta');
  const cadence = overview.locator('[data-cadence]');
  await expect(cadence.locator('[data-team-row="team-alpha"]')).toContainText('in step');
  await expect(cadence.locator('[data-team-row="team-gamma"]')).toContainText(
    '3-week periods do not fit into 10 weeks',
  );
  await expect(cadence.locator('[data-team-row="team-delta"]')).toContainText(
    'starts on Wednesday',
  );
  await expect(cadence.locator('.seg.area')).toHaveText([
    /^PI 1, 01\/04\/2027 to 03\/14\/2027$/,
    /^PI 2, /,
  ]);

  // One row of twelve week cells per team.
  const load = overview.locator('[data-load]');
  await expect(load.locator('tbody tr')).toHaveCount(4);
  await expect(load.locator('tr[data-team="team-alpha"] button')).toHaveCount(12);

  // Steering: area roles with hours, and area meetings with "every team" chips.
  const roles = overview.locator('[data-area-roles]');
  await expect(roles).toContainText('Ruth');
  await expect(roles).toContainText('Head of area · 32.0 h in the area');
  await expect(roles.locator('li', { hasText: 'Pia' })).toContainText('0 h · set hours');
  const forum = overview.locator('[data-meeting="ev-po-forum"]');
  await expect(forum).toContainText('Product Owner · every team (3)');
  // Ruth, Pia (area PO) and the three team POs: 5 h a week.
  await expect(forum.locator('td.num')).toHaveText('5.0');
  // Only Team Beta has developers.
  await expect(overview.locator('[data-meeting="ev-planning"] .missing')).toHaveCount(3);
  await expect(overview.locator('[data-kpi="area"] b')).toHaveText('6.5 h');
});

test('a load cell opens Load for that team and week', async ({ page }) => {
  const overview = await openOverview(page);
  const cell = overview.locator('tr[data-team="team-beta"] button[data-week="2027-01-11"]');
  await expect(cell).toHaveAccessibleName(/^Team Beta, W2: \d+% in meetings/);
  await cell.click();
  await expect(page.getByRole('tab', { name: 'Load', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(currentUnit(page)).toHaveText('Team Beta');
  const focus = page.locator('[data-week-focus="2027-01-11"]');
  await expect(focus.getByRole('heading')).toHaveText('W2 · Team Beta');
  await expect(focus.locator('tbody tr')).toHaveCount(2);
  await focus.getByRole('button', { name: 'Close week' }).click();
  await expect(focus).toBeHidden();
});

test('an area meeting opens in Meetings & cadence', async ({ page }) => {
  const overview = await openOverview(page);
  await overview.getByRole('button', { name: 'Open PO forum in Meetings & cadence' }).click();
  await expect(page.getByRole('tab', { name: 'Meetings & cadence' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(currentUnit(page)).toHaveText('Payments');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('PO forum');
});

test('phones show the area meetings as cards', async ({ page }) => {
  const overview = await openOverview(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const row = overview.locator('[data-meeting="ev-po-forum"]');
  await expect(row).toHaveCSS('display', 'grid');
  await expect(overview.locator('.meetings thead')).toHaveCSS('position', 'absolute');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`axe finds no violations in the area overview (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openOverview(page);
    const result = await new AxeBuilder({ page }).include('[data-area-overview]').analyze();
    expect(result.violations).toEqual([]);
  });
}
