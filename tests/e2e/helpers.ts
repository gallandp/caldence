import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/** Removes the File System Access API so the download/upload fallback is used. */
export async function useFileFallback(page: Page) {
  await page.addInitScript(() => {
    // @ts-expect-error removing optional browser APIs
    delete window.showOpenFilePicker;
    // @ts-expect-error removing optional browser APIs
    delete window.showSaveFilePicker;
  });
}

export async function openExample(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open the example' }).click();
  await expect(page.getByText('Untitled')).toBeVisible();
}

/** Opens a workspace from the unit-test fixture (one team with a used assumption and cycle). */
export async function openFixture(page: Page) {
  const ws = JSON.parse(readFileSync('tests/fixtures/valid-workspace.json', 'utf8'));
  ws.settings.locale = 'en';
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'fixture.caldence.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ws)),
  });
  await expect(page.getByText('fixture.caldence.json')).toBeVisible();
}

export async function openTeamView(page: Page) {
  await page.getByRole('tab', { name: 'Team', exact: true }).click();
  await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible();
}

/** Unfolds the workspace-wide people and roles on the Team view (folded by default, #231). */
export async function openPeoplePool(page: Page) {
  const pool = page.locator('details.pool');
  if (!(await pool.evaluate((d: HTMLDetailsElement) => d.open)))
    await pool.locator('summary').click();
}

/** Opens `ws` through the file input (fallback path) and waits for its name in the bar. */
export async function openWorkspaceFile(page: Page, ws: unknown, name = 'test.caldence.json') {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ws)),
  });
  await expect(page.getByText(name)).toBeVisible();
}

/** The name of the selected team or area in the sidebar switcher. */
export const currentUnit = (page: Page) => page.locator('.switcher .pick .label');
/** The names of all teams and areas in the switcher's list (also while it is closed). */
export const unitNames = (page: Page) => page.locator('.switcher .list .opt-name');

/** Selects a team or an area in the sidebar switcher. */
export async function pickUnit(page: Page, name: string) {
  await page.locator('.switcher .pick').click();
  // An area's button also names its level and team count ("Platform, area, 2 teams").
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page
    .locator('.switcher .list')
    .getByRole('button', { name: new RegExp(`^${escaped}(\\W+\\w+\\W+\\d+ \\w+)?$`) })
    .click();
  await expect(currentUnit(page)).toHaveText(name);
}

/** Runs a team action from the sidebar: the actions sit behind the "Team actions" button. */
export async function teamAction(page: Page, name: string) {
  // Only the switcher's own button: an area page shows some of the same actions.
  const button = page.locator('.switcher').getByRole('button', { name, exact: true });
  if (!(await button.isVisible())) await page.getByRole('button', { name: 'Team actions' }).click();
  await button.click();
}

/** Deletes the selected team or area until no team is left (areas go first when selected). */
export async function deleteAllUnits(page: Page) {
  while ((await page.locator('.switcher .pick').count()) > 0) {
    const area = /^Area ·/.test((await page.locator('.switcher .meta').textContent()) ?? '');
    const action = area ? 'Delete area' : 'Delete team';
    await teamAction(page, action);
    await page
      .getByRole('dialog', { name: /^Delete / })
      .getByRole('button', { name: action })
      .click();
    await expect(page.getByRole('dialog', { name: /^Delete / })).toBeHidden();
  }
}

/** Tab bar labels that are shorter than the view's name. */
const TAB_LABEL: Record<string, string> = {
  'Meetings & cadence': 'Meetings',
  'Termine & Takt': 'Termine',
};

/**
 * Shows a view the way the screen offers it: the sidebar tab, the tab in the menu (below 960 px),
 * or on phones (640 px and below) the bottom tab bar or the file bar's "…" menu.
 */
export async function showView(page: Page, name: string) {
  if ((page.viewportSize()?.width ?? Infinity) > 640) {
    await openMenuIfNarrow(page);
    await page.getByRole('tab', { name, exact: true }).click();
    return;
  }
  const tab = page
    .locator('nav.tabbar')
    .getByRole('button', { name: TAB_LABEL[name] ?? name, exact: true });
  if ((await tab.count()) > 0) return tab.click();
  const more = page.locator('.content > .bar button.more');
  // A click before the app has hydrated does nothing, so click until the menu reports open.
  await expect(async () => {
    if ((await more.getAttribute('aria-expanded')) === 'false') await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 });
  }).toPass();
  await page.locator('.more-panel').getByRole('button', { name, exact: true }).click();
}

/** On narrow screens the views sit in a menu: open it if it is closed. */
export async function openMenuIfNarrow(page: Page) {
  const toggle = page.locator('.menu-toggle');
  // The menu button replaces the side bar below 60rem (960 px); on phones the tab bar replaces it.
  const width = page.viewportSize()?.width ?? Infinity;
  if (width > 960 || width <= 640) return;
  // A click before the app has hydrated does nothing, so click until the menu reports open.
  await expect(async () => {
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 });
  }).toPass();
}

/**
 * Switches the UI language in Settings (the only place it lives) and returns to the view that was
 * open before. On narrow screens the views menu is left open.
 */
export async function setLanguage(page: Page, locale: 'de' | 'en') {
  const before = await page.locator('[role="tab"][aria-selected="true"]').getAttribute('id');
  // Phones hide the view list behind the tab bar and the "…" menu, whose labels are translated:
  // the hidden view tabs still switch views when clicked from script.
  const phone = (page.viewportSize()?.width ?? Infinity) <= 640;
  const open = (id: string) =>
    phone ? page.locator(`#${id}`).dispatchEvent('click') : page.locator(`#${id}`).click();
  await openMenuIfNarrow(page);
  await open('tab-settings');
  await page
    .locator('#panel-settings')
    .getByLabel(/Language|Sprache/)
    .selectOption(locale);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  if (before && before !== 'tab-settings') {
    await openMenuIfNarrow(page);
    await open(before);
  }
  // On narrow screens the menu stays open, as it was when the switch sat in it.
  await openMenuIfNarrow(page);
}
