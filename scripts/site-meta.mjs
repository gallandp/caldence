// Adds the parts of the page metadata that name the site's own address (#136): canonical link,
// og:url, the absolute preview image and JSON-LD. The release ZIP names no domain, so copies
// hosted elsewhere never point at caldence.de; deploy.yml runs this on the unpacked release.
// Plain Node without dependencies, like deploy-plan.mjs.
//
//   node scripts/site-meta.mjs <site-dir> <base-url>     base URL ends in "/", e.g. https://caldence.de/
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MARKER = '<!-- site-meta -->';
export const PREVIEW = 'social-preview.png';
const DESCRIPTION =
  'Plan the recurring meetings of agile teams (Scrum, Kanban, SAFe) and export them to Outlook, Google or Apple Calendar. Free, open source, private.';

export function checkBase(base) {
  if (!/^https:\/\/[a-z0-9.-]+(\/[A-Za-z0-9._~-]+)*\/$/.test(base))
    throw new Error(`Not an https base URL ending in "/": ${JSON.stringify(base)}`);
  return base;
}

/** The tags for <head>; base is checked, so it needs no HTML escaping. */
export function headTags(base) {
  checkBase(base);
  const image = base + PREVIEW;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Caldence',
    description: DESCRIPTION,
    url: base,
    image,
    screenshot: image,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web browser',
    inLanguage: ['en', 'de'],
    isAccessibleForFree: true,
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    sameAs: ['https://github.com/gallandp/caldence'],
  };
  // A JSON-LD block is data, not script, so script-src does not apply to it.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return [
    MARKER,
    `<link rel="canonical" href="${base}" />`,
    `<meta property="og:url" content="${base}" />`,
    `<meta property="og:image" content="${image}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta property="og:image:alt" content="Caldence month view with the meetings of a team" />',
    `<meta name="twitter:image" content="${image}" />`,
    `<script type="application/ld+json">${json}</script>`,
  ]
    .map((line) => `    ${line}\n`)
    .join('');
}

export function addHeadTags(html, base) {
  if (html.includes(MARKER)) throw new Error('index.html already has the site metadata');
  if (!html.includes('</head>')) throw new Error('index.html has no </head>');
  return html.replace(/\s*<\/head>/, `\n${headTags(base)}  </head>`);
}

export function apply(dir, base) {
  const index = join(dir, 'index.html');
  writeFileSync(index, addHeadTags(readFileSync(index, 'utf8'), base));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, base] = process.argv.slice(2);
  if (!dir || !base) {
    console.error('Usage: node scripts/site-meta.mjs <site-dir> <base-url>');
    process.exit(1);
  }
  apply(dir, base);
  console.log(`Added the site metadata for ${base}`);
}
