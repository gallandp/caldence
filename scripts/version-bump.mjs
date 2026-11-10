// Version helper for the release workflow.
// Library: bump(), releaseChangelog(), highestLabel(), versionNotes().
// CLI: node scripts/version-bump.mjs <label|none-given> [date]   bumps package.json and CHANGELOG.md
//      node scripts/version-bump.mjs level < labels.txt          prints the largest bump of the labels
//      node scripts/version-bump.mjs notes <version>             writes release-notes.md
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
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

/** Moves the Unreleased entries under a new version heading; returns new text and the notes. */
export function releaseChangelog(changelog, version, date) {
  const heading = '## Unreleased';
  const start = changelog.indexOf(heading);
  if (start === -1) throw new Error('CHANGELOG.md has no "## Unreleased" section');
  const bodyStart = start + heading.length;
  const next = changelog.indexOf('\n## ', bodyStart);
  const end = next === -1 ? changelog.length : next + 1;
  const notes = changelog.slice(bodyStart, end).trim();
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

/** The changelog section of a released version, without its heading. */
export function versionNotes(changelog, version) {
  const m = new RegExp(`\\n## ${version.replace(/\./g, '\\.')} [^\\n]*\\n`).exec(changelog);
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
    const { changelog, notes } = releaseChangelog(readFileSync('CHANGELOG.md', 'utf8'), next, date);
    writeFileSync('CHANGELOG.md', changelog);
    writeFileSync('release-notes.md', `${notes}\n`);
  }
  const out = `version=${next}\nchanged=${changed}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, out);
  console.log(out.trim());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv);
