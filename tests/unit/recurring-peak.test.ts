import { describe, expect, it } from 'vitest';
import { recurringPeak } from '../../src/core/load';

const w = (hours: number[]) => hours.map((h, i) => ({ monday: `2027-01-${10 + i}`, hours: h }));
const none = () => false;

describe('recurringPeak (#510)', () => {
  it('is recurring when another week reaches 95 % of the peak', () => {
    expect(recurringPeak(w([2, 10, 3, 9.5]), none)).toBe(true);
  });
  it('is not recurring for a one-off peak', () => {
    expect(recurringPeak(w([2, 10, 3, 9]), none)).toBe(false);
  });
  it('is not recurring when the peak week has any warning', () => {
    expect(recurringPeak(w([10, 10]), (m) => m === '2027-01-10')).toBe(false);
  });
  it('is not recurring without meetings', () => {
    expect(recurringPeak(w([0, 0]), none)).toBe(false);
  });
});

describe('German load basis texts (#510)', async () => {
  const de = (await import('../../src/i18n/de.json')).default as Record<string, string>;
  it('names the basis and marks recurring peaks', () => {
    expect(de['load.col.hours']).toBe('Ø Stunden/Woche im Planungszeitraum');
    expect(de['load.peak.recurring']).toBe('{week} ({hours} h) (wiederkehrend)');
    expect(de['load.chart.hint']).toContain('Hohe Balken ohne Warnung');
  });
});
