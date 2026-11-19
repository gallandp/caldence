import { expect, test } from '@playwright/test';
import { perfWorkspace } from '../fixtures/perf-workspace';
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

const VIEWS = ['calendar', 'load', 'meetings', 'team', 'templates', 'settings', 'exchange', 'help'];

test('a file at the target scale opens and renders within budget', async ({ page }) => {
  test.setTimeout(120_000);
  const ws = perfWorkspace();
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
  await all('org');
  await pickUnit(page, ws.areas[0]!.name);
  await all('platform');
  await pickUnit(page, ws.teams[0]!.name);
  await all('product');
  console.log(JSON.stringify(times));

  expect(opened, 'open').toBeLessThan(OPEN_MS);
  for (const [k, ms] of Object.entries(times))
    if (k !== 'open') expect(ms, k).toBeLessThan(VIEW_MS);
});
