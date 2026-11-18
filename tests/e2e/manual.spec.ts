import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import { GUIDES, REFERENCES, TOPICS } from '../../src/ui/help/topics';
import { showView, useFileFallback } from './helpers';

type Catalogue = Record<string, string>;
const catalogue = (locale: 'de' | 'en'): Catalogue =>
  JSON.parse(readFileSync(`src/i18n/${locale}.json`, 'utf8'));

const TODAY = '2027-03-17'; // a Wednesday
const A11Y_URL = 'https://github.com/gallandp/caldence/blob/main/docs/accessibility.md';

const panel = (page: Page, name: string) => page.getByRole('tabpanel', { name });
/** A topic's title as the UI shows it, with the default level names (Team / Bereich). */
const title = (c: Catalogue, id: string) =>
  c[`help.topic.${id}.title`]!.replace('{levelTeamsLc}', 'teams').replace('{levelTeams}', 'Teams');

interface Step {
  text: string;
  role: 'button' | 'tab' | 'link' | 'radio' | null;
  name: string | null;
}

/** The steps of the open guide, as rendered. */
async function readSteps(help: Locator): Promise<Step[]> {
  return help.locator('[data-manual-steps] > li').evaluateAll((items) =>
    items.map((li) => {
      const el = li as HTMLElement;
      return {
        text: (el.querySelector('p')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        role: (el.dataset.controlRole ?? null) as Step['role'],
        name: el.dataset.controlName ?? null,
      };
    }),
  );
}

type Extra = { labels: string[]; run: (page: Page, c: Catalogue) => Promise<void> };

/**
 * Follows a guide: clicks the control each step names and, for steps listed in `fields`, types or
 * picks what the step says. `labels` are the catalogue keys the step's text must name.
 */
async function follow(page: Page, steps: Step[], fields: Record<number, Extra>, c: Catalogue) {
  for (const [i, step] of steps.entries()) {
    if (step.role && step.name) {
      // The step names the real label of the control it asks for.
      expect(step.text, `step ${i + 1}`).toContain(step.name);
      await page.getByRole(step.role, { name: step.name, exact: true }).click();
    }
    const extra = fields[i];
    if (extra) {
      for (const key of extra.labels) expect(step.text, `step ${i + 1}`).toContain(c[key]);
      await extra.run(page, c);
    }
  }
}

for (const locale of ['de', 'en'] as const) {
  test.describe(`help (${locale})`, () => {
    test.use({ locale: locale === 'de' ? 'de-DE' : 'en-US' });
    test.beforeEach(async ({ page }) => {
      await useFileFallback(page);
      await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
    });

    test('the guides alone get a new user to an .ics export', async ({ page }) => {
      const c = catalogue(locale);
      // The start screen's manual link opens the first guide.
      await page.getByRole('button', { name: c['start.manual'], exact: true }).click();
      const help = panel(page, c['view.help']!);
      await expect(help.getByRole('heading', { level: 3, name: title(c, 'start') })).toBeVisible();
      const start = await readSteps(help);
      expect(start.length).toBeGreaterThanOrEqual(6);
      await follow(
        page,
        start,
        {
          5: {
            labels: ['setup.people'],
            run: async (p) => {
              await p.getByRole('dialog').getByLabel('Product Owner', { exact: true }).fill('Kim');
            },
          },
        },
        c,
      );
      await expect(page.getByText(c['setup.done.title']!)).toBeVisible();

      // Back in Help, the calendar guide leads to the file.
      await page.getByRole('tab', { name: c['view.help'], exact: true }).click();
      await help.locator('[data-topic="calendar"]').click();
      await expect(
        help.getByRole('heading', { level: 3, name: title(c, 'calendar') }),
      ).toBeFocused();
      const calendar = await readSteps(help);
      const last = calendar.length - 1;
      expect(calendar[last]!.name).toBe(c['exchange.export.button']);
      const download: Promise<Download> = page.waitForEvent('download');
      await follow(
        page,
        calendar,
        {
          1: {
            labels: [
              'exchange.export.scope',
              'exchange.scope.person',
              'exchange.scope.pick.person',
            ],
            run: async (p, cat) => {
              const exchange = panel(p, cat['view.exchange']!);
              await exchange
                .getByRole('radio', { name: cat['exchange.scope.person'], exact: true })
                .check();
              await exchange
                .getByLabel(cat['exchange.scope.pick.person']!, { exact: true })
                .selectOption({ label: 'Kim' });
            },
          },
        },
        c,
      );
      const file = await download;
      expect(file.suggestedFilename()).toMatch(/\.ics$/);
      const text = readFileSync((await file.path())!, 'utf8');
      expect(text).toContain('BEGIN:VEVENT');
      expect(text).toContain('SUMMARY:Sprint Planning');
    });

    for (const scheme of ['light', 'dark'] as const) {
      test(`every topic opens and leads back, and axe passes (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        const c = catalogue(locale);
        await page.getByRole('tab', { name: c['view.help'], exact: true }).click();
        const help = panel(page, c['view.help']!);
        await expect(
          help.getByRole('heading', { level: 3, name: c['help.home.title'] }),
        ).toBeVisible();
        // No chapter text before a topic is chosen: the home page shows tasks only.
        await expect(help.locator('[data-manual-steps]')).toHaveCount(0);
        await expect(help.locator('[data-topic]')).toHaveCount(TOPICS.length);
        for (const g of GUIDES)
          await expect(help.locator(`[data-topic="${g.id}"]`)).toContainText(
            c['help.home.steps']!.replace('{n}', String(g.steps!.length)),
          );

        let results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations).toEqual([]);

        for (const t of TOPICS) {
          await help.locator(`[data-topic="${t.id}"]`).click();
          const heading = help.getByRole('heading', { level: 3, name: title(c, t.id) });
          await expect(heading).toBeFocused();
          await expect(help.getByRole('article', { name: title(c, t.id) })).toBeVisible();
          await help.getByRole('button', { name: c['help.back'], exact: true }).click();
          await expect(help.locator(`[data-topic="${t.id}"]`)).toBeFocused();
        }

        // A guide with its details unfolded, and a reference page with tables.
        await help.locator('[data-topic="load"]').click();
        await help.getByText(c['help.more']!, { exact: true }).click();
        results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations).toEqual([]);
        await help.getByRole('button', { name: c['help.back'], exact: true }).click();
        await help.locator('[data-topic="keys"]').click();
        await expect(help.getByRole('table')).toHaveCount(2);
        results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations).toEqual([]);
      });
    }

    test('a guide opens its view, and links between topics open the topic', async ({ page }) => {
      const c = catalogue(locale);
      await page.getByRole('button', { name: c['start.example'], exact: true }).click();
      await page.getByRole('tab', { name: c['view.help'], exact: true }).click();
      const help = panel(page, c['view.help']!);

      await help.locator('[data-topic="load"]').click();
      await help.getByText(c['help.more']!, { exact: true }).click();
      // "How the meeting load is calculated" is a link inside the details.
      await help.getByRole('link', { name: title(c, 'calc'), exact: true }).click();
      await expect(help.getByRole('heading', { level: 3, name: title(c, 'calc') })).toBeFocused();
      await help.getByRole('button', { name: c['help.back'], exact: true }).click();

      await help.locator('[data-topic="meetings"]').click();
      const open = c['help.open']!.replace('{view}', c['view.meetings']!);
      await help.getByRole('button', { name: open, exact: true }).click();
      await expect(panel(page, c['view.meetings']!)).toBeVisible();

      // The views at a glance open their view too.
      await page.getByRole('tab', { name: c['view.help'], exact: true }).click();
      await expect(help.getByRole('heading', { name: c['help.home.title'] })).toBeVisible();
      await help.getByRole('button', { name: new RegExp('^' + c['view.settings']) }).click();
      await expect(panel(page, c['view.settings']!)).toBeVisible();
    });

    test('the accessibility page links to the statement', async ({ page }) => {
      const c = catalogue(locale);
      await page.getByRole('tab', { name: c['view.help'], exact: true }).click();
      const help = panel(page, c['view.help']!);
      await help.locator('[data-topic="a11y"]').click();
      await expect(
        help.getByRole('link', { name: c['help.a11y.link'], exact: true }),
      ).toHaveAttribute('href', A11Y_URL);
    });
  });
}

for (const locale of ['de', 'en'] as const) {
  test.describe(`narrow help (${locale})`, () => {
    test.use({ locale: locale === 'de' ? 'de-DE' : 'en-US' });
    test('the help fits 375 px without horizontal scroll', async ({ page }) => {
      const c = catalogue(locale);
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await showView(page, c['view.help']!);
      const help = panel(page, c['view.help']!);
      const overflow = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
      await expect(help.getByRole('heading', { name: c['help.home.title'] })).toBeVisible();
      expect(await overflow()).toBeLessThanOrEqual(0);
      for (const id of ['calendar', 'load', ...REFERENCES.map((r) => r.id)]) {
        await help.locator(`[data-topic="${id}"]`).click();
        await expect(help.getByRole('heading', { level: 3, name: title(c, id) })).toBeVisible();
        expect(await overflow(), id).toBeLessThanOrEqual(0);
        await help.getByRole('button', { name: c['help.back'], exact: true }).click();
      }
    });
  });
}
