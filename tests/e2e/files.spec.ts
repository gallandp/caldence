import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.use({ locale: 'en-US' });

test.beforeEach(async ({ page }) => {
  // Force the fallback path: no File System Access API.
  await page.addInitScript(() => {
    // @ts-expect-error removing optional browser APIs
    delete window.showOpenFilePicker;
    // @ts-expect-error removing optional browser APIs
    delete window.showSaveFilePicker;
  });
  page.on('dialog', (dialog) => void dialog.accept());
});

async function openExample(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open example' }).click();
  await expect(page.getByText('Unbenannt')).toBeVisible();
}

/** Changes the workspace through the language switch (a workspace setting). */
async function makeChange(page: Page) {
  await page.getByLabel(/Language|Sprache/).selectOption('en');
  await expect(page.getByText('● Unsaved changes')).toBeVisible();
}

async function storedTeams(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open('caldence', 1);
        req.onerror = () => resolve(-1);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('autosave')) return resolve(-1);
          const get = db.transaction('autosave').objectStore('autosave').get('current');
          get.onsuccess = () => {
            const v = get.result as { ws: { teams: unknown[] }; dirty: boolean } | undefined;
            resolve(v && v.dirty ? v.ws.teams.length : -1);
          };
          get.onerror = () => resolve(-1);
        };
      }),
  );
}

test('autosave restores data and the unsaved marker after reload', async ({ page }) => {
  await openExample(page);
  await makeChange(page);
  await expect.poll(() => storedTeams(page)).toBe(2);
  await page.reload();
  await expect(page.getByText('● Unsaved changes')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open example' })).toHaveCount(0);
});

test('save as downloads workspace.caldence.json and clears the marker', async ({ page }) => {
  await openExample(page);
  await makeChange(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as' }).click();
  expect((await download).suggestedFilename()).toBe('workspace.caldence.json');
  await expect(page.getByText('✓ Saved')).toBeVisible();
  await expect(page.getByText('workspace.caldence.json')).toBeVisible();
});

test('opening an invalid file shows an error and keeps the workspace', async ({ page }) => {
  await openExample(page);
  await makeChange(page);
  // Discard-free path: choose Save in the dialog is not wanted, so discard-free open needs a clean state.
  await page.getByRole('button', { name: 'Save as' }).click();
  await expect(page.getByText('✓ Saved')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{nope'),
  });
  await expect(page.getByRole('alert')).toHaveText('The file does not contain valid JSON');
  await expect(page.getByText('workspace.caldence.json')).toBeVisible();
  await expect(page.getByText('✓ Saved')).toBeVisible();
});

test('New while dirty asks first; cancel keeps the data; axe passes with the dialog open', async ({
  page,
}) => {
  await openExample(page);
  await makeChange(page);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Unsaved changes' });
  await expect(dialog).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('● Unsaved changes')).toBeVisible();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByText('● Unsaved changes')).toBeVisible();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await dialog.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('button', { name: 'Open example' })).toBeVisible();
});

test('Ctrl+S saves via the shortcut', async ({ page }) => {
  await openExample(page);
  await makeChange(page);
  const download = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+s');
  await download;
  await expect(page.getByText('✓ Saved')).toBeVisible();
});
