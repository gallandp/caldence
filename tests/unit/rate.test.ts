import { describe, expect, it } from 'vitest';
import { loadExportChoice, saveExportChoice } from '../../src/ui/state/exportScope';
import { parseRate } from '../../src/ui/rate';

describe('parseRate', () => {
  it('reads German and English decimals', () => {
    expect(parseRate('85')).toBe(85);
    expect(parseRate(' 85,50 ')).toBe(85.5);
    expect(parseRate('85.5')).toBe(85.5);
  });
  it('refuses zero, too much, separators, signs, exponents and hex', () => {
    for (const bad of [
      '',
      '0',
      '0,00',
      '100001',
      '1.000',
      '1.000,50',
      '1,000.50',
      '+5',
      '-5',
      '1e3',
      '0x10',
      'abc',
      '8,555',
    ])
      expect(parseRate(bad), bad).toBeNull();
    expect(parseRate('100000')).toBe(100000);
  });
});

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
}

describe('remembered export choice', () => {
  it('belongs to one file', () => {
    const store = memory();
    saveExportChoice('ws-1', { kind: 'person', id: 'p-1' }, store);
    expect(loadExportChoice('ws-1', store)).toEqual({ kind: 'person', id: 'p-1' });
    expect(loadExportChoice('ws-2', store)).toBeNull();
    saveExportChoice('ws-1', { kind: 'team', id: 't-1' }, store);
    expect(loadExportChoice('ws-1', store)).toEqual({ kind: 'team', id: 't-1' });
  });
  it('reads the person remembered by earlier versions', () => {
    const old = JSON.stringify({ workspaceId: 'ws-1', personId: 'p-1' });
    expect(loadExportChoice('ws-1', memory({ 'caldence.exportPerson': old }))).toEqual({
      kind: 'person',
      id: 'p-1',
    });
  });
  it('survives junk and blocked storage', () => {
    expect(loadExportChoice('ws-1', memory({ 'caldence.exportPerson': '{oops' }))).toBeNull();
    const odd = JSON.stringify({ workspaceId: 'ws-1', kind: 'file', id: 'x' });
    expect(loadExportChoice('ws-1', memory({ 'caldence.exportPerson': odd }))).toBeNull();
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadExportChoice('ws-1', blocked)).toBeNull();
    saveExportChoice('ws-1', { kind: 'person', id: 'p-1' }, blocked);
  });
});
