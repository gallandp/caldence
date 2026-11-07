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
  await page.getByRole('button', { name: 'Open example' }).click();
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
  await page.getByRole('tab', { name: /^(Team|Team)$/, exact: true }).click();
  await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible();
}
