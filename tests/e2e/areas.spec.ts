import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  currentUnit,
  openExample,
  pickUnit,
  teamAction,
  unitNames,
  useFileFallback,
} from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

async function addArea(page: Page, name: string, teams: string[]) {
  await teamAction(page, 'Add area');
  const dialog = page.getByRole('dialog', { name: 'Add area' });
  await dialog.getByLabel('Area name').fill(name);
  for (const team of teams) await dialog.getByRole('checkbox', { name: team }).check();
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test('an area groups teams in the switcher and is selected like a team', async ({ page }) => {
  await openExample(page);
  await addArea(page, 'Platform', ['Team Alpha']);
  await expect(currentUnit(page)).toHaveText('Platform');
  await expect(page.locator('.switcher .meta')).toHaveText('Area · 1 team');
  // Each area with its teams below it (the example's Commerce first), then the teams without one.
  await expect(unitNames(page)).toHaveText([
    'Commerce',
    'Team Gamma',
    'Team Delta',
    'Platform',
    'Team Alpha',
    'Team Beta',
  ]);
  await page.locator('.switcher .pick').click();
  await expect(
    page.locator('.switcher .list').getByRole('button', { name: /^Platform\W+area\W+1 team$/ }),
  ).toHaveAttribute('aria-current', 'true');
  await expect(page.getByText('No area', { exact: true })).toBeVisible();
  // Arrow keys move through the list, Escape closes it.
  await page.keyboard.press('ArrowDown');
  await expect(
    page.locator('.switcher .list').getByRole('button', { name: 'Team Alpha' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.switcher .list')).toBeHidden();
  await expect(page.locator('.switcher .pick')).toBeFocused();

  // A team in the area names it in the card; the area can be picked again from the list.
  await pickUnit(page, 'Team Alpha');
  await expect(page.locator('.switcher .meta')).toContainText('Platform ·');
  await pickUnit(page, 'Platform');
});

test('long area names wrap instead of being cut off', async ({ page }) => {
  const long = 'Platform Purchasing & Logistics North Europe Region';
  await openExample(page);
  await addArea(page, long, ['Team Alpha', 'Team Beta']);
  await pickUnit(page, 'Team Alpha');
  // The card names the area on up to two lines; the tooltip has the whole text.
  await expect(page.locator('.switcher .pick')).toHaveAttribute(
    'title',
    new RegExp(`^Team Alpha\\n${long.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · `),
  );
  // The meta line stops after two lines instead of growing the card.
  const meta = page.locator('.switcher .meta');
  expect(await meta.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.locator('.switcher .pick').click();
  const option = page.locator('.switcher .list .opt').filter({ hasText: long });
  const name = option.locator('.opt-name');
  await expect(name).toHaveText(long);
  // The whole name shows: nothing is clipped, and the count is only a number.
  expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect((await name.boundingBox())!.height).toBeGreaterThan(30);
  await expect(option.locator('.count [aria-hidden]')).toHaveText('2');
  await expect(option).toHaveAccessibleName(/2 teams$/);
  const side = page.locator('.sidebar');
  expect(await side.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('the views follow the area: Load sums its teams, the area page offers them', async ({
  page,
}) => {
  await openExample(page);
  await addArea(page, 'Platform', ['Team Alpha', 'Team Beta']);
  await page.getByRole('tab', { name: 'Meeting load', exact: true }).click();
  await expect(page.getByText(/^Hours in the teams of Platform/)).toBeVisible();

  // With an area selected the Team entry is the area's page; Structure lists the teams (#277).
  await page.getByRole('tab', { name: 'Area', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: 'Area' });
  await panel.getByRole('button', { name: 'Structure' }).click();
  await expect(panel.getByText(/People and roles are assigned per team/)).toBeVisible();
  await panel.getByRole('button', { name: 'Team Beta', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(currentUnit(page)).toHaveText('Team Beta');
  // The team view replaces the list of teams; focus moves to the panel instead of getting lost.
  await expect(page.locator('#panel-team')).toBeFocused();
  await expect(
    page.locator('#panel-team').getByRole('list', { name: 'Members of Team Beta' }),
  ).toBeVisible();
});

test('the headline names the selected area or team, except in workspace-wide views', async ({
  page,
}) => {
  await openExample(page);
  await addArea(page, 'Platform', ['Team Alpha']);
  await page.getByRole('tab', { name: 'Meeting load', exact: true }).click();
  const scope = page.locator('#panel-load .eyebrow-text');
  await expect(scope).toHaveText('Platform · Area');
  await expect(page.locator('#panel-load h2')).toHaveText('Meeting load');
  await pickUnit(page, 'Team Alpha');
  await expect(scope).toHaveText('Team Alpha · Team');
  for (const [tab, panel] of [
    ['Settings', 'settings'],
    ['Templates', 'templates'],
    ['Import / Export', 'exchange'],
    ['Help', 'help'],
  ]) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expect(page.locator(`#panel-${panel} .eyebrow`)).toHaveCount(0);
  }
});

test('rename an area, move a team into it after a question, delete it', async ({ page }) => {
  await openExample(page);
  await addArea(page, 'Platform', ['Team Alpha']);
  await addArea(page, 'Data', []);

  await teamAction(page, 'Rename area');
  const rename = page.getByRole('dialog', { name: 'Rename area' });
  await rename.getByLabel('Area name').fill('Insights');
  await rename.getByRole('button', { name: 'Apply' }).click();
  await expect(currentUnit(page)).toHaveText('Insights');

  await teamAction(page, 'Choose teams …');
  const choose = page.getByRole('dialog', { name: 'Teams in Insights' });
  await expect(choose.getByText('in Platform')).toBeVisible();
  await choose.getByRole('checkbox', { name: 'Team Alpha' }).check();
  await expect(choose.getByText('from Platform')).toBeVisible();
  await choose.getByRole('button', { name: 'Apply' }).click();
  const move = page.getByRole('dialog', { name: 'Move teams?' });
  await expect(move).toContainText('Moving to Insights: Team Alpha (was Platform).');
  // Cancel keeps the choice open; Apply asks again.
  await move.getByRole('button', { name: 'Cancel' }).click();
  await expect(choose.getByRole('checkbox', { name: 'Team Alpha' })).toBeChecked();
  await choose.getByRole('button', { name: 'Apply' }).click();
  await move.getByRole('button', { name: 'Move' }).click();
  await expect(unitNames(page)).toHaveText([
    'Commerce',
    'Team Gamma',
    'Team Delta',
    'Platform',
    'Insights',
    'Team Alpha',
    'Team Beta',
  ]);

  await teamAction(page, 'Delete area');
  const del = page.getByRole('dialog', { name: 'Delete Insights?' });
  await expect(del).toContainText('Its teams stay with everything in them');
  await del.getByRole('button', { name: 'Delete area' }).click();
  await expect(unitNames(page)).toHaveText([
    'Commerce',
    'Team Gamma',
    'Team Delta',
    'Platform',
    'Team Alpha',
    'Team Beta',
  ]);
  await page.keyboard.press('Control+z');
  await expect(unitNames(page)).toHaveText([
    'Commerce',
    'Team Gamma',
    'Team Delta',
    'Platform',
    'Insights',
    'Team Alpha',
    'Team Beta',
  ]);
});

test('the switcher works in the phone menu', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await openExample(page);
  await addArea(page, 'Platform', ['Team Beta']);
  await pickUnit(page, 'Team Beta');
  await expect(page.locator('.switcher .meta')).toContainText('Platform ·');
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`axe finds no violations in the open switcher and the area dialog (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openExample(page);
    await addArea(page, 'Platform', ['Team Alpha']);
    await page.locator('.switcher .pick').click();
    const list = await new AxeBuilder({ page }).include('.switcher').analyze();
    expect(list.violations).toEqual([]);
    await page.keyboard.press('Escape');
    await teamAction(page, 'Choose teams …');
    const dialog = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(dialog.violations).toEqual([]);
  });
}
