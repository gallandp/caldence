// Renders public/icons/icon.svg to the PNG icons. Run with `npm run icons`; PNGs are committed.
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const local = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(local) ? { executablePath: local } : {});

// scale < 1 leaves the maskable safe zone free of the rounded edge
const targets = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['maskable-512.png', 512, 1],
];
for (const [name, size] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname });
  await page.close();
}
await browser.close();
