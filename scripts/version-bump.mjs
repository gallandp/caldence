// Version helper for the release workflow.
// Library: bump(), releaseChangelog(), highestLabel(), versionNotes().
// CLI: node scripts/version-bump.mjs <label|none-given> [date]   bumps package.json and CHANGELOG.md
//      (adds release-changes.md, if present, to the Unreleased entries)
//      node scripts/version-bump.mjs changes < prs.json          writes release-changes.md
//      node scripts/version-bump.mjs level < labels.txt          prints the largest bump of the labels
//      node scripts/version-bump.mjs notes <version>             writes release-notes.md
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Next Major.Minor.Hotfix version for a PR label. No label counts as hotfix. */
export function bump(version, label) {
  if (label === 'release:none') return version;
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`Invalid version: ${version}`);
  }
  const [major, minor, hotfix] = parts;
  if (label === 'release:major') return `${major + 1}.0.0`;
  if (label === 'release:minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${hotfix + 1}`;
}

/** Changelog categories in the order they appear in a release. */
const CATEGORIES = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

/** Parses "### Category" headings and "- entry" lines into [category, entries[]] pairs. */
function parseSections(markdown) {
  const sections = new Map();
  let category = 'Changed';
  let last = null;
  for (const raw of markdown.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = /^###\s+(.+)$/.exec(line);
    if (heading) {
      category = heading[1].trim();
      last = null;
      continue;
    }
    const entry = /^\s*[-*]\s+(.+)$/.exec(line);
    if (entry && !/^\s{2,}/.test(line)) {
      if (!sections.has(category)) sections.set(category, []);
      last = sections.get(category);
      last.push(entry[1].trim());
    } else if (line.trim() && last) {
      // A wrapped entry or a nested list line belongs to the entry above.
      last[last.length - 1] += ` ${line.trim().replace(/^[-*]\s+/, '')}`;
    }
  }
  return sections;
}

/** Joins changelog sections ("### Changed" with "- " entries), keeping the usual category order. */
export function mergeSections(...markdowns) {
  const all = new Map();
  for (const md of markdowns) {
    for (const [category, entries] of parseSections(md)) {
      all.set(category, [...(all.get(category) ?? []), ...entries]);
    }
  }
  const known = CATEGORIES.filter((c) => all.has(c));
  const other = [...all.keys()].filter((c) => !CATEGORIES.includes(c));
  return [...known, ...other]
    .map(
      (c) =>
        `### ${c}\n\n${all
          .get(c)
          .map((e) => `- ${e}`)
          .join('\n')}`,
    )
    .join('\n\n');
}

/** The "## Changelog" section of a PR description, up to the next "#" or "##" heading. */
export function changelogSection(body) {
  const lines = (body ?? '').split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+changelog\s*$/i.test(l.trim()));
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,2}\s/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/**
 * Changelog entries of the PRs merged since the last release, as sections. A PR gives the
 * entries in its "## Changelog" section, or else its title under "Changed". A PR that still
 * wrote its entry into CHANGELOG.md (`editedChangelog`) adds nothing, as does a Dependabot PR's
 * body (its release notes are not ours). Each entry names the PR, unless it already does.
 */
export function prChanges(prs) {
  const parts = prs.map((pr) => {
    if (pr.editedChangelog) return '';
    const ref = `#${pr.number}`;
    const tag = (e) => (new RegExp(`${escapeRegExp(ref)}\\b`).test(e) ? e : `${e} (${ref})`);
    const body = pr.author === 'dependabot[bot]' ? '' : changelogSection(pr.body);
    const sections = parseSections(body);
    if (sections.size === 0) return `### Changed\n\n- ${tag(pr.title.trim())}`;
    return [...sections]
      .map(([c, entries]) => `### ${c}\n\n${entries.map((e) => `- ${tag(e)}`).join('\n')}`)
      .join('\n\n');
  });
  return mergeSections(...parts);
}

/**
 * Moves the Unreleased entries under a new version heading; returns new text and the notes.
 * `changes` (sections built from the merged PRs, see prChanges) are added to them. With
 * neither, a short default becomes a "Changed" section.
 */
export function releaseChangelog(changelog, version, date, changes = '') {
  const heading = '## Unreleased';
  const start = changelog.indexOf(heading);
  if (start === -1) throw new Error('CHANGELOG.md has no "## Unreleased" section');
  const bodyStart = start + heading.length;
  const next = changelog.indexOf('\n## ', bodyStart);
  const end = next === -1 ? changelog.length : next + 1;
  const found = changelog.slice(bodyStart, end).trim();
  const extra = changes.trim();
  const notes =
    (extra ? mergeSections(found, extra) : found) ||
    '### Changed\n\n- Maintenance release without changes to the app.';
  const rest = changelog.slice(end);
  const released = `## ${version} – ${date}\n\n${notes}\n`;
  const head = changelog.slice(0, start);
  const changelogOut = `${head}${heading}\n\n${released}${rest ? `\n${rest}` : ''}`;
  return { changelog: changelogOut, notes };
}

const ORDER = ['release:none', 'release:hotfix', 'release:minor', 'release:major'];

/** The largest bump among the labels of several merged PRs; a PR without label counts as hotfix. */
export function highestLabel(labels) {
  let best = 0;
  for (const raw of labels) {
    const i = ORDER.indexOf(raw);
    best = Math.max(best, i === -1 ? 1 : i);
  }
  return ORDER[best];
}

/** Escapes every regex special character, so a string matches literally. */
export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The changelog section of a released version, without its heading. */
export function versionNotes(changelog, version) {
  const m = new RegExp(`\\n## ${escapeRegExp(version)} [^\\n]*\\n`).exec(changelog);
  if (!m) throw new Error(`CHANGELOG.md has no section for ${version}`);
  const start = m.index + m[0].length;
  const next = changelog.indexOf('\n## ', start);
  return changelog.slice(start, next === -1 ? changelog.length : next).trim();
}

function main(argv) {
  if (argv[2] === 'level') {
    const labels = readFileSync(0, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    console.log(highestLabel(labels));
    return;
  }
  if (argv[2] === 'changes') {
    const prs = JSON.parse(readFileSync(0, 'utf8'));
    writeFileSync('release-changes.md', `${prChanges(prs)}\n`);
    return;
  }
  if (argv[2] === 'notes') {
    writeFileSync(
      'release-notes.md',
      `${versionNotes(readFileSync('CHANGELOG.md', 'utf8'), argv[3])}\n`,
    );
    return;
  }
  const raw = argv[2];
  const label = raw && raw !== 'null' ? raw : null;
  const date = argv[3] ?? new Date().toISOString().slice(0, 10);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const next = bump(pkg.version, label);
  const changed = next !== pkg.version;
  if (changed) {
    pkg.version = next;
    writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
    // Entries of the merged PRs, written by the release workflow (`changes`).
    const fallback = existsSync('release-changes.md')
      ? readFileSync('release-changes.md', 'utf8')
      : '';
    const { changelog, notes } = releaseChangelog(
      readFileSync('CHANGELOG.md', 'utf8'),
      next,
      date,
      fallback,
    );
    writeFileSync('CHANGELOG.md', changelog);
    writeFileSync('release-notes.md', `${notes}\n`);
  }
  const out = `version=${next}\nchanged=${changed}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, out);
  console.log(out.trim());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv);
