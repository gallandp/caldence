import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  easterSunday,
  formatDate,
  fromMinutes,
  isoWeek,
  isValidDate,
  isValidTime,
  mondayOf,
  nthWeekdayOfMonth,
  parseDate,
  toMinutes,
  weekday,
} from '../../src/core/date';

describe('date helpers', () => {
  it('computes ISO weeks', () => {
    expect(isoWeek('2026-12-31')).toBe(53);
    expect(isoWeek('2027-01-01')).toBe(53);
    expect(isoWeek('2027-01-04')).toBe(1);
  });
  it('computes weekday with Monday = 1', () => {
    expect(weekday('2027-01-07')).toBe(4);
    expect(weekday('2027-01-10')).toBe(7);
  });
  it('finds mondayOf', () => {
    expect(mondayOf('2027-01-10')).toBe('2027-01-04');
    expect(mondayOf('2027-01-04')).toBe('2027-01-04');
  });
  it('finds nth weekday of month', () => {
    expect(nthWeekdayOfMonth(2027, 5, 1, -1)).toBe('2027-05-31');
    expect(nthWeekdayOfMonth(2027, 2, 5, 5)).toBeNull();
    expect(nthWeekdayOfMonth(2027, 5, 1, 1)).toBe('2027-05-03');
  });
  it('computes Easter Sunday', () => {
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(easterSunday(2026)).toBe('2026-04-05');
  });
  it('validates dates', () => {
    expect(isValidDate('2027-02-29')).toBe(false);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2027-1-1')).toBe(false);
    expect(isValidDate(20270101)).toBe(false);
  });
  it('does day arithmetic', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(diffDays('2027-01-01', '2026-12-31')).toBe(1);
    expect(formatDate(parseDate('2027-06-15'))).toBe('2027-06-15');
  });
  it('handles times', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(fromMinutes(570)).toBe('09:30');
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('9:30')).toBe(false);
  });
});
