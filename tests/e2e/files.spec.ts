import { readFileSync } from 'node:fs';
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
  // The example adopts the current UI language, so the UI stays English.
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText('Untitled')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open example' })).toHaveCount(0);
}

/** Two edits through the language switch (a workspace setting): de, then back to en. */
async function makeChange(page: Page) {
  await page.getByLabel(/Language|Sprache/).selectOption('de');
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

test('autosave restores the changed data and the unsaved marker after reload', async ({ page }) => {
  await openExample(page);
  await page.getByLabel('Language').selectOption('de');
  await expect.poll(() => storedTeams(page)).toBe(2);
  await page.reload();
  // The changed value (language de) survived, and so did the dirty flag and the example.
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByText('● Ungespeicherte Änderungen')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Beispiel öffnen' })).toHaveCount(0);
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
  // The example is still loaded and the earlier edits are still undoable.
  await expect(page.getByRole('button', { name: 'Open example' })).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByText('● Ungespeicherte Änderungen')).toBeVisible();
});

test('opening a template file with Open says to apply it in Templates', async ({ page }) => {
  await openExample(page);
  await page.getByLabel(/Language|Sprache/).selectOption('en');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'scrum.caldence-template.json',
    mimeType: 'application/json',
    buffer: readFileSync('src/data/templates/scrum.en.json'),
  });
  await expect(page.getByRole('alert')).toHaveText(
    'This is a template. Apply it in the Templates view.',
  );
  await expect(page.getByRole('button', { name: 'Open example' })).toHaveCount(0);
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
  await expect(page.getByRole('button', { name: 'New', exact: true })).toBeFocused();
  await expect(page.getByText('● Unsaved changes')).toBeVisible();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'New', exact: true })).toBeFocused();
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

test('Open while dirty: after Save in the dialog a refused open picker shows a hint, not a read error', async ({
  page,
}) => {
  // Picker APIs where the save works but the open picker has lost the user activation.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.showSaveFilePicker = async () => ({
      name: 'saved.caldence.json',
      getFile: async () => new File([''], 'saved.caldence.json'),
      createWritable: async () => ({ write: async () => {}, close: async () => {} }),
    });
    w.showOpenFilePicker = async () => {
      throw new DOMException('Must be handling a user gesture', 'SecurityError');
    };
  });
  await openExample(page);
  await makeChange(page);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Unsaved changes' })
    .getByRole('button', { name: 'Save' })
    .click();
  await expect(page.getByText('Saved. Press Open again to choose a file.')).toBeVisible();
  await expect(page.getByRole('alert')).toBeEmpty();
  await expect(page.getByText('saved.caldence.json')).toBeVisible();
  await expect(page.getByText('✓ Saved')).toBeVisible();
});
