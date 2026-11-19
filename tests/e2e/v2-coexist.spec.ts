import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Caldence 2 runs next to 1.x on the same origin (#344): it keeps its own database and only
// reads the 1.x autosave once, without ever writing or creating the 1.x database.

test.use({ locale: 'en-US' });

const ws = JSON.parse(readFileSync('tests/fixtures/valid-workspace.json', 'utf8'));
ws.settings.locale = 'en';

test('a first start does not create the 1.x database', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  await expect
    .poll(() => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name)))
    .toContain('caldence-v2');
  expect(
    await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name)),
  ).not.toContain('caldence');
});

test('the 1.x autosave is taken over once and stays unchanged', async ({ page }) => {
  await page.goto('/');
  const stored = { ws, fileName: 'plan.caldence.json', dirty: false };
  // Act as 1.x: write its autosave, and drop the one of Caldence 2.
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('caldence', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('autosave');
      req.onsuccess = () => {
        const tx = req.result.transaction('autosave', 'readwrite');
        tx.objectStore('autosave').put(value, 'current');
        tx.oncomplete = () => {
          req.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const del = indexedDB.deleteDatabase('caldence-v2');
      del.onsuccess = del.onerror = del.onblocked = () => resolve();
    });
  }, stored);
  await page.reload();
  await expect(page.getByText('plan-v2.caldence.json')).toBeVisible();
  const legacy = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('caldence');
        req.onsuccess = () => {
          const get = req.result.transaction('autosave').objectStore('autosave').get('current');
          get.onsuccess = () => {
            req.result.close();
            resolve(get.result);
          };
        };
      }),
  );
  expect(legacy).toEqual(stored);
});
