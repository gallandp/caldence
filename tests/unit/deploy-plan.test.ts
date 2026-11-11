import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkPath, listFiles, parseList, plan } from '../../scripts/deploy-plan.mjs';

const release = [
  '.htaccess',
  'assets/index-abc.js',
  'assets/index-abc.css',
  'icons/icon-192.png',
  'index.html',
  'manifest.webmanifest',
  'registerSW.js',
  'sw.js',
  'workbox-123.js',
];

const index = (batch: string[], line: string) => {
  const i = batch.indexOf(line);
  expect(i, line).toBeGreaterThanOrEqual(0);
  return i;
};

describe('plan', () => {
  it('uploads assets first, then the entry points, then the list', () => {
    const batch = plan(release, null);
    const asset = index(batch, 'put "assets/index-abc.js" "assets/index-abc.js"');
    const html = index(batch, 'put "index.html" "index.html"');
    const sw = index(batch, 'put "sw.js" "sw.js"');
    const list = index(batch, 'put ".caldence-deploy-files" ".caldence-deploy-files"');
    expect(index(batch, '-mkdir "assets"')).toBeLessThan(asset);
    expect(asset).toBeLessThan(html);
    expect(asset).toBeLessThan(sw);
    expect(Math.max(html, sw)).toBeLessThan(list);
    expect(batch.at(-1)).toBe('put ".caldence-deploy-files" ".caldence-deploy-files"');
  });

  it('deletes nothing on the first deployment', () => {
    expect(plan(release, null).filter((l) => l.startsWith('-rm'))).toEqual([]);
  });

  it('deletes stale files after the upload, and their empty folders', () => {
    const old = [...release, 'assets/index-old.js', 'old/deep/file.js'];
    const batch = plan(release, old);
    const list = index(batch, 'put ".caldence-deploy-files" ".caldence-deploy-files"');
    expect(index(batch, '-rm "assets/index-old.js"')).toBeGreaterThan(list);
    expect(index(batch, '-rmdir "old/deep"')).toBeLessThan(index(batch, '-rmdir "old"'));
    expect(batch).not.toContain('-rmdir "assets"');
    expect(batch).not.toContain('-rm "index.html"');
  });

  it('never deletes the imprint, the privacy page or the list', () => {
    const old = [...release, 'imprint.html', 'privacy.html', '.caldence-deploy-files'];
    const batch = plan(release, old).join('\n');
    expect(batch).not.toMatch(/rm "(imprint|privacy)\.html"/);
    expect(batch).not.toContain('-rm ".caldence-deploy-files"');
  });

  it('refuses a release that contains an imprint', () => {
    expect(() => plan([...release, 'imprint.html'], null)).toThrow(/imprint\.html/);
    expect(() => plan([...release, 'privacy.html'], null)).toThrow(/privacy\.html/);
  });

  it('refuses unsafe paths in the release and in the old list', () => {
    expect(() => plan(['../x.js'], null)).toThrow(/Unsafe/);
    expect(() => plan(release, ['assets/../../x'])).toThrow(/Unsafe/);
    expect(() => parseList('/etc/passwd\n')).toThrow(/Unsafe/);
    expect(() => checkPath('a "b".js')).toThrow(/Unsafe/);
    expect(() => checkPath('a\nrm x')).toThrow(/Unsafe/);
  });
});

describe('listFiles', () => {
  it('lists files with "/" and without the deploy list', () => {
    const dir = mkdtempSync(join(tmpdir(), 'deploy-plan-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '');
    writeFileSync(join(dir, '.htaccess'), '');
    writeFileSync(join(dir, 'assets', 'a.js'), '');
    writeFileSync(join(dir, '.caldence-deploy-files'), '');
    expect(listFiles(dir)).toEqual(['.htaccess', 'assets/a.js', 'index.html']);
  });
});
