import { expect, test } from '@playwright/test';
import { areaWorkspace } from './area-fixture';
import {
  autosaved,
  currentUnit,
  openWorkspaceFile,
  pickUnit,
  setLanguage,
  showView,
  useFileFallback,
} from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
  await page.clock.setFixedTime(new Date('2027-01-05T10:00:00'));
});

function workspace(view?: unknown, locale = 'en') {
  const ws = areaWorkspace() as Record<string, unknown> & { settings: { locale: string } };
  ws.settings.locale = locale;
  if (view !== undefined) ws.view = view;
  return ws;
}

/** The workspace without its area: a file of teams only. */
function teamsOnly(view?: unknown) {
  const ws = workspace(view);
  ws.areas = [];
  return ws;
}

const selectedTab = (page: import('@playwright/test').Page) =>
  page.getByRole('tablist', { name: 'Views' }).getByRole('tab', { selected: true });
const pageSwitch = (page: import('@playwright/test').Page) =>
  page.getByRole('group', { name: 'Page' });

test('a file saved on Settings opens on the first area overview', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openWorkspaceFile(
    page,
    workspace({ unit: 'team-beta', page: 'settings', areaPage: 'structure' }),
  );
  await expect(currentUnit(page)).toHaveText('Payments');
  await expect(selectedTab(page)).toHaveText('Area');
  await expect(page.locator('[data-area-overview]')).toBeVisible();
  await expect(pageSwitch(page).getByRole('button', { name: 'Overview' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('a file without an area opens on the Calendar, never on an editor', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  for (const [i, saved] of ['templates', 'exchange', 'settings', 'nowhere'].entries()) {
    await openWorkspaceFile(
      page,
      teamsOnly({ unit: 'team-beta', page: saved }),
      `${i}.caldence.json`,
    );
    await expect(selectedTab(page)).toHaveText('Calendar');
    await expect(currentUnit(page)).toHaveText('Team Beta');
  }
});

test('on a phone a file saved on a menu page opens on the area overview', async ({ page }) => {
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
  await expect(page.locator('[data-area-overview]')).toBeVisible();
  await expect(page.locator('#panel-settings')).toBeHidden();
});

test('another area opens on its overview; the shown page stays while it is selected', async ({
  page,
}) => {
  const ws = workspace() as ReturnType<typeof workspace> & {
    areas: { id: string; name: string }[];
  };
  ws.areas.push({
    ...structuredClone(ws.areas[0]!),
    id: 'area-cards',
    name: 'Cards',
    teamIds: [],
  } as never);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openWorkspaceFile(page, ws);
  await pageSwitch(page).getByRole('button', { name: 'Structure' }).click();
  await showView(page, 'Calendar');
  await showView(page, 'Area');
  await expect(pageSwitch(page).getByRole('button', { name: 'Structure' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await pickUnit(page, 'Cards');
  await expect(page.locator('[data-area-overview]')).toBeVisible();
});

test('a reload comes back to the view; the area page on its overview', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openWorkspaceFile(page, workspace());
  await pickUnit(page, 'Team Beta');
  await showView(page, 'Settings');
  await autosaved(page, '"page":"settings"');
  await page.reload();
  await expect(currentUnit(page)).toHaveText('Team Beta');
  await expect(page.locator('#panel-settings')).toBeVisible();

  await pickUnit(page, 'Payments');
  await showView(page, 'Area');
  await pageSwitch(page).getByRole('button', { name: 'Structure' }).click();
  await autosaved(page, '"areaPage":"structure"');
  // The address names the page, so a reload stays there (#401) ...
  await page.reload();
  await expect(currentUnit(page)).toHaveText('Payments');
  await expect(pageSwitch(page).getByRole('button', { name: 'Structure' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // ... and opening the app without one shows the area on its overview.
  await page.goto('/');
  await page.reload();
  await expect(currentUnit(page)).toHaveText('Payments');
  await expect(page.locator('[data-area-overview]')).toBeVisible();
});

test('saving writes where the app is looking; choosing a view keeps the file saved', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openWorkspaceFile(page, workspace());
  await page.getByRole('tab', { name: 'Meeting load', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as' }).click();
  const path = await (await download).path();
  const saved = JSON.parse((await import('node:fs')).readFileSync(path, 'utf8'));
  expect(saved.view).toEqual({ unit: 'area-payments', page: 'load', areaPage: 'overview' });
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

test('the language is this browser’s: switching it does not change the file', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  // The file's language is the default while the browser has none.
  await openWorkspaceFile(page, workspace(undefined, 'de'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await setLanguage(page, 'en');
  await expect(page.getByText('✓ Saved')).toBeVisible();
  // Saved, the file keeps its own language.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as' }).click();
  const path = await (await download).path();
  const saved = JSON.parse((await import('node:fs')).readFileSync(path, 'utf8'));
  expect(saved.settings.locale).toBe('de');
  // The browser's choice wins over another file's language and lasts a reload.
  await openWorkspaceFile(page, workspace(undefined, 'de'), 'other.caldence.json');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('a wheel over a focused number field scrolls and leaves the value alone', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/');
  await openWorkspaceFile(page, teamsOnly());
  await showView(page, 'Settings');
  const field = page.locator('#panel-settings input[type="number"]').first();
  const before = await field.inputValue();
  await field.focus();
  await field.hover();
  const scrolled = () =>
    page.evaluate(() =>
      Math.max(
        scrollY,
        ...[...document.querySelectorAll('*')].map((el) =>
          getComputedStyle(el).overflowY === 'auto' ? el.scrollTop : 0,
        ),
      ),
    );
  const top = await scrolled();
  await page.mouse.wheel(0, 200);
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, 200);
  await expect(field).toHaveValue(before);
  // The page scrolled on instead.
  await expect.poll(scrolled).toBeGreaterThan(top);
  await expect(page.getByText('✓ Saved')).toBeVisible();
});
