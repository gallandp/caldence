import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Download, type Page } from '@playwright/test';
import { useFileFallback } from './helpers';

type Catalogue = Record<string, string>;
const catalogue = (locale: 'de' | 'en'): Catalogue =>
  JSON.parse(readFileSync(`src/i18n/${locale}.json`, 'utf8'));

const TODAY = '2027-03-17'; // a Wednesday
const A11Y_URL = 'https://github.com/gallandp/caldence/blob/main/docs/accessibility.md';

const panel = (page: Page, name: string) => page.getByRole('tabpanel', { name });

interface Step {
  text: string;
  role: 'button' | 'tab' | 'link' | 'radio' | null;
  name: string | null;
}

/** Opens the manual from the start screen and reads its first steps as rendered. */
async function readSteps(page: Page, c: Catalogue): Promise<Step[]> {
  await page.getByRole('button', { name: c['start.manual'], exact: true }).click();
  const help = panel(page, c['view.help']!);
  await expect(help.getByRole('heading', { level: 3, name: c['help.first.title'] })).toBeVisible();
  return help.locator('[data-manual-steps] > li').evaluateAll((items) =>
    items.map((li) => {
      const el = li as HTMLElement;
      return {
        text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
        role: (el.dataset.controlRole ?? null) as Step['role'],
        name: el.dataset.controlName ?? null,
      };
    }),
  );
}

/**
 * What a reader types or picks in a step, by step index. `labels` are the catalogue keys of the
 * fields the step's text must name, so the test only does what the manual says.
 */
const fields: Record<
  number,
  { labels: string[]; run: (page: Page, c: Catalogue) => Promise<void> }
> = {
  5: {
    labels: ['setup.people'],
    run: async (page) => {
      await page.getByRole('dialog').getByLabel('Product Owner', { exact: true }).fill('Kim');
    },
  },
  10: {
    labels: ['exchange.export.scope', 'exchange.scope.person', 'exchange.scope.pick.person'],
    run: async (page, c) => {
      const exchange = panel(page, c['view.exchange']!);
      await exchange.getByRole('radio', { name: c['exchange.scope.person'], exact: true }).check();
      await exchange
        .getByLabel(c['exchange.scope.pick.person']!, { exact: true })
        .selectOption({ label: 'Kim' });
    },
  },
};

for (const locale of ['de', 'en'] as const) {
  test.describe(`manual (${locale})`, () => {
    test.use({ locale: locale === 'de' ? 'de-DE' : 'en-US' });
    test.beforeEach(async ({ page }) => {
      await useFileFallback(page);
      await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
    });

    test('the manual alone gets a new user to an .ics export', async ({ page }) => {
      const c = catalogue(locale);
      const steps = await readSteps(page, c);
      expect(steps.length).toBeGreaterThan(Math.max(...Object.keys(fields).map(Number)));
      const last = steps.length - 1;
      expect(steps[last]!.name).toBe(c['exchange.export.button']);

      let download: Promise<Download> | undefined;
      for (const [i, step] of steps.entries()) {
        if (step.role && step.name) {
          // The step names the real label of the control it asks for.
          expect(step.text, `step ${i + 1}`).toContain(step.name);
          if (i === last) download = page.waitForEvent('download');
          await page.getByRole(step.role, { name: step.name, exact: true }).click();
        }
        const extra = fields[i];
        if (extra) {
          for (const key of extra.labels) expect(step.text, `step ${i + 1}`).toContain(c[key]);
          await extra.run(page, c);
        }
      }

      expect(download).toBeDefined();
      const file = await download!;
      expect(file.suggestedFilename()).toMatch(/\.ics$/);
      const text = readFileSync((await file.path())!, 'utf8');
      expect(text).toContain('BEGIN:VEVENT');
      expect(text).toContain('SUMMARY:Sprint Planning');
    });

    for (const scheme of ['light', 'dark'] as const) {
      test(`every table of contents entry has its section, and axe passes (${scheme})`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme: scheme });
        const c = catalogue(locale);
        await page.getByRole('tab', { name: c['view.help'], exact: true }).click();
        const help = panel(page, c['view.help']!);
        const toc = help.getByRole('navigation', { name: c['help.toc'], exact: true });
        const links = toc.getByRole('link');
        await expect(links).toHaveCount(9);
        for (const link of await links.all()) {
          const name = ((await link.textContent()) ?? '').trim();
          const href = (await link.getAttribute('href')) ?? '';
          expect(href).toMatch(/^#/);
          const heading = help.locator(href);
          await expect(heading).toHaveText(name);
          await expect(help.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
          await expect(help.getByRole('region', { name, exact: true })).toBeAttached();
        }
        await expect(
          help.getByRole('link', { name: c['help.a11y.link'], exact: true }),
        ).toHaveAttribute('href', A11Y_URL);

        await links.last().click();
        await expect(help.locator((await links.last().getAttribute('href'))!)).toBeInViewport();

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations).toEqual([]);
      });
    }
  });
}

for (const locale of ['de', 'en'] as const) {
  test.describe(`narrow manual (${locale})`, () => {
    test.use({ locale: locale === 'de' ? 'de-DE' : 'en-US' });
    test('the manual fits 375 px without horizontal scroll', async ({ page }) => {
      const c = catalogue(locale);
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await page.getByRole('tab', { name: c['view.help'], exact: true }).click();
      await expect(
        page.getByRole('navigation', { name: c['help.toc'], exact: true }),
      ).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}
