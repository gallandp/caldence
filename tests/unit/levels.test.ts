import { describe, expect, it } from 'vitest';
import { emptyWorkspace } from '../../src/core/model';
import { validate } from '../../src/core/validate';
import { t } from '../../src/i18n';
import { levelParams, levelWords } from '../../src/i18n/levels';

describe('levelWords', () => {
  it('defaults to Bereich/Team and Area/Team', () => {
    const de = levelWords(undefined, 'de');
    expect([de.area, de.team, de.teams, de.inTeam]).toEqual([
      'Bereich',
      'Team',
      'Teams',
      'im Team',
    ]);
    const en = levelWords(undefined, 'en');
    expect([en.area, en.teamLc, en.teamsLc, en.inTeam]).toEqual([
      'Area',
      'team',
      'teams',
      'in the team',
    ]);
  });

  it('uses the words of each preset', () => {
    const p = levelWords({ preset: 'platform' }, 'de');
    expect([p.area, p.team, p.teams, p.inTeam]).toEqual([
      'Plattform',
      'Produkt',
      'Produkte',
      'im Produkt',
    ]);
    expect(levelWords({ preset: 'chapter' }, 'de').inTeam).toBe('in der Unit');
  });

  it('uses own names as typed, in phrases without articles', () => {
    const w = levelWords({ area: 'Cluster', team: 'Squad' }, 'de');
    expect([w.area, w.teams, w.inTeam]).toEqual(['Cluster', 'Squad', 'auf Ebene Squad']);
    expect(levelParams(w).levelTeam).toBe('Squad');
  });

  it('fills level placeholders that a text uses, own params first', () => {
    const fallback = levelParams(levelWords({ preset: 'platform' }, 'en'));
    expect(t('en', 'team.add', undefined, fallback)).toBe(
      t('en', 'team.add', { levelTeamLc: 'product' }),
    );
    expect(t('en', 'app.version', { version: '1' }, { version: '2' })).toBe('Version 1');
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
    expect(!b.ok && b.errors).toEqual([
      { path: 'settings.levelNames.team', key: 'error.required' },
    ]);
  });
});
