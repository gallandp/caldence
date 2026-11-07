import { formatDate, fromMinutes, type ISODate, type Time } from './date';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** UTC offset of the zone at the given instant, in whole minutes (east of UTC is positive). */
export function offsetMinutes(tz: string, utcMs: number): number {
  const at = Math.floor(utcMs / 1000) * 1000;
  const parts: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(at)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  const local = Date.UTC(
    parts.year ?? 1970,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    (parts.hour ?? 0) % 24,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  return Math.round((local - at) / MINUTE_MS);
}

export type Transition = { utcMs: number; from: number; to: number };

/**
 * Offset changes between 1 January of fromYear and the end of toYear (UTC), found by probing
 * daily at 00:00 UTC and binary-searching each change to the minute.
 */
export function transitions(tz: string, fromYear: number, toYear: number): Transition[] {
  const out: Transition[] = [];
  const start = Date.UTC(fromYear, 0, 1);
  const end = Date.UTC(toYear + 1, 0, 1);
  let prevMs = start;
  let prev = offsetMinutes(tz, prevMs);
  for (let ms = start + DAY_MS; ms <= end; ms += DAY_MS) {
    const cur = offsetMinutes(tz, ms);
    if (cur !== prev) {
      // Invariant: offset(lo) === prev, offset(hi) !== prev; both are whole minutes.
      let lo = prevMs;
      let hi = ms;
      while (hi - lo > MINUTE_MS) {
        const mid = lo + Math.floor((hi - lo) / MINUTE_MS / 2) * MINUTE_MS;
        if (offsetMinutes(tz, mid) === prev) lo = mid;
        else hi = mid;
      }
      if (hi < end) out.push({ utcMs: hi, from: prev, to: offsetMinutes(tz, hi) });
      prev = cur;
    }
    prevMs = ms;
  }
  return out;
}

/** Wall-clock date and time of an instant in the zone. */
export function utcToLocal(utcMs: number, tz: string): { date: ISODate; time: Time } {
  const local = utcMs + offsetMinutes(tz, utcMs) * MINUTE_MS;
  const dayStart = Math.floor(local / DAY_MS) * DAY_MS;
  return {
    date: formatDate(dayStart),
    time: fromMinutes(Math.floor((local - dayStart) / MINUTE_MS)),
  };
}
