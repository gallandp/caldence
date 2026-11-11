import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KEPT_HEADER, checkPath, listFiles, parseList, plan } from '../../scripts/deploy-plan.mjs';

const release = [
  '.htaccess',
  'assets/index-abc.js',
  'assets/index-abc.css',
  'icons/icon-192.png',
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'workbox-123.js',
];

const LIST = 'put ".caldence-deploy-files" ".caldence-deploy-files"';
const PENDING = 'put ".caldence-deploy-files.pending" ".caldence-deploy-files"';

const at = (batch: string[], line: string) => {
  const i = batch.indexOf(line);
  expect(i, line).toBeGreaterThanOrEqual(0);
  return i;
};
const removed = (batch: string[]) => batch.filter((l) => l.startsWith('-rm '));

describe('plan', () => {
  it('uploads assets first, then the entry points, then the list', () => {
    const { batch } = plan(release, null);
    const asset = at(batch, 'put "assets/index-abc.js" "assets/index-abc.js"');
    const html = at(batch, 'put "index.html" "index.html"');
    const sw = at(batch, 'put "sw.js" "sw.js"');
    expect(at(batch, '-mkdir "assets"')).toBeLessThan(asset);
    expect(asset).toBeLessThan(html);
    expect(asset).toBeLessThan(sw);
    expect(batch.at(-1)).toBe(LIST);
  });

  it('deletes nothing on the first deployment', () => {
    const { batch, list, pending } = plan(release, null);
    expect(removed(batch)).toEqual([]);
    expect(pending).toBeNull();
    expect(parseList(list)).toEqual({ current: [...release].sort(), kept: [] });
  });

  it('keeps the files of the previous release one more deployment', () => {
    const old = { current: [...release, 'assets/index-old.js'], kept: [] };
    const { batch, list } = plan(release, old);
    expect(removed(batch)).toEqual([]);
    expect(parseList(list).kept).toEqual(['assets/index-old.js']);
  });

  it('then deletes them, after a list that still names them', () => {
    const old = { current: release, kept: ['assets/index-old.js', 'old/deep/file.js'] };
    const { batch, list, pending } = plan(release, old);
    const pendingAt = at(batch, PENDING);
    expect(at(batch, '-rm "assets/index-old.js"')).toBeGreaterThan(pendingAt);
    expect(at(batch, '-rmdir "old/deep"')).toBeLessThan(at(batch, '-rmdir "old"'));
    expect(batch).not.toContain('-rmdir "assets"');
    expect(batch.at(-1)).toBe(LIST);
    expect(parseList(pending!).kept).toEqual(['assets/index-old.js', 'old/deep/file.js']);
    expect(parseList(list).kept).toEqual([]);
  });

  it('does not delete a kept file that the new release brings back', () => {
    const old = { current: ['index.html'], kept: ['assets/index-abc.js'] };
    expect(removed(plan(release, old).batch)).toEqual([]);
  });

  it('keeps a folder that still holds kept files', () => {
    const old = { current: ['index.html', 'x/b.js'], kept: ['x/a.js'] };
    const { batch } = plan(['index.html'], old);
    expect(batch).toContain('-rm "x/a.js"');
    expect(batch).not.toContain('-rmdir "x"');
  });

  it('never deletes the imprint, the privacy page or the list', () => {
    const own = ['imprint.html', 'privacy.html', '.caldence-deploy-files'];
    const { batch } = plan(release, { current: own, kept: own });
    expect(removed(batch)).toEqual([]);
  });

  it('refuses a release that contains an imprint', () => {
    expect(() => plan([...release, 'imprint.html'], null)).toThrow(/imprint\.html/);
    expect(() => plan([...release, 'privacy.html'], null)).toThrow(/privacy\.html/);
  });

  it('refuses unsafe paths in the release and in the old list', () => {
    expect(() => plan(['../x.js'], null)).toThrow(/Unsafe/);
    expect(() => plan(release, { current: ['assets/../../x'], kept: [] })).toThrow(/Unsafe/);
    expect(() => parseList(`index.html\n${KEPT_HEADER}\n/etc/passwd\n`)).toThrow(/Unsafe/);
    expect(() => checkPath('a "b".js')).toThrow(/Unsafe/);
    expect(() => checkPath('a\nrm x')).toThrow(/Unsafe/);
  });
});

describe('listFiles', () => {
  it('lists files with "/" and without the deploy lists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'deploy-plan-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '');
    writeFileSync(join(dir, '.htaccess'), '');
    writeFileSync(join(dir, 'assets', 'a.js'), '');
    writeFileSync(join(dir, '.caldence-deploy-files'), '');
    writeFileSync(join(dir, '.caldence-deploy-files.pending'), '');
    expect(listFiles(dir)).toEqual(['.htaccess', 'assets/a.js', 'index.html']);
  });
});
