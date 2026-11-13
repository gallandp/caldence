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

/** Runs a team action from the sidebar: the actions sit behind the "Team actions" button. */
export async function teamAction(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible())) await page.getByRole('button', { name: 'Team actions' }).click();
  await button.click();
}

/** On narrow screens the views, language and appearance sit in a menu: open it if it is closed. */
export async function openMenuIfNarrow(page: Page) {
  const toggle = page.locator('.menu-toggle');
  // The menu button replaces the side bar below 60rem (960 px).
  if ((page.viewportSize()?.width ?? Infinity) > 960) return;
  // A click before the app has hydrated does nothing, so click until the menu reports open.
  await expect(async () => {
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 });
  }).toPass();
}
