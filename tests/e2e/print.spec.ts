import { expect, test } from '@playwright/test';
import { areaWorkspace } from './area-fixture';
import {
  openExample,
  openWorkspaceFile,
  pickUnit,
  setLanguage,
  showAreaPage,
  useFileFallback,
} from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`printing shows only the view, on white, without navigation (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1280, height: 900 });
    await openExample(page);
    await page.getByRole('tab', { name: 'Meeting load', exact: true }).click();
    await page.emulateMedia({ media: 'print', colorScheme: scheme });
    // A4 at 96 dpi minus the page margins.
    await page.setViewportSize({ width: 700, height: 1000 });
    await expect(page.locator('.sidebar')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Meeting load', level: 2 })).toBeVisible();
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe('rgb(255, 255, 255)');
    // Cards and their text are light-scheme too, also when the screen was dark.
    const card = await page
      .locator('#panel-load .card')
      .first()
      .evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
    expect(card[0]).toBe('rgb(255, 255, 255)');
    expect(card[1]).not.toBe('rgb(255, 255, 255)');
    // Nothing is cut off at the right edge of the paper.
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(700);
  });
}

test('paper names the file, print date and planning horizon; no rate without one', async ({
  page,
}) => {
  await openExample(page);
  const meta = page.locator('[data-print-meta]');
  await expect(meta).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  await expect(meta).toBeVisible();
  expect(await meta.evaluate((el) => getComputedStyle(el, '::before').content)).toMatch(
    /^"Untitled · printed on \d\d\/\d\d\/\d{4} · planning horizon 2027, 52\u00a0wks"$/,
  );
});

test('the calendar prints without its navigation buttons', async ({ page }) => {
  await openExample(page);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'Today' })).toBeHidden();
  await expect(page.locator('#panel-calendar table').first()).toBeVisible();
});

test('the Print button opens the browser print dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openExample(page);
  await page.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed++;
    };
  });
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
});

test('the meetings list prints without edit controls and names its filter', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openExample(page);
  await page.getByRole('tab', { name: 'Meetings & cadence', exact: true }).click();
  await page.getByRole('searchbox').fill('Sprint');
  await page.emulateMedia({ media: 'print' });
  const panel = page.locator('#panel-meetings');
  await expect(panel.getByText('Filtered by “Sprint”')).toBeVisible();
  await expect(panel.getByRole('searchbox')).toBeHidden();
  const edits = panel.locator('[data-edit]');
  await expect(edits).toHaveCount(2);
  for (const button of await edits.all()) await expect(button).toBeHidden();
  await expect(panel.locator('.cadence').getByRole('button')).toBeHidden();
  // On screen the filter note stays out of the way.
  await page.emulateMedia({ media: 'screen' });
  await expect(panel.getByText('Filtered by “Sprint”')).toBeHidden();
});

test('the area structure prints its table in full and "0 h" for unset hours', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const ws = areaWorkspace();
  ws.settings.locale = 'en';
  await openWorkspaceFile(page, ws);
  await pickUnit(page, 'Payments');
  await page.getByRole('tab', { name: 'Area', exact: true }).click();
  await showAreaPage(page, 'Structure');
  const show = page.getByRole('group', { name: /show/i });
  await show.getByRole('button', { name: 'Table' }).click();
  await page.emulateMedia({ media: 'print' });
  await page.setViewportSize({ width: 700, height: 1000 });
  await expect(show).toBeHidden();
  await expect(page.getByRole('group', { name: 'Page' })).toBeHidden();
  // No scroll box cuts columns off on paper.
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#app main *')].some(
      (el) =>
        !el.matches('.sr-only') &&
        el.scrollWidth > el.clientWidth + 1 &&
        ['auto', 'scroll', 'hidden'].includes(getComputedStyle(el).overflowX) &&
        el.offsetParent !== null,
    ),
  );
  expect(clipped).toBe(false);
  await expect(page.locator('#app main').getByText('set hours')).toHaveCount(0);
});

test('a what-if prints as a note, without its Reset button', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openExample(page);
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await page.getByRole('tab', { name: /^Meetings/ }).click();
  const cadence = page.locator('#panel-meetings .cadence');
  await cadence.getByRole('button', { name: 'What if …' }).click();
  const sheet = page.getByRole('dialog', { name: 'Cadence · Team Alpha' });
  await sheet.getByLabel('Length (weeks)').fill('3');
  await sheet.getByRole('button', { name: 'Apply' }).click();
  await page.emulateMedia({ media: 'print' });
  const note = page.getByRole('region', { name: 'What if' });
  await expect(note).toContainText('What if · 1 change');
  await expect(note).toContainText('Team Alpha: sprint 2 → 3 weeks');
  await expect(note.getByRole('button', { name: 'Reset' })).toBeHidden();
  await expect(cadence.getByRole('button', { name: 'What if …' })).toBeHidden();
});

test('phones print from the file menu; the German file bar fits beside the sidebar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openExample(page);
  await page.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed++;
    };
  });
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  await page.setViewportSize({ width: 1280, height: 800 });
  await setLanguage(page, 'de');
  // Just above phone width, and beside the sidebar: the buttons keep only their icons.
  for (const width of [660, 1000]) {
    await page.setViewportSize({ width, height: 800 });
    const bar = page.locator('#app .content > header.bar');
    await expect(bar.getByRole('button', { name: 'Drucken', exact: true })).toBeVisible();
    const [scroll, client] = await bar.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(scroll).toBeLessThanOrEqual(client!);
  }
});
