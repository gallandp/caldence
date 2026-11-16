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
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible())) await page.getByRole('button', { name: 'Team actions' }).click();
  await button.click();
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

/**
 * Picks the UI language in the sidebar. Phones do not show the sidebar's language switch, so the
 * window is widened for the pick and narrowed again.
 */
export async function setLanguage(page: Page, lang: string) {
  const size = page.viewportSize();
  const phone = size !== null && size.width <= 640;
  if (phone) await page.setViewportSize({ width: 1280, height: size.height });
  await openMenuIfNarrow(page);
  await page.getByLabel(/Language|Sprache/).selectOption(lang);
  if (phone) await page.setViewportSize(size);
}

/** On narrow screens the views, language and appearance sit in a menu: open it if it is closed. */
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
