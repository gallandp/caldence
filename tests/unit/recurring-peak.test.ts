import { describe, expect, it } from 'vitest';
import { peakKind } from '../../src/core/load';

const w = (hours: number[]) => hours.map((h, i) => ({ monday: `2027-01-${10 + i}`, hours: h }));
const none = () => false;

describe('peakKind (#510)', () => {
  it('is recurring when another week reaches 95 % of the peak', () => {
    expect(peakKind(w([2, 10, 3, 9.5]), none)).toBe('recurring');
  });
  it('is not recurring for a one-off peak', () => {
    expect(peakKind(w([2, 10, 3, 9]), none)).toBe('below');
  });
  it('is not recurring when the peak week has any warning', () => {
    expect(peakKind(w([10, 10]), (m) => m === '2027-01-10')).toBe('warned');
  });
  it('is not recurring without meetings', () => {
    expect(peakKind(w([0, 0]), none)).toBeUndefined();
  });
});

describe('German load basis texts (#510)', async () => {
  const de = (await import('../../src/i18n/de.json')).default as Record<string, string>;
  it('names the basis and marks recurring peaks', () => {
    expect(de['load.col.hours']).toBe('Ø Stunden/Woche im Planungszeitraum');
    expect(de['load.peak.recurring']).toBe('{week} ({hours} h) (wiederkehrend)');
    expect(de['load.chart.hint']).toContain('Hohe Balken ohne Warnung');
    expect(de['load.peak.below']).toBe('{week} ({hours} h) (unter der Spitzengrenze)');
  });
});
