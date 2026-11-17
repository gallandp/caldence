import { describe, expect, it } from 'vitest';
import { loadExportPerson, saveExportPerson } from '../../src/ui/state/exportScope';
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

describe('remembered export person', () => {
  it('belongs to one file', () => {
    const store = memory();
    saveExportPerson('ws-1', 'p-1', store);
    expect(loadExportPerson('ws-1', store)).toBe('p-1');
    expect(loadExportPerson('ws-2', store)).toBeNull();
    saveExportPerson('ws-1', null, store);
    expect(loadExportPerson('ws-1', store)).toBeNull();
  });
  it('survives junk and blocked storage', () => {
    expect(loadExportPerson('ws-1', memory({ 'caldence.exportPerson': '{oops' }))).toBeNull();
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadExportPerson('ws-1', blocked)).toBeNull();
    saveExportPerson('ws-1', 'p-1', blocked);
  });
});
