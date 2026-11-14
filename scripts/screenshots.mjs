// Takes the README screenshots from the built app. Run `npm run build` first, then `npm run screenshots`.
// Usage: node scripts/screenshots.mjs [--out <dir>]  (default: docs/screenshots)
// Also writes public/social-preview.png, the 1200×630 link preview (og:image, #136).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
if (outIndex >= 0 && !args[outIndex + 1]) throw new Error('--out needs a directory');
const out = resolve(outIndex >= 0 ? args[outIndex + 1] : `${root}docs/screenshots`);
mkdirSync(out, { recursive: true });

const NOW = new Date('2027-01-13T09:00:00');
const tabNames = {
  calendar: { en: 'Calendar', de: 'Kalender' },
  load: { en: 'Load', de: 'Auslastung' },
  meetings: { en: 'Meetings & cadence', de: 'Termine & Takt' },
  templates: { en: 'Templates', de: 'Vorlagen' },
  exchange: { en: 'Import / Export', de: 'Import / Export' },
  help: { en: 'Help', de: 'Hilfe' },
};
const horizon = { en: 'Horizon', de: 'Zeitraum' };
const openExample = { en: 'Open the example', de: 'Das Beispiel öffnen' };
const person = { en: 'Person', de: 'Person' };

function freePort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.on('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`vite preview did not answer at ${url}`);
}

async function shoot(
  browser,
  base,
  { name, locale, dark = false, steps, path = `${out}/${name}.png`, social = false },
) {
  const context = await browser.newContext({
    viewport: social ? { width: 1200, height: 630 } : { width: 1280, height: 800 },
    deviceScaleFactor: social ? 1 : 2,
    locale: locale === 'de' ? 'de-DE' : 'en-US',
    colorScheme: dark ? 'dark' : 'light',
  });
  try {
    const page = await context.newPage();
    await page.clock.setFixedTime(NOW);
    await page.goto(base);
    await page.getByLabel(/Language|Sprache/).selectOption(locale);
    await page.locator(`html[lang="${locale}"]`).waitFor();
    await steps(page, locale);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path });
    console.log(path);
  } finally {
    await context.close();
  }
}

const withExample = (view, extra) => async (page, l) => {
  await page.getByRole('button', { name: openExample[l] }).click();
  await page.getByRole('tab', { name: tabNames.calendar[l], exact: true }).waitFor();
  await page.getByRole('grid').waitFor();
  if (view !== 'calendar') {
    await page.getByRole('tab', { name: tabNames[view][l], exact: true }).click();
    await page.getByRole('tabpanel', { name: tabNames[view][l] }).waitFor();
  }
  if (extra) await extra(page, l);
};

const shots = [
  {
    view: 'start',
    steps: async (page) => page.getByRole('heading', { level: 3 }).first().waitFor(),
  },
  {
    view: 'calendar',
    dark: true,
    steps: withExample('calendar', async (page) => {
      await page.locator('td[data-date="2027-01-13"]').click();
    }),
  },
  {
    // The calendar's Horizon level: one row per week.
    view: 'weeks',
    steps: withExample('calendar', async (page, l) => {
      await page.getByRole('button', { name: horizon[l], exact: true }).click();
      await page.getByRole('table').waitFor();
    }),
  },
  {
    view: 'load',
    steps: withExample('load', async (page, l) => {
      await page.getByLabel(person[l], { exact: true }).selectOption({ label: 'Alex' });
      await page.getByRole('table').first().waitFor();
    }),
  },
  {
    view: 'meetings',
    steps: withExample('meetings', (page) => page.getByRole('table').first().waitFor()),
  },
  { view: 'templates', steps: withExample('templates') },
  { view: 'exchange', steps: withExample('exchange') },
  { view: 'help', steps: withExample('help') },
];

const port = await freePort();
const preview = spawn(
  process.execPath,
  [
    `${root}node_modules/vite/bin/vite.js`,
    'preview',
    '--port',
    String(port),
    '--strictPort',
    '--host',
    '127.0.0.1',
  ],
  { cwd: root, stdio: 'ignore' },
);
const stop = () => preview.kill();
process.on('exit', stop);
let browser;
try {
  const local = '/opt/pw-browsers/chromium';
  browser = await chromium.launch(existsSync(local) ? { executablePath: local } : {});
  const base = `http://127.0.0.1:${port}/`;
  await waitFor(base);
  for (const locale of ['en', 'de']) {
    for (const { view, steps, dark } of shots) {
      await shoot(browser, base, { name: `${view}-${locale}`, locale, steps });
      if (dark && locale === 'en')
        await shoot(browser, base, { name: `${view}-${locale}-dark`, locale, dark, steps });
    }
  }
  const calendar = shots.find((s) => s.view === 'calendar');
  await shoot(browser, base, {
    name: 'social-preview',
    locale: 'en',
    steps: calendar.steps,
    path: `${root}public/social-preview.png`,
    social: true,
  });
} finally {
  await browser?.close();
  stop();
}
