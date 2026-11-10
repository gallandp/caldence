import { diffDays, isValidDate } from './date';
import { inYearRange, LIMITS } from './limits';
import type { Region } from './regions';
import type { Result, ValidationError } from './validate';

// Kept apart from regions.ts so the built-in registry (src/data/regions) can validate its files
// while regions.ts reads that registry, without a cycle between modules.

const pad = (n: number): string => String(n).padStart(2, '0');

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

export function validateRegion(input: unknown): Result<Region> {
  const errors: ValidationError[] = [];
  const j = (p: string, k: string) => (p ? `${p}.${k}` : k);
  const err = (path: string, key: string) => errors.push({ path, key });

  const str = (o: Obj, k: string, path: string) => {
    if (o[k] === undefined) err(j(path, k), 'error.required');
    else if (!isStr(o[k])) err(j(path, k), 'error.type');
    else if (o[k].length > LIMITS.textChars) err(j(path, k), 'error.text.tooLong');
  };
  const int = (o: Obj, k: string, path: string, min: number, max: number) => {
    const v = o[k];
    if (v === undefined) err(j(path, k), 'error.required');
    else if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max)
      err(j(path, k), 'error.number.invalid');
  };
  const date = (o: Obj, k: string, path: string) => {
    if (o[k] === undefined) err(j(path, k), 'error.required');
    else if (!isValidDate(o[k])) err(j(path, k), 'error.date.invalid');
    else if (!inYearRange(o[k])) err(j(path, k), 'error.date.range');
  };
  const name = (o: Obj, path: string) => {
    if (o.name === undefined) return err(j(path, 'name'), 'error.required');
    if (!isObj(o.name)) return err(j(path, 'name'), 'error.type');
    str(o.name, 'de', j(path, 'name'));
    str(o.name, 'en', j(path, 'name'));
  };
  const list = (o: Obj, k: string, max: number): unknown[] => {
    if (o[k] === undefined) err(k, 'error.required');
    else if (!Array.isArray(o[k])) err(k, 'error.type');
    else {
      if (o[k].length > max) err(k, 'error.list.tooLong');
      return o[k];
    }
    return [];
  };

  if (!isObj(input)) {
    return {
      ok: false,
      errors: [{ path: '', key: input === undefined ? 'error.required' : 'error.type' }],
    };
  }
  str(input, 'id', '');
  name(input, '');
  date(input, 'schoolHolidaysKnownUntil', '');

  list(input, 'holidays', LIMITS.regionHolidays).forEach((h, i) => {
    const p = `holidays.${i}`;
    if (!isObj(h)) return err(p, 'error.type');
    name(h, p);
    if (h.type === 'fixed') {
      int(h, 'month', p, 1, 12);
      int(h, 'day', p, 1, 31);
      if (
        typeof h.month === 'number' &&
        typeof h.day === 'number' &&
        !isValidDate(`2024-${pad(h.month)}-${pad(h.day)}`)
      )
        err(j(p, 'day'), 'error.number.invalid');
    } else if (h.type === 'easter') int(h, 'offset', p, -366, 366);
    else if (h.type === 'special') {
      if (h.id !== 'repentance-day') err(j(p, 'id'), 'error.enum.invalid');
    } else err(j(p, 'type'), h.type === undefined ? 'error.required' : 'error.enum.invalid');
  });

  list(input, 'schoolHolidays', LIMITS.regionSchoolHolidays).forEach((s, i) => {
    const p = `schoolHolidays.${i}`;
    if (!isObj(s)) return err(p, 'error.type');
    name(s, p);
    date(s, 'from', p);
    date(s, 'to', p);
    if (isValidDate(s.from) && isValidDate(s.to) && s.to < s.from)
      err(j(p, 'to'), 'error.date.invalid');
    // One entry is one holiday; the index walks it day by day.
    else if (
      isValidDate(s.from) &&
      isValidDate(s.to) &&
      inYearRange(s.from) &&
      inYearRange(s.to) &&
      diffDays(s.to, s.from) > 366
    )
      err(j(p, 'to'), 'error.schoolHoliday.tooLong');
  });

  return errors.length ? { ok: false, errors } : { ok: true, value: input as unknown as Region };
}
