// Renders the SVG icons in public/icons to the PNG icons and public/favicon.ico (#137).
// Run with `npm run icons`; the outputs are committed.
// icon.svg is the logo with rounded corners; maskable.svg is full bleed with the glyph inside the safe zone.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
async function render(source, size) {
  const svg = readFileSync(icons(source), 'utf8');
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  const png = await page.screenshot({ omitBackground: true });
  await page.close();
  return png;
}

for (const [source, name, size] of targets) writeFileSync(icons(name), await render(source, size));

// favicon.ico for clients that ask for /favicon.ico: an ICO file holding PNG images.
const sizes = [16, 32, 48];
const pngs = [];
for (const size of sizes) pngs.push(await render('icon.svg', size));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const entry = 6 + 16 * i;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt16LE(1, entry + 4); // colour planes
  header.writeUInt16LE(32, entry + 6); // bits per pixel
  header.writeUInt32LE(pngs[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += pngs[i].length;
});
writeFileSync(
  fileURLToPath(new URL('../public/favicon.ico', import.meta.url)),
  Buffer.concat([header, ...pngs]),
);
await browser.close();
