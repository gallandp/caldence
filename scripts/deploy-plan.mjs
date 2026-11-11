// Turns an unpacked release and the file list of the previous deployment into an sftp batch.
// Used by .github/workflows/deploy.yml; plain Node without dependencies, so the deploy job
// never runs npm.
//
//   node scripts/deploy-plan.mjs <site-dir> [<old-list-file>] > batch.txt
//
// Writes <site-dir>/.caldence-deploy-files (the new list) and prints the batch. Run the batch
// with the working directory <site-dir>, after "cd" into the web folder.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export const LIST_FILE = '.caldence-deploy-files';
// Uploaded last, so nobody loads an index.html that points at files not yet there.
export const ENTRY_POINTS = ['index.html', 'registerSW.js', 'sw.js', 'manifest.webmanifest'];
// Belong to the operator: never uploaded, overwritten or deleted.
export const PROTECTED = ['imprint.html', 'privacy.html'];

const SAFE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

export function checkPath(path) {
  if (!SAFE.test(path) || path.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error(`Unsafe path: ${JSON.stringify(path)}`);
  }
  return path;
}

function parents(path) {
  const parts = path.split('/');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}

export function parseList(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(checkPath);
}

/**
 * @param {string[]} files files of the new release, relative, with "/"
 * @param {string[] | null} oldFiles list of the previous deployment, or null on the first one
 * @returns {string[]} sftp batch lines
 */
export function plan(files, oldFiles) {
  files.forEach(checkPath);
  (oldFiles ?? []).forEach(checkPath);
  for (const file of files) {
    if (PROTECTED.includes(file) || file === LIST_FILE) {
      throw new Error(`The release must not contain ${file}`);
    }
  }
  const sorted = [...files].sort();
  const dirs = [...new Set(sorted.flatMap(parents))].sort();
  const entry = sorted.filter((f) => ENTRY_POINTS.includes(f));
  const rest = sorted.filter((f) => !ENTRY_POINTS.includes(f));
  const keep = new Set([...files, ...PROTECTED, LIST_FILE]);
  const stale = (oldFiles ?? []).filter((f) => !keep.has(f)).sort();
  const keepDirs = new Set(dirs);
  // Deepest first, so a folder is empty before its parent is removed.
  const staleDirs = [...new Set(stale.flatMap(parents))]
    .filter((d) => !keepDirs.has(d))
    .sort((a, b) => b.split('/').length - a.split('/').length || a.localeCompare(b));

  const quote = (p) => `"${p}"`;
  return [
    // "-" ignores the error when the folder exists already.
    ...dirs.map((d) => `-mkdir ${quote(d)}`),
    ...rest.map((f) => `put ${quote(f)} ${quote(f)}`),
    ...entry.map((f) => `put ${quote(f)} ${quote(f)}`),
    `put ${quote(LIST_FILE)} ${quote(LIST_FILE)}`,
    ...stale.map((f) => `-rm ${quote(f)}`),
    ...staleDirs.map((d) => `-rmdir ${quote(d)}`),
  ];
}

export function listFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .filter((f) => f !== LIST_FILE)
    .sort();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [siteDir, oldListFile] = process.argv.slice(2);
  if (!siteDir) {
    console.error('Usage: node scripts/deploy-plan.mjs <site-dir> [<old-list-file>]');
    process.exit(2);
  }
  const dir = resolve(siteDir);
  const files = listFiles(dir);
  const oldFiles =
    oldListFile && existsSync(oldListFile) ? parseList(readFileSync(oldListFile, 'utf8')) : null;
  const batch = plan(files, oldFiles);
  writeFileSync(join(dir, LIST_FILE), files.join('\n') + '\n');
  process.stdout.write(batch.join('\n') + '\n');
}
