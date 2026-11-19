import { describe, expect, it } from 'vitest';
import valid from '../fixtures/valid-workspace.json';
import type { LineLevel, Workspace } from '../../src/core/model';
import { lineKind, parentChoices, personCompanyId } from '../../src/core/lineStaff';
import {
  addLineUnit,
  newLineLevelId,
  setLineLevels,
  updateLineUnit,
} from '../../src/core/lineEdit';
import { lineLevels, lowestLineLevel } from '../../src/core/lineLevels';
import { validate } from '../../src/core/validate';
import '../../src/i18n';
import { levelWords, lineLevelWord } from '../../src/i18n/levels';

/** Velmora (invented): a group "Orvalis" with the line team "Orvalis Ware" below it, both derived. */
function lined(): Workspace {
  const ws = structuredClone(valid) as unknown as Workspace;
  ws.people.push({ id: 'p2', name: 'Ines', lineUnitId: 'l1' });
  ws.lineUnits = [
    { id: 'g1', name: 'Orvalis' },
    { id: 'l1', name: 'Orvalis Ware', parentId: 'g1' },
  ];
  return ws;
}

const ok = <T>(r: { ok: true; value: T } | { ok: false; errors: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

/** Five levels: company, division, specialist group, squad, line team. */
const five = (ws: Workspace): LineLevel[] => [
  ...lineLevels(ws.settings).slice(0, 1),
  { id: 'll1', name: 'Sparte' },
  ...lineLevels(ws.settings).slice(1, 2),
  { id: 'll2', name: 'Staffel' },
  ...lineLevels(ws.settings).slice(2),
];

describe('own line levels (#408)', () => {
  it('has the three built-in levels without a setting', () => {
    const ws = lined();
    expect(lineLevels(ws.settings).map((l) => l.id)).toEqual(['company', 'group', 'team']);
    expect(lowestLineLevel(ws.settings)).toBe('team');
    expect(validate(ws).ok).toBe(true);
  });

  it('stores every unit at the level it showed and moves the old names onto the levels', () => {
    const ws = lined();
    ws.settings.lineLevelNames = { group: 'Abteilung', team: 'Gruppe' };
    const w1 = ok(setLineLevels(ws, five(ws)));
    expect(w1.settings.lineLevelNames).toBeUndefined();
    expect(w1.settings.lineLevels).toEqual([
      { id: 'company', company: true },
      { id: 'll1', name: 'Sparte' },
      { id: 'group', name: 'Abteilung' },
      { id: 'll2', name: 'Staffel' },
      { id: 'team', name: 'Gruppe' },
    ]);
    expect(w1.lineUnits!.map((u) => u.kind)).toEqual(['group', 'team']);
    const w = levelWords(undefined, 'de', undefined, w1.settings.lineLevels);
    expect(lineLevelWord(w, 'll2')).toBe('Staffel');
    expect(lineLevelWord(w, 'company')).toBe('Gesellschaft');
    expect(w.lineTeam).toBe('Gruppe');
    expect(w.lineGroup).toBe('Abteilung');
  });

  it('allows a tree as deep as the levels, and no deeper', () => {
    const w1 = ok(setLineLevels(lined(), five(lined())));
    // company > Sparte > group > Staffel > team: five units deep.
    let [w, id] = ok(addLineUnit(w1, 'Nice-IT'));
    w = ok(updateLineUnit(w, id, { kind: 'company' }));
    const co = id;
    [w, id] = ok(addLineUnit(w, 'Nord', co));
    w = ok(updateLineUnit(w, id, { kind: 'll1' }));
    w = ok(updateLineUnit(w, 'g1', { parentId: id }));
    const [w3, squad] = ok(addLineUnit(w, 'Staffel Blau', 'g1'));
    w = w3;
    w = ok(updateLineUnit(w, squad, { kind: 'll2' }));
    w = ok(updateLineUnit(w, 'l1', { parentId: squad }));
    expect(validate(w).ok).toBe(true);
    // A sixth level below the line team is refused.
    expect(addLineUnit(w, 'Zu tief', 'l1').ok).toBe(false);
    // The company of a person five levels down comes from the company unit.
    const ines = w.people.find((p) => p.id === 'p2')!;
    expect(personCompanyId(w, ines)).toBe(w.lineUnits!.find((u) => u.id === co)!.companyId);
  });

  it('lets units skip levels but never sit below a lower level', () => {
    const w1 = ok(setLineLevels(lined(), five(lined())));
    // A line team directly under the specialist group skips "Staffel": fine.
    expect(validate(w1).ok).toBe(true);
    // A "Sparte" below the specialist group is the wrong way round.
    const [w2, id] = ok(addLineUnit(w1, 'Sparte Süd'));
    expect(updateLineUnit(w2, id, { kind: 'll1', parentId: 'g1' }).ok).toBe(false);
    // parentChoices offers only units above the chosen level.
    expect(parentChoices(w2, id, 'll1').map((u) => u.id)).toEqual([]);
    expect(parentChoices(w2, id, 'll2').map((u) => u.id)).toEqual(['g1']);
  });

  it('refuses to remove a level that units are on, and renames freely', () => {
    const w1 = ok(setLineLevels(lined(), five(lined())));
    const without = w1.settings.lineLevels!.filter((l) => l.id !== 'group');
    const refused = setLineLevels(w1, without);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.errors[0]!.key).toBe('error.line.levelInUse');
    const unused = w1.settings.lineLevels!.filter((l) => l.id !== 'll2');
    expect(ok(setLineLevels(w1, unused)).settings.lineLevels).toHaveLength(4);
  });

  it('validates own levels: named, unique, a company only at the top, at most eight', () => {
    const ws = lined();
    const bad = (levels: LineLevel[]) => {
      const w = structuredClone(ws);
      w.settings.lineLevels = levels;
      return validate(w).ok;
    };
    expect(bad([{ id: 'group' }, { id: 'team' }])).toBe(true);
    expect(bad([{ id: 'x1' }, { id: 'group' }, { id: 'team' }])).toBe(false);
    expect(
      bad([
        { id: 'group', name: 'A' },
        { id: 'team', name: 'a' },
      ]),
    ).toBe(false);
    expect(bad([{ id: 'group' }, { id: 'team', company: true }])).toBe(false);
    expect(bad([])).toBe(false);
    const nine = Array.from({ length: 9 }, (_, i) => ({ id: `x${i}`, name: `L${i}` }));
    expect(bad(nine)).toBe(false);
    // A unit on a level the file does not have.
    const w = structuredClone(ws);
    w.lineUnits![0]!.kind = 'nope';
    expect(validate(w).ok).toBe(false);
  });

  it('derives the level of units without one from the levels', () => {
    const ws = lined();
    ws.settings.lineLevels = [
      { id: 'a', name: 'Bereich' },
      { id: 'b', name: 'Gruppe' },
      { id: 'c', name: 'Team' },
    ];
    expect(lineKind(ws, 'g1')).toBe('b');
    expect(lineKind(ws, 'l1')).toBe('c');
    expect(newLineLevelId(ws)).toBe('ll1');
  });
});
