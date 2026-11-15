import { describe, expect, it } from 'vitest';
import { levelParams, levelWords } from '../../src/core/levels';
import { emptyWorkspace } from '../../src/core/model';
import { validate } from '../../src/core/validate';

describe('levelWords', () => {
  it('defaults to Bereich/Team and Area/Team', () => {
    const de = levelWords({}, 'de');
    expect([de.area, de.team, de.teams, de.inArea, de.inTeam]).toEqual([
      'Bereich',
      'Team',
      'Teams',
      'im Bereich',
      'im Team',
    ]);
    expect([de.onlyArea, de.both, de.onlyTeam]).toEqual([
      'Nur im Bereich',
      'Im Team und im Bereich',
      'Nur im Team',
    ]);
    const en = levelWords({}, 'en');
    expect([en.area, en.teamLc, en.teamsLc, en.onlyArea]).toEqual([
      'Area',
      'team',
      'teams',
      'Only in the area',
    ]);
  });

  it('uses the articles of each preset in German', () => {
    const p = levelWords({ levelNames: { preset: 'platform' } }, 'de');
    expect([p.area, p.team, p.teams, p.both]).toEqual([
      'Plattform',
      'Produkt',
      'Produkte',
      'Im Produkt und in der Plattform',
    ]);
    const c = levelWords({ levelNames: { preset: 'chapter' } }, 'de');
    expect(c.onlyTeam).toBe('Nur in der Unit');
  });

  it('uses own names without articles', () => {
    const w = levelWords({ levelNames: { area: 'Cluster', team: 'Squad' } }, 'de');
    expect([w.area, w.teams, w.inTeam, w.onlyArea]).toEqual([
      'Cluster',
      'Squad',
      'auf Ebene Squad',
      'Nur auf Ebene Cluster',
    ]);
    expect(levelParams(w).levelTeam).toBe('Squad');
  });
});

describe('settings.levelNames', () => {
  const withNames = (levelNames: unknown) => {
    const w = emptyWorkspace('2026-11-15');
    return { ...w, settings: { ...w.settings, levelNames } };
  };

  it('accepts a preset or two own names', () => {
    expect(validate(withNames({ preset: 'train' })).ok).toBe(true);
    expect(validate(withNames({ area: 'Cluster', team: 'Squad' })).ok).toBe(true);
  });

  it('rejects an unknown preset and empty own names', () => {
    const a = validate(withNames({ preset: 'tribe' }));
    expect(!a.ok && a.errors).toEqual([
      { path: 'settings.levelNames.preset', key: 'error.enum.invalid' },
    ]);
    const b = validate(withNames({ area: 'Cluster', team: ' ' }));
    expect(!b.ok && b.errors).toEqual([{ path: 'settings.levelNames.team', key: 'error.type' }]);
  });
});
