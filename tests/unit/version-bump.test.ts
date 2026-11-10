import { describe, expect, it } from 'vitest';
import { bump, highestLabel, releaseChangelog, versionNotes } from '../../scripts/version-bump.mjs';

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
  it('uses the fallback entries when Unreleased is empty (for example only Dependabot PRs)', () => {
    const empty = '# Changelog\n\n## Unreleased\n\n## 0.1.0 – 2026-01-01\n\n- Old\n';
    const r = releaseChangelog(empty, '0.1.1', '2026-11-10', '- Bump x (#5)');
    expect(r.changelog).toBe(
      '# Changelog\n\n## Unreleased\n\n## 0.1.1 – 2026-11-10\n\n### Changed\n\n- Bump x (#5)\n\n## 0.1.0 – 2026-01-01\n\n- Old\n',
    );
    expect(r.notes).toBe('### Changed\n\n- Bump x (#5)');
  });
  it('never writes an empty section, which Prettier would reject', () => {
    const empty = '# Changelog\n\n## Unreleased\n\n## 0.1.0 – 2026-01-01\n\n- Old\n';
    const r = releaseChangelog(empty, '0.1.1', '2026-11-10');
    expect(r.changelog).not.toMatch(/\n\n\n/);
    expect(r.notes).toBe('### Changed\n\n- Maintenance release without changes to the app.');
  });
  it('ignores the fallback when Unreleased has entries', () => {
    expect(releaseChangelog(log, '0.2.0', '2026-11-07', '- Bump x (#5)').notes).toBe('- Added x');
  });
});

describe('highestLabel (release PR collects several merged PRs)', () => {
  it('takes the largest bump', () => {
    expect(highestLabel(['release:hotfix', 'release:minor', 'release:none'])).toBe('release:minor');
    expect(highestLabel(['release:minor', 'release:major'])).toBe('release:major');
  });
  it('counts a PR without label as hotfix', () => {
    expect(highestLabel(['release:none', 'none-given'])).toBe('release:hotfix');
  });
  it('is release:none when nothing is released', () => {
    expect(highestLabel(['release:none'])).toBe('release:none');
    expect(highestLabel([])).toBe('release:none');
  });
});

describe('versionNotes', () => {
  const log =
    '# Changelog\n\n## Unreleased\n\n## 1.1.0 – 2026-11-10\n\n### Security\n\n- A\n\n## 1.0.2 – 2026-11-10\n\n- B\n';
  it('returns the section of a released version', () => {
    expect(versionNotes(log, '1.1.0')).toBe('### Security\n\n- A');
    expect(versionNotes(log, '1.0.2')).toBe('- B');
  });
  it('throws for a version without section', () => {
    expect(() => versionNotes(log, '9.9.9')).toThrow();
  });
});
