import { expect, test } from '@playwright/test';
import { lineExampleWorkspace } from '../../src/data/examples/line-example';
import { pickUnit, useFileFallback } from './helpers';

/**
 * Performance budget of the line organisation epic (#315): a file at the target scale (61
 * products, ~500 people, ~600 meetings, one year) opens in under 2 s and every view renders in
 * under 1 s, with the CPU throttled 4×.
 */
const OPEN_MS = 2000;
const VIEW_MS = 1000;
// A shared runner is noisy: the budget must hold in one of three runs, not in every one.
test.describe.configure({ retries: 2 });

// Each world shows its own views (#394); a view missing in the current world is skipped.
const VIEWS = [
  'calendar',
  'load',
  'meetings',
  'team',
  'people',
  'staffing',
  'matrix',
  'templates',
  'settings',
  'exchange',
  'help',
];

test('a file at the target scale opens and renders within budget', async ({ page }) => {
  test.setTimeout(120_000);
  const ws = lineExampleWorkspace('en');
  ws.view = { unit: '@organisation', page: 'help' };
  await useFileFallback(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeEnabled();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  const start = await page.evaluate(() => performance.now());
  await (
    await chooser
  ).setFiles({
    name: 'scale.caldence.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ws)),
  });
  await expect(page.getByText('scale-v2.caldence.json')).toBeVisible();
  const opened = (await page.evaluate(() => performance.now())) - start;

  /** Time from the tab click to the frame after the view rendered. */
  const render = (id: string) =>
    page.evaluate(async (view) => {
      const tab = document.getElementById('tab-' + view);
      // The organisation has no Meetings view (#313).
      if (!tab) return null;
      const t0 = performance.now();
      tab.click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - t0;
    }, id);

  const times: Record<string, number> = { open: Math.round(opened) };
  const all = async (scope: string) => {
    for (const view of VIEWS) {
      const ms = await render(view);
      if (ms !== null) times[`${scope}/${view}`] = Math.round(ms);
    }
  };
  /** The Overview page of the organisation or a platform, with its staffing map (#322). */
  const overview = async (scope: string) => {
    await page.evaluate(() => document.getElementById('tab-team')?.click());
    times[`${scope}/overview`] = Math.round(
      await page.evaluate(async () => {
        const tab = document.querySelectorAll<HTMLButtonElement>('.pages button')[1]!;
        const t0 = performance.now();
        tab.click();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return performance.now() - t0;
      }),
    );
    await expect(page.locator('[data-staffing-map]')).toBeVisible();
    await page.locator('.pages button').first().click();
  };
  await all('org');
  await overview('org');
  await pickUnit(page, ws.areas[0]!.name);
  await all('platform');
  await overview('platform');
  await pickUnit(page, ws.teams[0]!.name);
  await all('product');
  // A line team of about a dozen people and the whole line of ~500 (#316).
  const line = async (name: string) => {
    await page
      .getByRole('radiogroup', { name: 'World' })
      .getByRole('radio', { name: 'Line' })
      .click();
    await page.locator('.switcher .pick').click();
    await page
      .locator('.switcher .list button.line')
      .filter({ has: page.locator('.opt-name-line', { hasText: new RegExp(`^${name}$`) }) })
      .click();
    await expect(page.locator('.switcher .pick .label')).toHaveText(name);
  };
  const root = ws.lineUnits!.find((u) => !u.parentId)!;
  const group = ws.lineUnits!.find((u) => u.parentId === root.id)!;
  await line(ws.lineUnits!.find((u) => u.parentId === group.id)!.name);
  await all('lineTeam');
  await line(root.name);
  await all('line');
  console.log(JSON.stringify(times));

  expect(opened, 'open').toBeLessThan(OPEN_MS);
  for (const [k, ms] of Object.entries(times))
    if (k !== 'open') expect(ms, k).toBeLessThan(VIEW_MS);
});
