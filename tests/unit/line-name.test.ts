import { describe, expect, it } from 'vitest';
import { renameLine, renameOrganisation } from '../../src/core/edit';
import { emptyWorkspace, lineRootName } from '../../src/core/model';
import { validate } from '../../src/core/validate';

/** The line root's own name (#417), apart from the product organisation's. */
describe('line root name', () => {
  const ws = { ...emptyWorkspace('2027-03-17'), organisation: { name: 'Lumora Platforms' } };

  it('falls back to the organisation, then to the level word', () => {
    expect(lineRootName(ws, 'Organisation')).toBe('Lumora Platforms');
    expect(lineRootName(emptyWorkspace('2027-03-17'), 'Organisation')).toBe('Organisation');
  });

  it('is renamed without touching the organisation, and a blank name removes it', () => {
    const r = renameLine(ws, '  Lumora Group ');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.lineName).toBe('Lumora Group');
    expect(r.value.organisation).toEqual({ name: 'Lumora Platforms' });
    expect(lineRootName(r.value, 'Organisation')).toBe('Lumora Group');
    const cleared = renameLine(r.value, ' ');
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect('lineName' in cleared.value).toBe(false);
  });

  it('survives renaming the organisation', () => {
    const r = renameOrganisation({ ...ws, lineName: 'Lumora Group' }, 'Lumora Products');
    expect(r.ok && r.value.lineName).toBe('Lumora Group');
  });

  it('is validated', () => {
    expect(validate({ ...ws, lineName: 'Lumora Group' }).ok).toBe(true);
    expect(validate({ ...ws, lineName: '' }).ok).toBe(false);
    expect(validate({ ...ws, lineName: 3 }).ok).toBe(false);
    expect(validate({ ...ws, lineName: 'x'.repeat(201) }).ok).toBe(false);
  });
});
