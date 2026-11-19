import { describe, expect, it } from 'vitest';
import valid from '../fixtures/valid-workspace.json';
import { addItem } from '../../src/core/edit';
import { addLineUnit, updateLineUnit, updateLinePerson } from '../../src/core/lineEdit';
import {
  LINE_ROOT,
  lineSelection,
  linePeople,
  lineUnitsById,
  ORG_UNIT,
  type Workspace,
} from '../../src/core/model';
import { staffRows } from '../../src/core/lineStaff';
import { buildMatrix } from '../../src/core/matrix';
import { structureSheets } from '../../src/core/structureSheets';
import { validate } from '../../src/core/validate';

const base = (): Workspace => ({ ...(valid as unknown as Workspace), lineName: 'Nice IT GmbH' });

/** The person dialog's flow: a new name, then the line fields. */
const addNew = (ws: Workspace, name: string, unitId: string) => {
  const [next, id] = addItem(ws, 'people', { name });
  return { id, result: updateLinePerson(next, id, { lineUnitId: unitId, contractFte: null }) };
};

describe('people directly at the line root', () => {
  it('adds a new person to the line root (the managing director)', () => {
    const { id, result } = addNew(base(), 'Hans Peter', ORG_UNIT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(linePeople(result.value, ORG_UNIT).has(id)).toBe(true);
    expect(staffRows(result.value, ORG_UNIT, []).map((r) => r.person.name)).toContain('Hans Peter');
  });

  it('adds a new person directly to a company unit at the top', () => {
    const made = addLineUnit(base(), 'Nice IT GmbH');
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const [ws1, unitId] = made.value;
    const company = updateLineUnit(ws1, unitId, { kind: 'company' });
    expect(company.ok).toBe(true);
    if (!company.ok) return;
    const { id, result } = addNew(company.value, 'Hans Peter', unitId);
    expect(result.ok).toBe(true);
    if (result.ok) expect(linePeople(result.value, unitId).has(id)).toBe(true);
  });

  it('shows people at the root as their own row of the matrix', () => {
    const { result } = addNew(base(), 'Hans Peter', ORG_UNIT);
    if (!result.ok) throw new Error('not added');
    const m = buildMatrix(result.value, LINE_ROOT, 'line', 'Nice IT GmbH');
    const row = m.rows.find((r) => r.unit.id === ORG_UNIT);
    expect(row?.unit.name).toBe('Nice IT GmbH');
    expect(row?.people.map((p) => p.person.name)).toEqual(['Hans Peter']);
  });

  it('still refuses a line unit that does not exist', () => {
    const { result } = addNew(base(), 'Hans Peter', 'lu-gone');
    expect(result.ok).toBe(false);
    const ws = base();
    expect(validate({ ...ws, people: [{ ...ws.people[0]!, lineUnitId: 'lu-gone' }] }).ok).toBe(
      false,
    );
  });

  it('names the root as their line unit in the Excel export and in line chips', () => {
    const { result } = addNew(base(), 'Hans Peter', ORG_UNIT);
    if (!result.ok) throw new Error('not added');
    const text = { t: (k: string) => k, repeats: () => '', percent: (s: number) => `${s}` };
    const sheet = structureSheets(result.value, text, { lineData: true }).at(-1)!;
    expect(sheet.rows).toContainEqual(['Hans Peter', 'Nice IT GmbH', null, 1, '']);
    expect(lineUnitsById(result.value, 'Org').get(ORG_UNIT)?.name).toBe('Nice IT GmbH');
  });

  it("leaves the root row out of a sub-unit's matrix", () => {
    const made = addLineUnit(base(), 'Backend');
    if (!made.ok) throw new Error('no unit');
    const [ws1, unitId] = made.value;
    const { result } = addNew(ws1, 'Hans Peter', ORG_UNIT);
    if (!result.ok) throw new Error('not added');
    const m = buildMatrix(result.value, lineSelection(unitId), 'line', 'Nice IT GmbH');
    expect(m.rows.some((r) => r.unit.id === ORG_UNIT)).toBe(false);
  });
});
