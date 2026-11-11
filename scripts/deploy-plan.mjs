// Turns an unpacked release and the file list of the previous deployment into an sftp batch.
// Used by .github/workflows/deploy.yml; plain Node without dependencies, so the deploy job
// never runs npm.
//
//   node scripts/deploy-plan.mjs <site-dir> [<old-list-file>] > batch.txt
//
// Writes the new list (and a pending list used during the run) into <site-dir> and prints the
// batch. Run the batch with the working directory <site-dir>, after "cd" into the web folder.
//
// The list on the server names the files of the current release, then, after KEPT_HEADER, the
// files of the release before. Those stay one more deployment, so a browser that still runs the
// previous version (or its service worker, still caching it) finds every file it asks for.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIST_FILE = '.caldence-deploy-files';
// Uploaded as LIST_FILE before stale files are deleted, so a run cut off midway leaves a list
// that still names them, and the next run deletes them.
export const PENDING_FILE = '.caldence-deploy-files.pending';
export const KEPT_HEADER = '# kept from the previous release';
// Uploaded last, so nobody loads an index.html that points at files not yet there.
export const ENTRY_POINTS = ['index.html', 'sw.js', 'manifest.webmanifest'];
// Belong to the operator: never uploaded, overwritten or deleted.
export const PROTECTED = ['imprint.html', 'privacy.html'];

const SAFE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const OWN = [LIST_FILE, PENDING_FILE];

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

/** @returns {{ current: string[], kept: string[] }} */
export function parseList(text) {
  const current = [];
  const kept = [];
  let target = current;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line === KEPT_HEADER) target = kept;
    else target.push(checkPath(line));
  }
  return { current, kept };
}

export function formatList(current, kept) {
  return [...current, ...(kept.length ? [KEPT_HEADER, ...kept] : [])].join('\n') + '\n';
}

/**
 * @param {string[]} files files of the new release, relative, with "/"
 * @param {{ current: string[], kept: string[] } | null} old list of the previous deployment,
 *   or null on the first one
 * @returns {{ batch: string[], list: string, pending: string | null }}
 */
export function plan(files, old) {
  files.forEach(checkPath);
  old?.current.forEach(checkPath);
  old?.kept.forEach(checkPath);
  for (const file of files) {
    if (PROTECTED.includes(file) || OWN.includes(file)) {
      throw new Error(`The release must not contain ${file}`);
    }
  }
  const sorted = [...files].sort();
  const fresh = new Set(sorted);
  const never = new Set([...PROTECTED, ...OWN]);
  const kept = [...new Set(old?.current ?? [])].filter((f) => !fresh.has(f) && !never.has(f));
  const keptSet = new Set(kept);
  const stale = [...new Set(old?.kept ?? [])]
    .filter((f) => !fresh.has(f) && !keptSet.has(f) && !never.has(f))
    .sort();
  kept.sort();

  const liveDirs = new Set([...sorted, ...kept].flatMap(parents));
  const dirs = [...new Set(sorted.flatMap(parents))].sort();
  // Deepest first, so a folder is empty before its parent is removed.
  const staleDirs = [...new Set(stale.flatMap(parents))]
    .filter((d) => !liveDirs.has(d))
    .sort((a, b) => b.split('/').length - a.split('/').length || a.localeCompare(b));

  const quote = (p) => `"${p}"`;
  const put = (local, remote = local) => `put ${quote(local)} ${quote(remote)}`;
  const entry = sorted.filter((f) => ENTRY_POINTS.includes(f));
  const rest = sorted.filter((f) => !ENTRY_POINTS.includes(f));
  const batch = [
    // "-" ignores the error when the folder exists already.
    ...dirs.map((d) => `-mkdir ${quote(d)}`),
    ...rest.map((f) => put(f)),
    ...entry.map((f) => put(f)),
  ];
  if (stale.length) {
    batch.push(
      put(PENDING_FILE, LIST_FILE),
      ...stale.map((f) => `-rm ${quote(f)}`),
      ...staleDirs.map((d) => `-rmdir ${quote(d)}`),
    );
  }
  batch.push(put(LIST_FILE));
  return {
    batch,
    list: formatList(sorted, kept),
    pending: stale.length ? formatList(sorted, [...kept, ...stale].sort()) : null,
  };
}

export function listFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .filter((f) => !OWN.includes(f))
    .sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [siteDir, oldListFile] = process.argv.slice(2);
  if (!siteDir) {
    console.error('Usage: node scripts/deploy-plan.mjs <site-dir> [<old-list-file>]');
    process.exit(2);
  }
  const dir = resolve(siteDir);
  const old =
    oldListFile && existsSync(oldListFile) ? parseList(readFileSync(oldListFile, 'utf8')) : null;
  const { batch, list, pending } = plan(listFiles(dir), old);
  writeFileSync(join(dir, LIST_FILE), list);
  if (pending) writeFileSync(join(dir, PENDING_FILE), pending);
  process.stdout.write(batch.join('\n') + '\n');
}
