import { describe, expect, it } from 'vitest';
import example from '../../src/data/examples/example.caldence.json';
import { renameOrganisation } from '../../src/core/edit';
import { capacity } from '../../src/core/load';
import {
  areasInScope,
  emptyWorkspace,
  hasOrgLevel,
  ORG_UNIT,
  orgName,
  unitLoadIds,
  unitTeamIds,
  type Workspace,
} from '../../src/core/model';
import { validate } from '../../src/core/validate';
import { scopeUnits } from '../../src/core/views';
import '../../src/i18n';
import { levelParams, levelWords } from '../../src/i18n/levels';

const ws = () => structuredClone(example) as unknown as Workspace;

describe('organisation level (#313)', () => {
  it('loads files without and with an organisation', () => {
    expect(validate(ws()).ok).toBe(true);
    expect(validate({ ...ws(), organisation: { name: 'Nordwind' } }).ok).toBe(true);
    const bad = validate({ ...ws(), organisation: { name: 3 } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]?.path).toBe('organisation.name');
    expect(validate({ ...ws(), organisation: 'Nordwind' }).ok).toBe(false);
  });

  it('is named, and an empty name gives the level word back', () => {
    const named = renameOrganisation(ws(), '  Nordwind GmbH ');
    expect(named.ok && named.value.organisation).toEqual({ name: 'Nordwind GmbH' });
    if (!named.ok) return;
    expect(orgName(named.value, 'Organisation')).toBe('Nordwind GmbH');
    const cleared = renameOrganisation(named.value, ' ');
    expect(cleared.ok && 'organisation' in cleared.value).toBe(false);
    expect(orgName(ws(), 'Organisation')).toBe('Organisation');
  });

  it('is a choice once there is an area or a second team', () => {
    const empty = emptyWorkspace('2026-11-18');
    expect(hasOrgLevel(empty)).toBe(false);
    expect(hasOrgLevel(ws())).toBe(true);
    const oneTeam = ws();
    oneTeam.teams = oneTeam.teams.slice(0, 1);
    oneTeam.areas = [];
    expect(hasOrgLevel(oneTeam)).toBe(false);
  });

  it('stands for every team and area', () => {
    const w = ws();
    const teams = w.teams.map((t) => t.id);
    expect(unitTeamIds(w, ORG_UNIT)).toEqual(teams);
    expect(unitLoadIds(w, ORG_UNIT)).toEqual([...teams, ...w.areas.map((a) => a.id), ORG_UNIT]);
    expect(areasInScope(w, { teamId: ORG_UNIT }).map((a) => a.id)).toEqual(
      w.areas.map((a) => a.id),
    );
    expect(scopeUnits(w, { teamId: ORG_UNIT }).length).toBe(scopeUnits(w, {}).length);
    for (const p of w.people)
      expect(capacity(w, p.id, ORG_UNIT)).toBe(capacity(w, p.id, undefined));
    expect(validate({ ...w, organisation: { name: '  ' } }).ok).toBe(false);
  });

  it('can never be a team or area id', () => {
    const w = ws();
    w.teams[0]!.id = ORG_UNIT;
    expect(validate(w).ok).toBe(false);
  });
});

describe('organisation level names', () => {
  it('is "Organisation" for every preset', () => {
    expect(levelWords(undefined, 'de').org).toBe('Organisation');
    expect(levelWords({ preset: 'platform' }, 'en').org).toBe('Organisation');
    expect(levelWords(undefined, 'en').orgLc).toBe('organisation');
  });

  it('takes an own name for the top level, optional', () => {
    const w = levelWords({ organisation: 'Unternehmen', area: 'Cluster', team: 'Squad' }, 'de');
    expect(levelParams(w).levelOrg).toBe('Unternehmen');
    expect(levelWords({ area: 'Cluster', team: 'Squad' }, 'de').org).toBe('Organisation');
    const s = (levelNames: unknown) => {
      const x = ws();
      return validate({ ...x, settings: { ...x.settings, levelNames } }).ok;
    };
    expect(s({ organisation: 'Konzern', area: 'Cluster', team: 'Squad' })).toBe(true);
    expect(s({ organisation: ' ', area: 'Cluster', team: 'Squad' })).toBe(false);
  });
});
