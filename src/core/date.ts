export type ISODate = string;
export type Time = string;

const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

/** UTC milliseconds at midnight of the given date. */
export function parseDate(d: ISODate): number {
  const m = DATE_RE.exec(d);
  if (!m) throw new Error(`Invalid date: ${d}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function formatDate(ms: number): ISODate {
  const dt = new Date(ms);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function isValidDate(s: unknown): s is ISODate {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  return formatDate(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) === s;
}

export function addDays(d: ISODate, n: number): ISODate {
  return formatDate(parseDate(d) + n * DAY_MS);
}

/** Whole days from b to a (a - b). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseDate(a) - parseDate(b)) / DAY_MS);
}

/** ISO weekday, Monday = 1 ... Sunday = 7. */
export function weekday(d: ISODate): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const w = new Date(parseDate(d)).getUTCDay();
  return (w === 0 ? 7 : w) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export function mondayOf(d: ISODate): ISODate {
  return addDays(d, 1 - weekday(d));
}

/** ISO 8601 week number (1-53). */
export function isoWeek(d: ISODate): number {
  const thursday = addDays(d, 4 - weekday(d));
  const year = new Date(parseDate(thursday)).getUTCFullYear();
  return Math.floor(diffDays(thursday, `${pad(year, 4)}-01-01`) / 7) + 1;
}

/** n-th (1-5) or last (-1) given weekday of a month (1-12); null if it does not exist. */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  wd: number,
  n: 1 | 2 | 3 | 4 | 5 | -1,
): ISODate | null {
  const first = `${pad(year, 4)}-${pad(month)}-01`;
  if (n === -1) {
    const last = addDays(formatDate(Date.UTC(year, month, 1)), -1);
    return addDays(last, -((weekday(last) - wd + 7) % 7));
  }
  const day = addDays(first, ((wd - weekday(first) + 7) % 7) + (n - 1) * 7);
  return Number(day.slice(5, 7)) === month ? day : null;
}

/** Easter Sunday via the anonymous Gregorian (Gauss/Meeus) algorithm. */
export function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function isValidTime(s: unknown): s is Time {
  return typeof s === 'string' && TIME_RE.test(s);
}

export function toMinutes(t: Time): number {
  const m = TIME_RE.exec(t);
  if (!m) throw new Error(`Invalid time: ${t}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function fromMinutes(m: number): Time {
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
