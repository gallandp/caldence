import { expect, test } from '@playwright/test';
import { areaWorkspace } from './area-fixture';
import { currentUnit, openWorkspaceFile, pickUnit, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
  await page.clock.setFixedTime(new Date('2027-01-05T10:00:00'));
});

function workspace(view?: unknown) {
  const ws = areaWorkspace() as Record<string, unknown> & { settings: { locale: string } };
  ws.settings.locale = 'en';
  if (view !== undefined) ws.view = view;
  return ws;
}

const selectedTab = (page: import('@playwright/test').Page) =>
  page.getByRole('tablist', { name: 'Views' }).getByRole('tab', { selected: true });

test('a file opens on the unit, view and area page it was saved with', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openWorkspaceFile(
    page,
    workspace({ unit: 'area-payments', page: 'team', areaPage: 'overview' }),
  );
  await expect(currentUnit(page)).toHaveText('Payments');
  await expect(selectedTab(page)).toHaveText('Area');
  await expect(page.locator('[data-area-overview]')).toBeVisible();
});

test('unknown or malformed saved values are ignored; the file still opens', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openWorkspaceFile(
    page,
    workspace({ unit: 'area-payments', page: 'load' }),
    'a.caldence.json',
  );
  await expect(selectedTab(page)).toHaveText('Meeting load');
  await openWorkspaceFile(
    page,
    workspace({ unit: 'gone', page: 'nowhere', areaPage: 5 }),
    'b.caldence.json',
  );
  // The page stays where it was; the unknown unit is not selected.
  await expect(selectedTab(page)).toHaveText('Meeting load');
  await expect(currentUnit(page)).not.toHaveText('gone');
});

test('a reload comes back to the area overview', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openWorkspaceFile(page, workspace());
  await pickUnit(page, 'Payments');
  await page.getByRole('tab', { name: 'Area', exact: true }).click();
  await page.getByRole('group', { name: 'Page' }).getByRole('button', { name: 'Overview' }).click();
  await expect(page.locator('[data-area-overview]')).toBeVisible();
  // Give the debounced autosave time to write.
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.locator('[data-area-overview]')).toBeVisible();
});

test('on a phone a saved menu page opens too', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  // The start page offers to open a file; on a phone the file bar keeps Open in its menu.
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a file…' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'phone.caldence.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(workspace({ page: 'settings' }))),
  });
  await expect(page.locator('#panel-settings')).toBeVisible();
});

test('saving writes where the app is looking, and a reload comes back there', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openWorkspaceFile(page, workspace());
  await pickUnit(page, 'Payments');
  await page.getByRole('tab', { name: 'Meeting load', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as' }).click();
  const path = await (await download).path();
  const saved = JSON.parse((await import('node:fs')).readFileSync(path, 'utf8'));
  expect(saved.view).toEqual({ unit: 'area-payments', page: 'load', areaPage: 'structure' });
  // Choosing another view is not a change of the plan: the file stays saved.
  await page.getByRole('tab', { name: 'Meetings & cadence', exact: true }).click();
  await expect(page.getByText('✓ Saved')).toBeVisible();
  // The autosave follows the view, so a reload opens where the app was.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const text = JSON.stringify(
          await new Promise((resolve) => {
            const req = indexedDB.open('caldence-v2');
            req.onsuccess = () => {
              const db = req.result;
              const names = [...db.objectStoreNames];
              const tx = db.transaction(names, 'readonly');
              const all = tx.objectStore(names[0]!).getAll();
              all.onsuccess = () => resolve(all.result);
            };
            req.onerror = () => resolve(null);
          }),
        );
        return text.includes('"page":"meetings"');
      }),
    )
    .toBe(true);
  await page.reload();
  await expect(currentUnit(page)).toHaveText('Payments');
  await expect(selectedTab(page)).toHaveText(/Meetings/);
});
