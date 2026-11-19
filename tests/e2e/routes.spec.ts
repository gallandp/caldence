import { expect, test, type Page } from '@playwright/test';
import { autosaved, currentUnit, openExample, pickUnit, showAreaPage, showView } from './helpers';

test.use({ locale: 'en-US' });

/** The view whose sidebar tab is selected. */
const activeTab = (page: Page) => page.locator('[role="tab"][aria-selected="true"]').first();
const pageButton = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Page' }).getByRole('button', { name });

test('back and forward walk through views, units and area pages (#401)', async ({ page }) => {
  await openExample(page);
  // The opening place is the first entry, replaced in place.
  await expect(page).toHaveURL(/#\/calendar\/team-alpha$/);
  const start = page.url();
  await showView(page, 'Meeting load');
  await expect(page).toHaveURL(/#\/load\/team-alpha$/);
  await pickUnit(page, 'Commerce');
  await expect(page).toHaveURL(/#\/load\/[^/]+$/);
  await page.locator('#tab-team').click();
  await expect(page).toHaveURL(/#\/team\/[^/]+\/overview$/);
  const overview = page.url();
  await showAreaPage(page, 'Structure');
  await expect(page).toHaveURL(/#\/team\/[^/]+\/structure$/);

  await page.goBack();
  await expect(page).toHaveURL(overview);
  await expect(pageButton(page, 'Overview')).toHaveAttribute('aria-pressed', 'true');

  await page.goBack();
  await expect(activeTab(page)).toHaveAttribute('id', 'tab-load');
  await expect(currentUnit(page)).toHaveText('Commerce');

  await page.goBack();
  await expect(activeTab(page)).toHaveAttribute('id', 'tab-load');
  await expect(currentUnit(page)).toHaveText('Team Alpha');

  await page.goBack();
  await expect(page).toHaveURL(start);
  await expect(activeTab(page)).toHaveAttribute('id', 'tab-calendar');

  for (let i = 0; i < 4; i++) await page.goForward();
  await expect(page).toHaveURL(/#\/team\/[^/]+\/structure$/);
  await expect(currentUnit(page)).toHaveText('Commerce');
  await expect(pageButton(page, 'Structure')).toHaveAttribute('aria-pressed', 'true');
});

test('a deep link opens its place, also after a reload, and a wrong one is corrected (#401)', async ({
  page,
}) => {
  await openExample(page);
  await pickUnit(page, 'Team Beta');
  await showView(page, 'Calendar');
  const beta = new URL(page.url()).hash.split('/')[2]!;
  await pickUnit(page, 'Team Alpha');
  await showView(page, 'Settings');
  await autosaved(page, '"page":"settings"');

  // The address wins over the place saved in the autosave.
  await page.goto(`/#/meetings/${beta}`);
  await page.reload();
  await expect(currentUnit(page)).toHaveText('Team Beta');
  await expect(activeTab(page)).toHaveAttribute('id', 'tab-meetings');

  // Without a unit the address keeps the saved one.
  await pickUnit(page, 'Team Alpha');
  await showView(page, 'Help');
  await autosaved(page, '"page":"help"');
  await page.goto('/#/calendar/nope');
  await page.reload();
  await expect(currentUnit(page)).toHaveText('Team Alpha');
  await expect(activeTab(page)).toHaveAttribute('id', 'tab-calendar');
  await expect(page).toHaveURL(/#\/calendar\/team-alpha$/);
  await pickUnit(page, 'Team Beta');

  // An unknown unit keeps the unit and corrects the address in place.
  const entries = await page.evaluate(() => history.length);
  await page.goto('/#/load/nope');
  await expect(activeTab(page)).toHaveAttribute('id', 'tab-load');
  await expect(currentUnit(page)).toHaveText('Team Beta');
  await expect(page).toHaveURL(new RegExp(`#/load/${beta}$`));
  expect(await page.evaluate(() => history.length)).toBe(entries + 1);
});
