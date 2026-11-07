import { describe, expect, it } from 'vitest';
import { isKnownZone, offsetMinutes, transitions, utcToLocal } from '../../src/core/zone';

describe('isKnownZone', () => {
  it('knows IANA zones and UTC, not free text', () => {
    for (const tz of ['Europe/Berlin', 'Australia/Sydney', 'UTC'])
      expect(isKnownZone(tz), tz).toBe(true);
    for (const tz of ['Mitteleuropa', 'Foo/Bar', '', ' ']) expect(isKnownZone(tz), tz).toBe(false);
  });
});

describe('offsetMinutes', () => {
  it('gives the Berlin offset in winter and summer', () => {
    expect(offsetMinutes('Europe/Berlin', Date.UTC(2027, 0, 15, 12))).toBe(60);
    expect(offsetMinutes('Europe/Berlin', Date.UTC(2027, 6, 15, 12))).toBe(120);
    expect(offsetMinutes('UTC', Date.UTC(2027, 6, 15, 12))).toBe(0);
    expect(offsetMinutes('America/New_York', Date.UTC(2027, 0, 15, 12))).toBe(-300);
  });
});

describe('transitions', () => {
  it('finds the two Berlin changes of 2027 to the minute', () => {
    expect(transitions('Europe/Berlin', 2027, 2027)).toEqual([
      { utcMs: Date.UTC(2027, 2, 28, 1, 0), from: 60, to: 120 },
      { utcMs: Date.UTC(2027, 9, 31, 1, 0), from: 120, to: 60 },
    ]);
  });

  it('gives none for a zone without DST', () => {
    expect(transitions('Asia/Tokyo', 2027, 2027)).toEqual([]);
  });

  it('covers several years', () => {
    expect(transitions('Europe/Berlin', 2026, 2028)).toHaveLength(6);
  });
});

describe('utcToLocal', () => {
  it('converts to Berlin wall-clock time', () => {
    expect(utcToLocal(Date.UTC(2027, 6, 1, 7, 0), 'Europe/Berlin')).toEqual({
      date: '2027-07-01',
      time: '09:00',
    });
    expect(utcToLocal(Date.UTC(2027, 0, 1, 23, 30), 'Europe/Berlin')).toEqual({
      date: '2027-01-02',
      time: '00:30',
    });
  });
});
