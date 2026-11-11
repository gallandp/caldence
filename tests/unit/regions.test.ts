import { describe, expect, it } from 'vitest';
import deSnJson from '../../src/data/regions/de-sn.json';
import deBySample from '../fixtures/regions/de-by-sample.json';
import { emptyWorkspace } from '../../src/core/model';
import {
  holidayIndex,
  holidaysFor,
  resolveRegion,
  validateRegion,
  type Region,
} from '../../src/core/regions';
import { REGIONS } from '../../src/data/regions';

const r = validateRegion(deSnJson);
if (!r.ok) throw new Error('de-sn invalid');
const deSn: Region = r.value;

describe('regions', () => {
  it('de-sn.json passes validateRegion', () => {
    expect(r.ok).toBe(true);
  });

  it('computes Saxony holidays for 2027', () => {
    expect(holidaysFor(deSn, 2027).map((h) => h.date)).toEqual([
      '2027-01-01',
      '2027-03-26',
      '2027-03-29',
      '2027-05-01',
      '2027-05-06',
      '2027-05-17',
      '2027-10-03',
      '2027-10-31',
      '2027-11-17',
      '2027-12-25',
      '2027-12-26',
    ]);
  });

  it.each([
    [
      2026,
      [
        '01-01',
        '04-03',
        '04-06',
        '05-01',
        '05-14',
        '05-25',
        '10-03',
        '10-31',
        '11-18',
        '12-25',
        '12-26',
      ],
    ],
    [
      2028,
      [
        '01-01',
        '04-14',
        '04-17',
        '05-01',
        '05-25',
        '06-05',
        '10-03',
        '10-31',
        '11-22',
        '12-25',
        '12-26',
      ],
    ],
    [
      2030,
      [
        '01-01',
        '04-19',
        '04-22',
        '05-01',
        '05-30',
        '06-10',
        '10-03',
        '10-31',
        '11-20',
        '12-25',
        '12-26',
      ],
    ],
  ])('computes all Saxony holidays for %i', (year, days) => {
    expect(holidaysFor(deSn, year).map((h) => h.date)).toEqual(days.map((d) => `${year}-${d}`));
  });

  it('puts Repentance Day 2026 on 18 November', () => {
    expect(holidaysFor(deSn, 2026).map((h) => h.date)).toContain('2026-11-18');
  });

  it('Repentance Day is strictly before 23 Nov when 22 Nov is a Wednesday', () => {
    // 2028-11-22 is a Wednesday
    expect(holidaysFor(deSn, 2028).map((h) => h.date)).toContain('2028-11-22');
  });

  it('indexes holidays across a year boundary', () => {
    const idx = holidayIndex(deSn, '2026-12-01', '2027-01-31');
    expect(idx.holidays.has('2026-12-25')).toBe(true);
    expect(idx.holidays.has('2027-01-01')).toBe(true);
    expect(idx.schoolHolidays.has('2026-12-23')).toBe(true);
    expect(idx.schoolHolidays.has('2027-01-02')).toBe(true);
    expect(idx.schoolHolidays.has('2027-01-03')).toBe(false);
    expect(idx.beyondKnown).toBe(false);
  });

  it('clips school holidays to the window', () => {
    const idx = holidayIndex(deSn, '2027-07-15', '2027-07-16');
    expect([...idx.schoolHolidays.keys()]).toEqual(['2027-07-15', '2027-07-16']);
  });

  it('flags beyondKnown after schoolHolidaysKnownUntil', () => {
    expect(holidayIndex(deSn, '2028-08-01', '2028-09-01').beyondKnown).toBe(false);
    expect(holidayIndex(deSn, '2028-08-01', '2028-09-02').beyondKnown).toBe(true);
  });

  it('returns empty maps when to < from', () => {
    const idx = holidayIndex(deSn, '2030-01-02', '2030-01-01');
    expect(idx.holidays.size).toBe(0);
    expect(idx.schoolHolidays.size).toBe(0);
    expect(idx.beyondKnown).toBe(false);
  });

  it('rejects invalid regions with error keys', () => {
    expect(validateRegion(null)).toEqual({ ok: false, errors: [{ path: '', key: 'error.type' }] });
    const bad = validateRegion({
      id: 'x',
      name: { de: 'X' },
      holidays: [
        { type: 'fixed', month: 2, day: 30, name: { de: 'a', en: 'a' } },
        { type: 'nope', name: { de: 'a', en: 'a' } },
      ],
      schoolHolidays: [{ name: { de: 'a', en: 'a' }, from: '2027-02-02', to: '2027-02-01' }],
      schoolHolidaysKnownUntil: 'x',
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      const keys = bad.errors.map((e) => `${e.path}:${e.key}`);
      expect(keys).toContain('name.en:error.required');
      expect(keys).toContain('holidays.0.day:error.number.invalid');
      expect(keys).toContain('holidays.1.type:error.enum.invalid');
      expect(keys).toContain('schoolHolidays.0.to:error.date.invalid');
      expect(keys).toContain('schoolHolidaysKnownUntil:error.date.invalid');
    }
  });
});

describe('resolveRegion', () => {
  const custom = (id: string, en: string): Region => ({
    ...structuredClone(deSn),
    id,
    name: { de: en, en },
  });

  it('finds built-in and imported regions, and null for unknown ids', () => {
    const ws = { ...emptyWorkspace('2026-11-08'), customRegions: [custom('de-by', 'Bavaria')] };
    expect(resolveRegion(ws, 'de-sn')).toBe(REGIONS['de-sn']);
    expect(resolveRegion(ws, 'de-by')?.name.en).toBe('Bavaria');
    expect(resolveRegion(ws, 'xx')).toBeNull();
    expect(resolveRegion(ws, 'toString')).toBeNull();
  });

  it('prefers the built-in region over an imported one with the same id', () => {
    const ws = { ...emptyWorkspace('2026-11-08'), customRegions: [custom('de-sn', 'Fake')] };
    expect(resolveRegion(ws, 'de-sn')?.name.en).toBe('Saxony');
  });

  it('the sample fixture is a valid region', () => {
    expect(validateRegion(deBySample).ok).toBe(true);
  });
});

describe('region limits (security #41)', () => {
  const sample = (): Record<string, unknown> => structuredClone(deBySample) as never;
  const keys = (v: unknown): string[] => {
    const r = validateRegion(v);
    return r.ok ? [] : r.errors.map((e) => `${e.path} ${e.key}`);
  };

  it('rejects school holidays outside 1900 to 2200 or longer than a year', () => {
    const r = sample();
    r.schoolHolidays = [
      { name: { de: 'A', en: 'A' }, from: '1000-01-01', to: '9999-12-31' },
      { name: { de: 'B', en: 'B' }, from: '2027-01-01', to: '2028-01-03' },
    ];
    expect(keys(r)).toEqual(
      expect.arrayContaining([
        'schoolHolidays.0.from error.date.range',
        'schoolHolidays.0.to error.date.range',
        'schoolHolidays.1.to error.schoolHoliday.tooLong',
      ]),
    );
  });

  it('rejects too many entries and too long names', () => {
    const r = sample();
    r.schoolHolidays = Array.from({ length: 501 }, () => ({
      name: { de: 'A', en: 'A' },
      from: '2027-01-01',
      to: '2027-01-02',
    }));
    r.holidays = Array.from({ length: 101 }, () => ({
      type: 'fixed',
      month: 1,
      day: 1,
      name: { de: 'x'.repeat(201), en: 'x' },
    }));
    const k = keys(r);
    expect(k).toContain('schoolHolidays error.list.tooLong');
    expect(k).toContain('holidays error.list.tooLong');
    expect(k).toContain('holidays.0.name.de error.text.tooLong');
  });

  it('pads the year of the repentance day', () => {
    const region = { ...REGIONS['de-sn']! };
    expect(() => holidaysFor(region, 999)).not.toThrow();
  });
});
