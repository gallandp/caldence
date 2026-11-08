// Accessibility audit for the 1.0 release (#20). The results are written up in
// docs/accessibility/audit-2026.md; keep the test names in step with the report.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const TODAY = '2027-03-17';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const views = {
  de: [
    'Kalender',
    'Wochen',
    'Auslastung',
    'Termine',
    'Team',
    'Einstellungen',
    'Vorlagen',
    'Import / Export',
    'Hilfe',
  ],
  en: [
    'Calendar',
    'Weeks',
    'Load',
    'Meetings',
    'Team',
    'Workspace settings',
    'Templates',
    'Import / Export',
    'Help',
  ],
} as const;
type Locale = keyof typeof views;

/** Opens the app on a fixed day, loads the example workspace and switches the language. */
async function loadExample(page: Page, locale: Locale) {
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  await page.goto('/');
  await page
    .getByRole('tabpanel')
    .getByRole('button', { name: /^(Open the example|Das Beispiel öffnen)$/ })
    .click();
  // A language chosen before counts as an unsaved change: discard it.
  const discard = page.getByRole('dialog').getByRole('button', { name: /^(Discard|Verwerfen)$/ });
  await expect(page.getByRole('grid').or(discard)).toBeVisible();
  if (await discard.isVisible()) await discard.click();
  await expect(page.getByRole('grid')).toBeVisible();
  await page.getByLabel(/Language|Sprache/).selectOption(locale);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
}

async function showView(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
  await expect(page.getByRole('tabpanel', { name, exact: true })).toBeVisible();
}

/** Problems with horizontal scrolling: of the page, and of scroll containers inside it. */
async function reflowProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth)
      problems.push(`page scrolls: ${doc.scrollWidth} > ${window.innerWidth}`);
    const focusable =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]';
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const style = getComputedStyle(el);
      if (!['auto', 'scroll'].includes(style.overflowX)) continue;
      if (el.scrollWidth <= el.clientWidth || el.getClientRects().length === 0) continue;
      const name = el.getAttribute('aria-label') ?? el.getAttribute('aria-labelledby');
      const what = `${el.tagName.toLowerCase()}.${el.className}`;
      if (el.querySelector('table')) {
        // A wide table scrolls in its own region: reachable, named and with a focus outline.
        if (el.getAttribute('tabindex') !== '0')
          problems.push(`${what}: table region not tabbable`);
        if (!name) problems.push(`${what}: table region has no label`);
      } else {
        if (!el.querySelector(focusable) && el.getAttribute('tabindex') !== '0')
          problems.push(`${what}: scrolls but is not keyboard reachable`);
        if (!name) problems.push(`${what}: scrolls but has no label`);
      }
    }
    return problems;
  });
}

/** True when the focused element shows an outline or a box shadow. */
const focusVisible = (locator: Locator) =>
  locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    return (
      (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none'
    );
  });

/**
 * Visible non-colour marks of an element: borders, underlines and, unless forced colours drop
 * them, shadows and background images. Pseudo-elements count too.
 */
const marks = (locator: Locator, forced: boolean) =>
  locator.evaluate((el, forced) => {
    const out: string[] = [];
    const clear = (c: string) => c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
    for (const target of [null, '::before', '::after'] as const) {
      const cs = getComputedStyle(el, target);
      if (target && (cs.content === 'none' || cs.display === 'none')) continue;
      const p = target ?? '';
      for (const side of ['top', 'right', 'bottom', 'left'])
        if (
          cs.getPropertyValue(`border-${side}-style`) !== 'none' &&
          parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0 &&
          !clear(cs.getPropertyValue(`border-${side}-color`))
        )
          out.push(`${p}border-${side}`);
      if (cs.textDecorationLine.includes('underline')) out.push(`${p}underline`);
      if (!forced && cs.boxShadow !== 'none') out.push(`${p}box-shadow`);
      if (!forced && cs.backgroundImage !== 'none') out.push(`${p}background-image`);
    }
    return out;
  }, forced);

/** The marks `a` has and `b` lacks. */
async function extraMarks(a: Locator, b: Locator, forced: boolean) {
  const other = await marks(b, forced);
  return (await marks(a, forced)).filter((m) => !other.includes(m));
}

/** Presses Tab (or Shift+Tab) until `target` has the focus. */
async function tabTo(page: Page, target: Locator, key = 'Tab', max = 60) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  await expect(target).toBeFocused();
}

for (const locale of ['de', 'en'] as const) {
  for (const width of [320, 640]) {
    test(`reflow at ${width} px: no horizontal page scroll in any view (${locale})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
      await page.goto('/');
      await page.getByLabel(/Language|Sprache/).selectOption(locale);
      expect(await reflowProblems(page), 'start screen').toEqual([]);
      await loadExample(page, locale);
      for (const name of views[locale]) {
        await showView(page, name);
        expect.soft(await reflowProblems(page), `${locale} ${width} ${name}`).toEqual([]);
      }
    });
  }
}

test('reflow at 320 px: the month grid region is focusable and shows a focus outline', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await loadExample(page, 'en');
  const region = page.getByRole('region', { name: 'Month grid' });
  await expect(region).toHaveAttribute('tabindex', '0');
  expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await tabTo(page, region);
  expect(await focusVisible(region)).toBe(true);
});

test('reflow at 320 px: every table that scrolls is a region reached by Tab with a focus outline', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await loadExample(page, 'en');
  for (const name of ['Meetings', 'Team', 'Help', 'Import / Export']) {
    const tab = page.getByRole('tab', { name, exact: true });
    await tab.click();
    if (name === 'Import / Export') {
      // The import review table appears once an .ics file is chosen.
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Choose .ics file…' }).click();
      await (await chooser).setFiles('tests/fixtures/ics/outlook-sample.ics');
      await expect(page.getByRole('tabpanel', { name }).locator('tbody tr').first()).toBeVisible();
    }
    const regions = page
      .getByRole('tabpanel', { name, exact: true })
      .getByRole('region')
      .filter({ has: page.locator('table') });
    const count = await regions.count();
    expect(count, name).toBeGreaterThan(0);
    let scrolled = 0;
    for (let i = 0; i < count; i++) {
      const region = regions.nth(i);
      if (!(await region.evaluate((el) => el.scrollWidth > el.clientWidth))) continue;
      scrolled++;
      await tab.focus();
      await tabTo(page, region, 'Tab', 200);
      expect(await focusVisible(region), `${name} region ${i}`).toBe(true);
    }
    // Each of these views has at least one table that is wider than 320 px.
    expect(scrolled, `${name}: scrolling table regions`).toBeGreaterThan(0);
  }
});

for (const locale of ['de', 'en'] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`example workspace: axe passes in every view (${locale}, ${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await loadExample(page, locale);
      for (const name of views[locale]) {
        await showView(page, name);
        const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        expect.soft(results.violations, `${locale} ${scheme} ${name}`).toEqual([]);
      }
    });

    test(`forced colours: axe passes in every view (${locale}, ${scheme})`, async ({ page }) => {
      await page.emulateMedia({ forcedColors: 'active', colorScheme: scheme });
      await loadExample(page, locale);
      for (const name of views[locale]) {
        await showView(page, name);
        const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        expect.soft(results.violations, `${locale} ${scheme} ${name}`).toEqual([]);
      }
    });
  }
}

for (const width of [1280, 320]) {
  test(`forced colours: focus outlines and the selected tab stay visible (${width} px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ forcedColors: 'active' });
    await loadExample(page, 'en');

    const selected = page.getByRole('tab', { name: 'Calendar', exact: true });
    // Focus by keyboard: after the click on the example the tab has the focus without a ring.
    await page.keyboard.press('Tab');
    await tabTo(page, selected, 'Shift+Tab');
    expect(await focusVisible(selected), 'focused tab').toBe(true);

    const button = page.getByRole('button', { name: 'Today', exact: true });
    await tabTo(page, button);
    expect(await focusVisible(button), 'focused button').toBe(true);

    // The selected tab must differ from the others by more than colour: a border or an underline.
    const other = page.getByRole('tab', { name: 'Weeks', exact: true });
    expect(await extraMarks(selected, other, true), 'selected tab marks').not.toEqual([]);
  });
}

for (const forced of [false, true]) {
  test(`${forced ? 'forced colours' : 'default colours'}: pressed view mode, selected day and today differ by more than colour`, async ({
    page,
  }) => {
    if (forced) await page.emulateMedia({ forcedColors: 'active' });
    await loadExample(page, 'en');
    const panel = page.getByRole('tabpanel', { name: 'Calendar' });
    const month = panel.getByRole('button', { name: 'Month', exact: true });
    const week = panel.getByRole('button', { name: 'Week', exact: true });
    await expect(month).toHaveAttribute('aria-pressed', 'true');
    // A faint shadow on a near-white pill is not enough here: a border or an underline.
    const outlined = (await extraMarks(month, week, forced)).filter((m) => !m.includes('shadow'));
    expect.soft(outlined, 'pressed view mode').not.toEqual([]);

    const day = (date: string) => panel.locator(`td[data-date="${date}"]`);
    await day('2027-03-18').click();
    await expect(day('2027-03-18')).toHaveAttribute('aria-selected', 'true');
    expect
      .soft(await extraMarks(day('2027-03-18'), day('2027-03-19'), forced), 'selected day')
      .not.toEqual([]);
    expect
      .soft(
        await extraMarks(day(TODAY).locator('.day'), day('2027-03-19').locator('.day'), forced),
        'today',
      )
      .not.toEqual([]);
  });
}

for (const width of [320, 800]) {
  test(`default colours: the selected view tab has a border or an underline at ${width} px`, async ({
    page,
  }) => {
    // Below 60rem the bar beside the selected tab is hidden; a lighter pill alone is too faint.
    await page.setViewportSize({ width, height: 800 });
    await loadExample(page, 'en');
    const selected = page.getByRole('tab', { name: 'Calendar', exact: true });
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    const other = page.getByRole('tab', { name: 'Weeks', exact: true });
    const outlined = (await extraMarks(selected, other, false)).filter(
      (m) => m.includes('border') || m.includes('underline'),
    );
    expect(outlined, 'selected tab marks').not.toEqual([]);
  });
}

test('reduced motion: no CSS animation runs after load in any view', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const settled = () =>
    page.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return document
        .getAnimations()
        .map((a) => `${a.constructor.name} ${(a as CSSAnimation).animationName ?? ''}`);
    });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await settled(), 'start screen').toEqual([]);
  await loadExample(page, 'en');
  for (const name of views.en) {
    await showView(page, name);
    expect.soft(await settled(), name).toEqual([]);
  }
});

test('keyboard only: start screen, example, calendar, day details and export', async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome to Caldence' })).toBeVisible();

  // Start screen → Open the example.
  const example = page.getByRole('button', { name: 'Open the example' });
  await tabTo(page, example);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('grid')).toBeVisible();
  // The start screen is gone: focus must not fall back to the page.
  const calendarTab = page.getByRole('tab', { name: 'Calendar', exact: true });
  await expect(calendarTab).toBeFocused();

  // The tabs follow the arrow keys.
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('tab', { name: 'Weeks', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Weeks' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Load', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect(calendarTab).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Calendar' })).toBeVisible();

  // Open a day with Enter and close it with Escape.
  const cell = page.locator('td[role="gridcell"][tabindex="0"]');
  await tabTo(page, cell);
  const date = await cell.getAttribute('data-date');
  expect(date).toBe(TODAY);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('td[data-date="2027-03-18"]')).toBeFocused();
  await page.keyboard.press('Enter');
  const details = page.locator('section.details');
  await expect(details.getByRole('heading', { level: 3 })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(details).toHaveCount(0);
  await expect(page.locator('td[data-date="2027-03-18"]')).toBeFocused();

  // Back to the tabs, then Import / Export.
  await tabTo(page, calendarTab, 'Shift+Tab');
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Help', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  const exchangeTab = page.getByRole('tab', { name: 'Import / Export', exact: true });
  await expect(exchangeTab).toBeFocused();
  const panel = page.getByRole('tabpanel', { name: 'Import / Export' });
  await expect(panel).toBeVisible();

  // Export with Enter.
  const exportButton = panel.getByRole('button', { name: 'Export .ics…' });
  await tabTo(page, exportButton);
  const download = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
  await expect(panel.getByRole('status')).toContainText('recurring series');
  await expect(exportButton).toBeFocused();
});
