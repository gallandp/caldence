import { addDays, easterSunday, weekday, type ISODate } from './date';
import { REGIONS } from '../data/regions';
import type { Workspace } from './model';

export { validateRegion } from './regionFile';

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

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

/** Last Wednesday strictly before 23 November. */
function repentanceDay(year: number): ISODate {
  const d = `${pad(year, 4)}-11-22`;
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

export function isBuiltinRegion(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(REGIONS, id);
}

/** Built-in regions first, then the workspace's imported ones; null when the id is unknown. */
export function resolveRegion(ws: Workspace, id: string): Region | null {
  if (isBuiltinRegion(id)) return REGIONS[id]!;
  return ws.customRegions.find((r) => r.id === id) ?? null;
}
