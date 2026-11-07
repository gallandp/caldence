import { describe, expect, it } from 'vitest';
import { bump, releaseChangelog } from '../../scripts/version-bump.mjs';

describe('bump', () => {
  it('raises the minor version and resets the hotfix', () => {
    expect(bump('0.1.0', 'release:minor')).toBe('0.2.0');
  });
  it('raises the major version and resets the rest', () => {
    expect(bump('0.2.3', 'release:major')).toBe('1.0.0');
  });
  it('raises the hotfix version', () => {
    expect(bump('1.2.3', 'release:hotfix')).toBe('1.2.4');
  });
  it('treats a missing label as hotfix', () => {
    expect(bump('1.2.3', null)).toBe('1.2.4');
  });
  it('keeps the version for release:none', () => {
    expect(bump('1.2.3', 'release:none')).toBe('1.2.3');
  });
});

describe('releaseChangelog', () => {
  const log = '# Changelog\n\n## Unreleased\n\n- Added x\n\n## 0.1.0 – 2026-01-01\n\n- Old\n';
  it('moves Unreleased entries under the new version and leaves an empty Unreleased', () => {
    const r = releaseChangelog(log, '0.2.0', '2026-11-07');
    expect(r.changelog).toBe(
      '# Changelog\n\n## Unreleased\n\n## 0.2.0 – 2026-11-07\n\n- Added x\n\n## 0.1.0 – 2026-01-01\n\n- Old\n',
    );
    expect(r.notes).toBe('- Added x');
  });
});
