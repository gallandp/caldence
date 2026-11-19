import { expect, test, type Locator, type Page } from '@playwright/test';
import { areaWorkspace } from './area-fixture';
import { openWorkspaceFile, pickUnit, setLanguage, showView, useFileFallback } from './helpers';

// A phone: 390 px wide, touch, and a page that may grow wider than the screen if content overflows.
test.use({
  locale: 'en-US',
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const pageWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

/** True when every option of the select shows its whole text in the closed control. */
const optionsFit = (select: Locator) =>
  select.evaluate((el: HTMLSelectElement) => {
    const cs = getComputedStyle(el);
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return [...el.options].every((o) => ctx.measureText(o.text).width <= room);
  });

for (const colorScheme of ['light', 'dark'] as const) {
  test(`area meetings with long role names fit a phone (${colorScheme}, #431)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    // The start screen's "Open" sits in the sidebar, which a phone hides.
    await page.setViewportSize({ width: 1280, height: 844 });
    await page.goto('/');
    const ws = areaWorkspace();
    ws.settings.locale = 'en';
    // A long role name without spaces, invited from every team and missing in Team Beta.
    ws.roles.find((r) => r.id === 'role-sm')!.name = 'ScrumMaster/AgileCoach/Facilitator';
    await openWorkspaceFile(page, ws);
    await pickUnit(page, 'Payments');
    await page.setViewportSize({ width: 390, height: 844 });
    await showView(page, 'Meetings & cadence');
    const panel = page.getByRole('tabpanel', { name: 'Meetings & cadence' });
    const row = panel.getByRole('row', { name: /Scrum of Scrums/ });
    await expect(row.getByText('No ScrumMaster/AgileCoach/Facilitator in Team Beta')).toBeVisible();
    expect(await pageWidth(page)).toBeLessThanOrEqual(390);

    await row.getByRole('button', { name: 'Edit Scrum of Scrums' }).click();
    const who = panel.locator('.eventform').getByLabel('Who: ScrumMaster/AgileCoach/Facilitator');
    await expect(who).toHaveValue('teams');
    expect(await optionsFit(who)).toBe(true);
    expect(await pageWidth(page)).toBeLessThanOrEqual(390);
  });

  test(`the appearance switch fits one row on a phone (${colorScheme}, #435)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open the example' }).click();
    for (const [lang, settings, name] of [
      ['en', 'Settings', 'Appearance'],
      ['de', 'Einstellungen', 'Darstellung'],
    ] as const) {
      await setLanguage(page, lang);
      await showView(page, settings);
      const options = page.getByRole('radiogroup', { name }).getByRole('radio');
      await expect(options).toHaveCount(3);
      const boxes = await options.evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect),
      );
      for (const box of boxes) {
        expect(box.top).toBe(boxes[0]!.top);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
      expect(await pageWidth(page)).toBeLessThanOrEqual(390);
    }
  });
}
