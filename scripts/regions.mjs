// Generates the bundled region files of the German federal states (#23).
// Usage: node scripts/regions.mjs [--school <openholidays.json>]
//
// Public holidays come from the rules below (the holiday laws of the states). School holidays
// cannot be computed: they are kept from the existing files, or taken from a JSON file with the
// response of the OpenHolidays API (https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE
// &languageIsoCode=DE&validFrom=…&validTo=…), which someone with network access downloads first.
// See docs/region-format.md, "Adding or updating regions".
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const dir = fileURLToPath(new URL('../src/data/regions/', import.meta.url));
const args = process.argv.slice(2);
const schoolIndex = args.indexOf('--school');
if (schoolIndex >= 0 && !args[schoolIndex + 1]) throw new Error('--school needs a file');
const schoolFile = schoolIndex >= 0 ? args[schoolIndex + 1] : null;

const n = (de, en) => ({ de, en });
const fixed = (month, day, name) => ({ type: 'fixed', month, day, name });
const easter = (offset, name) => ({ type: 'easter', offset, name });

/** Holidays of every state, in the order of the year. */
const COMMON = {
  newYear: fixed(1, 1, n('Neujahr', "New Year's Day")),
  goodFriday: easter(-2, n('Karfreitag', 'Good Friday')),
  easterMonday: easter(1, n('Ostermontag', 'Easter Monday')),
  labour: fixed(5, 1, n('Tag der Arbeit', 'Labour Day')),
  ascension: easter(39, n('Christi Himmelfahrt', 'Ascension Day')),
  whitMonday: easter(50, n('Pfingstmontag', 'Whit Monday')),
  unity: fixed(10, 3, n('Tag der Deutschen Einheit', 'German Unity Day')),
  christmas: fixed(12, 25, n('1. Weihnachtstag', 'Christmas Day')),
  boxing: fixed(12, 26, n('2. Weihnachtstag', 'Boxing Day')),
};

/** Holidays only some states have (statewide only; local ones such as in parts of Bavaria are left out). */
const EXTRA = {
  epiphany: fixed(1, 6, n('Heilige Drei Könige', 'Epiphany')),
  womensDay: fixed(3, 8, n('Internationaler Frauentag', "International Women's Day")),
  easterSunday: easter(0, n('Ostersonntag', 'Easter Sunday')),
  whitSunday: easter(49, n('Pfingstsonntag', 'Whit Sunday')),
  corpusChristi: easter(60, n('Fronleichnam', 'Corpus Christi')),
  assumption: fixed(8, 15, n('Mariä Himmelfahrt', 'Assumption Day')),
  childrensDay: fixed(9, 20, n('Weltkindertag', "World Children's Day")),
  reformation: fixed(10, 31, n('Reformationstag', 'Reformation Day')),
  allSaints: fixed(11, 1, n('Allerheiligen', "All Saints' Day")),
  repentance: {
    type: 'special',
    id: 'repentance-day',
    name: n('Buß- und Bettag', 'Day of Repentance and Prayer'),
  },
};

/** The 16 states: id (ISO 3166-2 in lower case), names and their extra holidays. */
const STATES = [
  [
    'de-bw',
    n('Baden-Württemberg', 'Baden-Württemberg'),
    ['epiphany', 'corpusChristi', 'allSaints'],
  ],
  ['de-by', n('Bayern', 'Bavaria'), ['epiphany', 'corpusChristi', 'allSaints']],
  ['de-be', n('Berlin', 'Berlin'), ['womensDay']],
  ['de-bb', n('Brandenburg', 'Brandenburg'), ['easterSunday', 'whitSunday', 'reformation']],
  ['de-hb', n('Bremen', 'Bremen'), ['reformation']],
  ['de-hh', n('Hamburg', 'Hamburg'), ['reformation']],
  ['de-he', n('Hessen', 'Hesse'), ['corpusChristi']],
  [
    'de-mv',
    n('Mecklenburg-Vorpommern', 'Mecklenburg-Western Pomerania'),
    ['womensDay', 'reformation'],
  ],
  ['de-ni', n('Niedersachsen', 'Lower Saxony'), ['reformation']],
  ['de-nw', n('Nordrhein-Westfalen', 'North Rhine-Westphalia'), ['corpusChristi', 'allSaints']],
  ['de-rp', n('Rheinland-Pfalz', 'Rhineland-Palatinate'), ['corpusChristi', 'allSaints']],
  ['de-sl', n('Saarland', 'Saarland'), ['corpusChristi', 'assumption', 'allSaints']],
  ['de-sn', n('Sachsen', 'Saxony'), ['reformation', 'repentance']],
  ['de-st', n('Sachsen-Anhalt', 'Saxony-Anhalt'), ['epiphany', 'reformation']],
  ['de-sh', n('Schleswig-Holstein', 'Schleswig-Holstein'), ['reformation']],
  ['de-th', n('Thüringen', 'Thuringia'), ['childrensDay', 'reformation']],
];

/** Sort key of a rule: its day of the year, Easter taken as 5 April, Buß- und Bettag as 20 November. */
function order(rule) {
  const day = (month, d) => [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][month - 1] + d;
  if (rule.type === 'fixed') return day(rule.month, rule.day);
  if (rule.type === 'easter') return day(4, 5) + rule.offset;
  return day(11, 20);
}

/** No school holidays known: the coverage warning then says so for every planning horizon. */
const NOTHING_KNOWN = '2025-12-31';

/** English names of the usual German school holidays; others keep the German name. */
const SCHOOL_EN = {
  Winterferien: 'Winter break',
  Faschingsferien: 'Carnival break',
  Frühjahrsferien: 'Spring break',
  Osterferien: 'Easter break',
  Pfingstferien: 'Whitsun break',
  Sommerferien: 'Summer break',
  Herbstferien: 'Autumn break',
  Weihnachtsferien: 'Christmas break',
};

/** School holidays by state id from an OpenHolidays API response, or null. */
function readSchool(file) {
  if (!file) return null;
  const list = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(list)) throw new Error(`${file}: expected the API's list of holidays`);
  const byState = new Map();
  let skipped = 0;
  for (const h of list) {
    const de = (h.name ?? []).find((x) => x.language === 'DE')?.text;
    if (!h.startDate || !h.endDate) continue;
    if (!de) {
      skipped++;
      continue;
    }
    const word = Object.keys(SCHOOL_EN).find((k) => de.startsWith(k));
    const name = n(de, word ? SCHOOL_EN[word] : de);
    // Holidays of the whole country have no subdivisions; regional ones (some cities) are left out.
    const states = h.nationwide
      ? STATES.map(([id]) => id)
      : (h.subdivisions ?? [])
          .map((s) => String(s.code ?? '').toLowerCase())
          .filter((code) => STATES.some(([id]) => id === code));
    for (const id of states) {
      if (!byState.has(id)) byState.set(id, []);
      byState.get(id).push({ name, from: h.startDate, to: h.endDate });
    }
  }
  if (skipped > 0)
    console.warn(
      `${skipped} holidays have no German name and were left out: use languageIsoCode=DE.`,
    );
  return byState;
}

/** The region file as it is now, or null for a new region (read once, no separate check). */
function readExisting(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

const school = readSchool(schoolFile);
for (const [id, name, extras] of STATES) {
  const path = `${dir}${id}.json`;
  const old = readExisting(path);
  const holidays = [...Object.values(COMMON), ...extras.map((k) => EXTRA[k])].sort(
    (a, b) => order(a) - order(b),
  );
  let schoolHolidays = old?.schoolHolidays ?? [];
  let knownUntil = old?.schoolHolidaysKnownUntil ?? NOTHING_KNOWN;
  const fresh = school?.get(id);
  if (fresh?.length) {
    // New periods replace the old ones within the downloaded range only; the rest is kept, and
    // the date up to which school holidays are known never moves back.
    const start = fresh.map((s) => s.from).sort()[0];
    const end = fresh
      .map((s) => s.to)
      .sort()
      .at(-1);
    schoolHolidays = [...schoolHolidays.filter((s) => s.to < start || s.from > end), ...fresh].sort(
      (a, b) => (a.from < b.from ? -1 : 1),
    );
    if (end > knownUntil) knownUntil = end;
  }
  const region = { id, name, holidays, schoolHolidays, schoolHolidaysKnownUntil: knownUntil };
  writeFileSync(path, await format(JSON.stringify(region), { parser: 'json', printWidth: 100 }));
  console.log(path, `${schoolHolidays.length} school holiday periods until ${knownUntil}`);
}

const names = STATES.map(([id]) => [id, id.replace(/-(\w)/g, (_, c) => c.toUpperCase())]);
writeFileSync(
  `${dir}index.ts`,
  await format(
    `// Generated by scripts/regions.mjs; edit the script, not this file.
import { validateRegion } from '../../core/regionFile';
import type { Region } from '../../core/regions';
${names.map(([id, v]) => `import ${v} from './${id}.json';`).join('\n')}

function load(id: string, json: unknown): Region {
  const result = validateRegion(json);
  if (!result.ok) throw new Error(\`invalid region \${id}\`);
  return result.value;
}

export const REGIONS: Record<string, Region> = {
${names.map(([id, v]) => `  '${id}': load('${id}', ${v}),`).join('\n')}
};

export function regionIds(): string[] {
  return Object.keys(REGIONS);
}
`,
    { parser: 'typescript', singleQuote: true, printWidth: 100 },
  ),
);
