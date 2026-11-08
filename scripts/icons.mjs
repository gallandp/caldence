// Renders the SVG icons in public/icons to the PNG icons. Run with `npm run icons`; PNGs are committed.
// icon.svg is the logo with rounded corners; maskable.svg is full bleed with the glyph inside the safe zone.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const icons = (name) => fileURLToPath(new URL(`../public/icons/${name}`, import.meta.url));
const local = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(local) ? { executablePath: local } : {});

const targets = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['maskable.svg', 'maskable-512.png', 512],
];
for (const [source, name, size] of targets) {
  const svg = readFileSync(icons(source), 'utf8');
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: icons(name), omitBackground: true });
  await page.close();
}
await browser.close();
