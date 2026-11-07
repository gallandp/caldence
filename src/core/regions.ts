import { addDays, easterSunday, isValidDate, weekday, type ISODate } from './date';
import type { Result, ValidationError } from './validate';

export type HolidayName = Record<'de' | 'en', string>;

export type HolidayRule =
  | { type: 'fixed'; month: number; day: number; name: HolidayName }
  | { type: 'easter'; offset: number; name: HolidayName }
  | { type: 'special'; id: 'repentance-day'; name: HolidayName };

export type SchoolHoliday = { name: HolidayName; from: ISODate; to: ISODate };

export type Region = {
  id: string;
  name: HolidayName;
  holidays: HolidayRule[];
  schoolHolidays: SchoolHoliday[];
  schoolHolidaysKnownUntil: ISODate;
};

export type HolidayIndex = {
  holidays: Map<ISODate, HolidayName>;
  schoolHolidays: Map<ISODate, HolidayName>;
  beyondKnown: boolean;
};

const pad = (n: number): string => String(n).padStart(2, '0');

/** Last Wednesday strictly before 23 November. */
function repentanceDay(year: number): ISODate {
  const d = `${year}-11-22`;
  return addDays(d, -((weekday(d) - 3 + 7) % 7));
}

export function holidaysFor(region: Region, year: number): { date: ISODate; name: HolidayName }[] {
  const out = region.holidays.map((r) => {
    let date: ISODate;
    if (r.type === 'fixed') date = `${year}-${pad(r.month)}-${pad(r.day)}`;
    else if (r.type === 'easter') date = addDays(easterSunday(year), r.offset);
    else date = repentanceDay(year);
    return { date, name: r.name };
  });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function holidayIndex(region: Region, from: ISODate, to: ISODate): HolidayIndex {
  const index: HolidayIndex = {
    holidays: new Map(),
    schoolHolidays: new Map(),
    beyondKnown: false,
  };
  if (to < from) return index;
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const h of holidaysFor(region, y)) {
      if (h.date >= from && h.date <= to) index.holidays.set(h.date, h.name);
    }
  }
  for (const s of region.schoolHolidays) {
    if (s.to < from || s.from > to) continue;
    const end = s.to < to ? s.to : to;
    for (let d = s.from > from ? s.from : from; d <= end; d = addDays(d, 1)) {
      index.schoolHolidays.set(d, s.name);
    }
  }
  index.beyondKnown = to > region.schoolHolidaysKnownUntil;
  return index;
}

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
  };
  const name = (o: Obj, path: string) => {
    if (o.name === undefined) return err(j(path, 'name'), 'error.required');
    if (!isObj(o.name)) return err(j(path, 'name'), 'error.type');
    str(o.name, 'de', j(path, 'name'));
    str(o.name, 'en', j(path, 'name'));
  };
  const list = (o: Obj, k: string): unknown[] => {
    if (o[k] === undefined) err(k, 'error.required');
    else if (!Array.isArray(o[k])) err(k, 'error.type');
    else return o[k];
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

  list(input, 'holidays').forEach((h, i) => {
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

  list(input, 'schoolHolidays').forEach((s, i) => {
    const p = `schoolHolidays.${i}`;
    if (!isObj(s)) return err(p, 'error.type');
    name(s, p);
    date(s, 'from', p);
    date(s, 'to', p);
    if (isValidDate(s.from) && isValidDate(s.to) && s.to < s.from)
      err(j(p, 'to'), 'error.date.invalid');
  });

  return errors.length ? { ok: false, errors } : { ok: true, value: input as unknown as Region };
}
