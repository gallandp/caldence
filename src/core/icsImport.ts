import {
  addDays,
  diffDays,
  formatDate,
  mondayOf,
  parseDate,
  toMinutes,
  weekday,
  type ISODate,
  type Time,
} from './date';
import type { CalEvent, Rule, Team, Workspace } from './model';
import type { Result } from './validate';
import { utcToLocal } from './zone';

/** Colour of a category created by an import: the first colour of the app palette (blue). */
export const NEW_CATEGORY_COLOUR = '#1d4ed8';

/** Windows zone names (as Outlook writes them) and the IANA zone they stand for. */
export const WINDOWS_ZONES: Record<string, string> = {
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'GMT Standard Time': 'Europe/London',
  'Central Europe Standard Time': 'Europe/Budapest',
};

export interface IcsEvent {
  uid: string;
  summary: string;
  categories: string[];
  allDay: boolean;
  start: { date: ISODate; time: Time | null; tzid: string | null; utc: boolean };
  durationMinutes: number | null;
  rrule: Record<string, string> | null;
  exdates: number;
  recurrenceId: boolean;
  cancelled: boolean;
}

export type SkipReason = 'allDay' | 'cancelled' | 'override' | 'noDuration' | 'multiDay' | 'ended';

/** A left-out item. Changed instances (`override`) are one entry per series, with their `count`. */
export type SkippedItem = { summary: string; reason: SkipReason; count?: number };

/** A note on a candidate: an i18n key and its placeholder values. */
export type NoteKey =
  | { key: 'import.note.unmapped'; params: Record<string, never> }
  | { key: 'import.note.ends'; params: { date: ISODate } }
  | { key: 'import.note.exceptions'; params: { count: number } }
  | { key: 'import.note.zone'; params: { zone: string } };

export type ImportCandidate = {
  key: string;
  /** Empty when the item has no SUMMARY (`untitled`); `importEvents` then uses its fallback. */
  name: string;
  untitled: boolean;
  rule: Rule;
  time: Time;
  duration: number;
  categoryHint: string | null;
  notes: NoteKey[];
  duplicateOf: string | null;
  selected: boolean;
};

export type ImportReview = {
  candidates: ImportCandidate[];
  skipped: SkippedItem[];
  hiddenPast: number;
};

// ---------- parsing ----------

type Prop = { name: string; params: Record<string, string>; value: string };

/** Splits at `sep` outside double quotes. */
function splitOutsideQuotes(s: string, sep: string, max = Infinity): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '"') quoted = !quoted;
    if (ch === sep && !quoted && out.length < max - 1) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseLine(line: string): Prop | null {
  const [head, value] = splitOutsideQuotes(line, ':', 2);
  if (head === undefined || value === undefined) return null;
  const [name, ...rawParams] = splitOutsideQuotes(head, ';');
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    let v = p.slice(eq + 1);
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    params[p.slice(0, eq).toUpperCase()] = v;
  }
  return { name: (name ?? '').toUpperCase(), params, value };
}

/** Unescapes a TEXT value. */
function unescapeText(s: string): string {
  return s.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

/** Splits a TEXT list at unescaped commas and unescapes each item. */
function textList(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '\\' && i + 1 < s.length) {
      cur += ch + s[i + 1];
      i++;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => unescapeText(x).trim()).filter((x) => x !== '');
}

const DATE_TIME_RE = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/i;

type DateTime = { date: ISODate; time: Time | null; tzid: string | null; utc: boolean };

function parseDateTime(prop: Prop): DateTime | null {
  const m = DATE_TIME_RE.exec(prop.value.trim());
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  const dateOnly = m[4] === undefined || prop.params.VALUE?.toUpperCase() === 'DATE';
  if (dateOnly) return { date, time: null, tzid: null, utc: false };
  const utc = m[7] !== undefined;
  return { date, time: `${m[4]}:${m[5]}`, tzid: utc ? null : (prop.params.TZID ?? null), utc };
}

/** Minutes of an ISO 8601 duration (P1W, P1DT2H, PT30M, ...); null if not a duration. */
function parseDuration(s: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(
    s.trim(),
  );
  if (!m || s.trim().toUpperCase().endsWith('T')) return null;
  const [, sign, w, d, h, min, sec] = m;
  const total =
    Number(w ?? 0) * 10080 +
    Number(d ?? 0) * 1440 +
    Number(h ?? 0) * 60 +
    Number(min ?? 0) +
    Number(sec ?? 0) / 60;
  return sign === '-' ? -total : total;
}

/** Minutes since the epoch of a wall-clock date and time (no zone). */
const wallMinutes = (dt: DateTime): number =>
  parseDate(dt.date) / 60_000 + (dt.time === null ? 0 : toMinutes(dt.time));

type Draft = {
  props: Prop[];
};

function toEvent(draft: Draft): IcsEvent | null {
  let start: DateTime | null = null;
  let end: DateTime | null = null;
  let duration: number | null = null;
  let msAllDay = false;
  const ev: IcsEvent = {
    uid: '',
    summary: '',
    categories: [],
    allDay: false,
    start: { date: '', time: null, tzid: null, utc: false },
    durationMinutes: null,
    rrule: null,
    exdates: 0,
    recurrenceId: false,
    cancelled: false,
  };
  for (const p of draft.props) {
    switch (p.name) {
      case 'UID':
        ev.uid = p.value.trim();
        break;
      case 'SUMMARY':
        ev.summary = unescapeText(p.value).trim();
        break;
      case 'CATEGORIES':
        ev.categories.push(...textList(p.value));
        break;
      case 'DTSTART':
        start = parseDateTime(p);
        break;
      case 'DTEND':
        end = parseDateTime(p);
        break;
      case 'DURATION':
        duration = parseDuration(p.value);
        break;
      case 'RRULE': {
        const rule: Record<string, string> = {};
        for (const part of p.value.trim().split(';')) {
          const eq = part.indexOf('=');
          if (eq > 0) rule[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).toUpperCase();
        }
        ev.rrule = rule;
        break;
      }
      case 'EXDATE':
        ev.exdates += p.value.split(',').filter((x) => x.trim() !== '').length;
        break;
      case 'RECURRENCE-ID':
        ev.recurrenceId = true;
        break;
      case 'STATUS':
        ev.cancelled = p.value.trim().toUpperCase() === 'CANCELLED';
        break;
      // Outlook may write an all-day item with midnight-to-midnight times and this flag.
      case 'X-MICROSOFT-CDO-ALLDAYEVENT':
        msAllDay = p.value.trim().toUpperCase() === 'TRUE';
        break;
    }
  }
  if (!start) return null;
  ev.start = start;
  ev.allDay = start.time === null || msAllDay;
  if (duration !== null) ev.durationMinutes = Math.round(duration);
  else if (end) {
    // Same zone (or both UTC/floating): wall-clock difference. Otherwise the best estimate.
    ev.durationMinutes = Math.round(wallMinutes(end) - wallMinutes(start));
  } else if (ev.allDay) ev.durationMinutes = 1440;
  return ev;
}

const CR = 0x0d;
const LF = 0x0a;
const isFoldSpace = (b: number | undefined): boolean => b === 0x20 || b === 0x09;

/**
 * Unfolds the raw bytes of an iCalendar file and decodes them as UTF-8. RFC 5545 §3.1 lets a
 * producer fold a line inside a multi-octet character, so a line break (CR LF, LF or CR) followed
 * by a space or tab is removed before decoding; decoding first would turn each half into U+FFFD.
 * The result can go straight to `parseIcs`.
 */
export function unfoldBytes(bytes: Uint8Array): string {
  const out = new Uint8Array(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    if (b === CR && bytes[i + 1] === LF && isFoldSpace(bytes[i + 2])) {
      i += 2;
      continue;
    }
    if ((b === LF || b === CR) && isFoldSpace(bytes[i + 1])) {
      i += 1;
      continue;
    }
    out[n++] = b;
  }
  return new TextDecoder('utf-8').decode(out.subarray(0, n));
}

/**
 * Reads the VEVENTs of an iCalendar file. Lines are unfolded and parameters may be quoted.
 * Errors: `ics.error.notIcs` without BEGIN:VCALENDAR, `ics.error.empty` without any VEVENT.
 * A VEVENT without a readable DTSTART is left out.
 */
export function parseIcs(text: string): Result<IcsEvent[]> {
  const lines = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
  if (!lines.some((l) => l.trim().toUpperCase() === 'BEGIN:VCALENDAR'))
    return { ok: false, errors: [{ path: '', key: 'ics.error.notIcs' }] };

  const events: IcsEvent[] = [];
  const stack: string[] = [];
  let draft: Draft | null = null;
  let sawEvent = false;
  for (const raw of lines) {
    if (raw.trim() === '') continue;
    const upper = raw.slice(0, 6).toUpperCase();
    if (upper === 'BEGIN:') {
      const name = raw.slice(6).trim().toUpperCase();
      stack.push(name);
      if (name === 'VEVENT' && stack.length >= 1 && stack[stack.length - 2] === 'VCALENDAR') {
        draft = { props: [] };
        sawEvent = true;
      }
      continue;
    }
    if (raw.slice(0, 4).toUpperCase() === 'END:') {
      const name = raw.slice(4).trim().toUpperCase();
      if (name === 'VEVENT' && draft && stack[stack.length - 1] === 'VEVENT') {
        const ev = toEvent(draft);
        if (ev) events.push(ev);
        draft = null;
      }
      // Pop back to the matching BEGIN (tolerates unbalanced input).
      const at = stack.lastIndexOf(name);
      if (at >= 0) stack.length = at;
      continue;
    }
    // Only the VEVENT's own properties, not those of a nested VALARM.
    if (draft && stack[stack.length - 1] === 'VEVENT') {
      const prop = parseLine(raw);
      if (prop) draft.props.push(prop);
    }
  }
  if (!sawEvent) return { ok: false, errors: [{ path: '', key: 'ics.error.empty' }] };
  return { ok: true, value: events };
}

// ---------- review ----------

const DAY_CODES: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };

/** BYDAY values as weekdays; null if any value carries an ordinal or is unknown. */
function plainDays(byday: string): number[] | null {
  const out: number[] = [];
  for (const d of byday.split(',')) {
    const n = DAY_CODES[d.trim()];
    if (n === undefined) return null;
    if (!out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/** A rule for the RRULE, or null when Caldence has no matching rule. */
function mapRule(rr: Record<string, string>, start: ISODate): Rule | null {
  const interval = rr.INTERVAL === undefined ? 1 : Number(rr.INTERVAL);
  if (!Number.isInteger(interval) || interval < 1) return null;
  const extra = Object.keys(rr).filter(
    (k) => !['FREQ', 'INTERVAL', 'BYDAY', 'BYSETPOS', 'UNTIL', 'COUNT', 'WKST'].includes(k),
  );
  if (extra.length > 0) return null;
  const days = rr.BYDAY === undefined ? [weekday(start)] : plainDays(rr.BYDAY);
  switch (rr.FREQ) {
    case 'WEEKLY': {
      if (!days || days.length === 0 || rr.BYSETPOS !== undefined) return null;
      if (interval === 1)
        return days.length === 1
          ? { type: 'weekly', weekday: days[0]! }
          : { type: 'weekdays', weekdays: days };
      return days.length === 1
        ? { type: 'every-n-weeks', weekday: days[0]!, n: interval, anchor: start }
        : null;
    }
    case 'DAILY': {
      if (interval !== 1 || rr.BYSETPOS !== undefined) return null;
      const list = rr.BYDAY === undefined ? [1, 2, 3, 4, 5, 6, 7] : days;
      return list && list.length > 0 ? { type: 'weekdays', weekdays: list } : null;
    }
    case 'MONTHLY': {
      if (interval !== 1 || rr.BYDAY === undefined) return null;
      let nth: number;
      const m = /^([+-]?\d)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(rr.BYDAY);
      if (!m) return null;
      const wd = DAY_CODES[m[2]!];
      if (m[1] !== undefined) {
        if (rr.BYSETPOS !== undefined) return null;
        nth = Number(m[1]);
      } else {
        if (rr.BYSETPOS === undefined) return null;
        nth = Number(rr.BYSETPOS);
      }
      if (wd === undefined || ![1, 2, 3, 4, 5, -1].includes(nth)) return null;
      return { type: 'monthly-nth-weekday', weekday: wd, nth: nth as 1 | 2 | 3 | 4 | 5 | -1 };
    }
    default:
      return null;
  }
}

function addMonths(d: ISODate, months: number): ISODate {
  const dt = new Date(parseDate(d));
  dt.setUTCMonth(dt.getUTCMonth() + months);
  return `${String(dt.getUTCFullYear()).padStart(4, '0')}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Last date of a series ending by UNTIL or COUNT (COUNT estimated by whole periods); else null. */
function lastDate(rr: Record<string, string>, start: ISODate, tz: string): ISODate | null {
  if (rr.UNTIL !== undefined) {
    const m = DATE_TIME_RE.exec(rr.UNTIL);
    if (!m) return null;
    if (m[7] !== undefined && m[4] !== undefined) {
      const ms = Date.UTC(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
        Number(m[6] ?? 0),
      );
      return utcToLocal(ms, tz).date;
    }
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  if (rr.COUNT !== undefined) {
    const count = Number(rr.COUNT);
    if (!Number.isInteger(count) || count < 1) return null;
    const interval = rr.INTERVAL === undefined ? 1 : Number(rr.INTERVAL) || 1;
    const steps = (count - 1) * interval;
    switch (rr.FREQ) {
      case 'DAILY':
        return addDays(start, steps);
      case 'WEEKLY':
        return addDays(start, steps * 7);
      case 'MONTHLY':
        return addMonths(start, steps);
      case 'YEARLY':
        return addMonths(start, steps * 12);
      default:
        return null;
    }
  }
  return null;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

const DAY_NAMES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** BYDAY values moved by `delta` days (ordinals kept), for a UTC start that changes date locally. */
function shiftByday(byday: string, delta: number): string {
  return byday
    .split(',')
    .map((v) => {
      const m = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(v.trim());
      if (!m) return v;
      return `${m[1] ?? ''}${DAY_NAMES[mod((DAY_CODES[m[2]!] ?? 1) - 1 + delta, 7)]}`;
    })
    .join(',');
}

/** The date `months` after `start` on the same day of month; null if that day does not exist. */
function sameDayMonthsLater(start: ISODate, months: number): ISODate | null {
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(5, 7)) - 1 + months;
  const day = Number(start.slice(8, 10));
  const ms = Date.UTC(y, m, day);
  const d = new Date(ms);
  return d.getUTCDate() === day ? formatDate(ms) : null;
}

/**
 * The first occurrence on or after `today` of a series Caldence cannot map, where that is cheap to
 * work out: plain DAILY/WEEKLY (with optional plain BYDAY) and MONTHLY/YEARLY on the start's day
 * of month. Returns `start` when it is not in the past, and null when it cannot be estimated.
 */
function nextOccurrence(
  rr: Record<string, string>,
  start: ISODate,
  today: ISODate,
): ISODate | null {
  if (start >= today) return start;
  const interval = rr.INTERVAL === undefined ? 1 : Number(rr.INTERVAL);
  if (!Number.isInteger(interval) || interval < 1) return null;
  const allowed = ['FREQ', 'INTERVAL', 'UNTIL', 'COUNT', 'WKST', 'BYDAY', 'BYMONTHDAY', 'BYMONTH'];
  if (Object.keys(rr).some((k) => !allowed.includes(k))) return null;
  const freq = rr.FREQ;
  const days = rr.BYDAY === undefined ? null : plainDays(rr.BYDAY);
  if (
    rr.BYDAY !== undefined &&
    (!days || days.length === 0 || (freq !== 'DAILY' && freq !== 'WEEKLY'))
  )
    return null;
  if (rr.BYMONTHDAY !== undefined) {
    if (
      (freq !== 'MONTHLY' && freq !== 'YEARLY') ||
      Number(rr.BYMONTHDAY) !== Number(start.slice(8, 10))
    )
      return null;
  }
  if (
    rr.BYMONTH !== undefined &&
    (freq !== 'YEARLY' || Number(rr.BYMONTH) !== Number(start.slice(5, 7)))
  )
    return null;
  switch (freq) {
    case 'DAILY': {
      const k = Math.ceil(diffDays(today, start) / interval);
      for (let i = 0; i < 7; i++) {
        const d = addDays(start, (k + i) * interval);
        if (!days || days.includes(weekday(d))) return d;
      }
      return null;
    }
    case 'WEEKLY': {
      const list = days ?? [weekday(start)];
      const base = mondayOf(start);
      const w = Math.ceil(diffDays(mondayOf(today), base) / 7 / interval) * interval;
      for (const week of [w, w + interval]) {
        for (const d of list) {
          const date = addDays(base, week * 7 + d - 1);
          if (date >= today && date >= start) return date;
        }
      }
      return null;
    }
    case 'MONTHLY':
    case 'YEARLY': {
      const step = freq === 'MONTHLY' ? interval : interval * 12;
      const months =
        (Number(today.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
        Number(today.slice(5, 7)) -
        Number(start.slice(5, 7));
      // 12 steps cover a 29 February (8 years at most) and a 31st in short months.
      for (let k = Math.max(0, Math.floor(months / step)), n = 0; n < 12; k++, n++) {
        const d = sameDayMonthsLater(start, k * step);
        if (d !== null && d >= today) return d;
      }
      return null;
    }
    default:
      return null;
  }
}

/** A string that is equal for two rules exactly when they give the same dates; null if unknown. */
function ruleKey(rule: Rule, team: Team | null): string | null {
  switch (rule.type) {
    case 'weekly':
      return `w:${rule.weekday}`;
    case 'weekdays': {
      const days = [...new Set(rule.weekdays)].sort((a, b) => a - b);
      return days.length === 1 ? `w:${days[0]}` : `wd:${days.join(',')}`;
    }
    case 'every-n-weeks':
      if (rule.n === 1) return `w:${rule.weekday}`;
      return `n:${rule.n}:${rule.weekday}:${mod(diffDays(mondayOf(rule.anchor), '1970-01-05') / 7, rule.n)}`;
    case 'monthly-nth-weekday':
      return `m:${rule.weekday}:${rule.nth}`;
    case 'once':
      return `o:${rule.date}`;
    case 'cadence-day': {
      if (!team) return null;
      const anchor = addDays(team.cadence.start, rule.day);
      return ruleKey(
        { type: 'every-n-weeks', weekday: weekday(anchor), n: team.cadence.lengthWeeks, anchor },
        null,
      );
    }
    case 'cycle-milestone': {
      const m = team?.cycles
        .find((c) => c.id === rule.cycleId)
        ?.milestones.find((x) => x.id === rule.milestoneId);
      return m ? `o:${addDays(m.date, rule.offsetDays)}` : null;
    }
  }
}

const nameKey = (s: string): string => s.trim().toLowerCase();

/**
 * The review list of an import into one team: candidates (recurring series and future single
 * events), skipped items with their reason, and the number of hidden past single events.
 */
export function reviewImport(
  events: IcsEvent[],
  ctx: { ws: Workspace; teamId: string; today: ISODate },
): ImportReview {
  const { ws, teamId, today } = ctx;
  const tz = ws.settings.timezone;
  const horizonEnd = ws.settings.horizon.to;
  const team = ws.teams.find((t) => t.id === teamId) ?? null;
  const teamEvents: CalEvent[] = team?.events ?? [];

  const byUid = new Map<string, string>();
  const bySignature = new Map<string, string>();
  for (const e of teamEvents) {
    byUid.set(`${e.id}.${teamId}.${ws.id}`, e.id);
    const rk = ruleKey(e.rule, team);
    if (rk !== null) {
      const sig = `${nameKey(e.name)}\u0000${e.time}\u0000${rk}`;
      if (!bySignature.has(sig)) bySignature.set(sig, e.id);
    }
  }
  const categoryByName = new Map<string, string>();
  for (const c of ws.categories)
    if (!categoryByName.has(nameKey(c.name))) categoryByName.set(nameKey(c.name), c.id);

  const overrides = new Map<string, number>();
  for (const ev of events)
    if (ev.recurrenceId) overrides.set(ev.uid, (overrides.get(ev.uid) ?? 0) + 1);

  const review: ImportReview = { candidates: [], skipped: [], hiddenPast: 0 };
  const keys = new Set<string>();
  const skip = (ev: IcsEvent, reason: SkipReason) =>
    review.skipped.push({ summary: ev.summary, reason });
  // A long Outlook export holds years of moved instances: one entry per series, named after it.
  const seriesName = new Map<string, string>();
  for (const ev of events)
    if (!ev.recurrenceId && ev.rrule && !seriesName.has(ev.uid)) seriesName.set(ev.uid, ev.summary);
  const overrideEntry = new Map<string, SkippedItem>();

  for (const ev of events) {
    if (ev.recurrenceId) {
      const entry = overrideEntry.get(ev.uid);
      if (entry) entry.count = (entry.count ?? 1) + 1;
      else {
        const item: SkippedItem = {
          summary: seriesName.get(ev.uid) ?? ev.summary,
          reason: 'override',
          count: 1,
        };
        overrideEntry.set(ev.uid, item);
        review.skipped.push(item);
      }
      continue;
    }
    // Wall-clock start: a UTC time is converted into the workspace zone, others are kept.
    let { date, time } = ev.start;
    if (ev.start.utc && time !== null)
      ({ date, time } = utcToLocal(parseDate(date) + toMinutes(time) * 60_000, tz));
    // Past single events are only counted, whatever else is wrong with them.
    if (!ev.rrule && date < today) {
      review.hiddenPast++;
      continue;
    }
    if (ev.allDay || time === null) {
      skip(ev, 'allDay');
      continue;
    }
    if (ev.cancelled) {
      skip(ev, 'cancelled');
      continue;
    }
    if (ev.durationMinutes === null || ev.durationMinutes <= 0) {
      skip(ev, 'noDuration');
      continue;
    }
    // A conference over several days is not a meeting; importing it would fill whole weeks.
    if (ev.durationMinutes > 24 * 60) {
      skip(ev, 'multiDay');
      continue;
    }

    const notes: NoteKey[] = [];
    let rule: Rule;
    let selected = true;
    if (ev.rrule) {
      // A UTC start that lands on another local date moves its weekdays with it.
      const rr = { ...ev.rrule };
      const delta = diffDays(date, ev.start.date);
      if (delta !== 0 && rr.BYDAY !== undefined) rr.BYDAY = shiftByday(rr.BYDAY, delta);
      const last = lastDate(rr, date, tz);
      if (last !== null && last < today) {
        skip(ev, 'ended');
        continue;
      }
      const mapped = mapRule(rr, date);
      if (mapped) rule = mapped;
      else {
        // At its next date; a series whose next date cannot be estimated counts as ended.
        const next = nextOccurrence(rr, date, today);
        if (next === null || (last !== null && next > last)) {
          skip(ev, 'ended');
          continue;
        }
        rule = { type: 'once', date: next };
        selected = false;
        notes.push({ key: 'import.note.unmapped', params: {} });
      }
      if (mapped && last !== null && last < horizonEnd)
        notes.push({ key: 'import.note.ends', params: { date: last } });
      const exceptions = ev.exdates + (overrides.get(ev.uid) ?? 0);
      if (exceptions > 0)
        notes.push({ key: 'import.note.exceptions', params: { count: exceptions } });
    } else rule = { type: 'once', date };

    const zone = ev.start.tzid;
    if (zone !== null && zone !== tz && WINDOWS_ZONES[zone] !== tz)
      notes.push({ key: 'import.note.zone', params: { zone } });

    let duplicateOf: string | null = null;
    if (ev.uid.endsWith('@caldence')) {
      const base = ev.uid.slice(0, -'@caldence'.length);
      duplicateOf =
        byUid.get(base) ??
        (/-\d{4}-\d{2}-\d{2}$/.test(base) ? (byUid.get(base.slice(0, -11)) ?? null) : null);
    }
    const untitled = ev.summary === '';
    if (!untitled)
      duplicateOf ??=
        bySignature.get(`${nameKey(ev.summary)}\u0000${time}\u0000${ruleKey(rule, null)}`) ?? null;
    if (duplicateOf !== null) selected = false;

    let key = ev.uid || `event-${review.candidates.length + 1}`;
    for (let n = 2; keys.has(key); n++) key = `${ev.uid}#${n}`;
    keys.add(key);

    const first = ev.categories[0];
    review.candidates.push({
      key,
      name: ev.summary,
      untitled,
      rule,
      time,
      duration: ev.durationMinutes,
      categoryHint: first === undefined ? null : (categoryByName.get(nameKey(first)) ?? null),
      notes,
      duplicateOf,
      selected,
    });
  }
  return review;
}
