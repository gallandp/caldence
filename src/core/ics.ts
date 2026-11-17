import { APP_VERSION } from '../version';
import { addDays, diffDays, toMinutes, weekday, type ISODate, type Time } from './date';
import {
  areaAsTeam,
  areasInScope,
  attendees,
  type CalEvent,
  type Rule,
  type Team,
  type Workspace,
} from './model';
import { occurrences, type Occurrence } from './recurrence';
import type { HolidayIndex, HolidayName } from './regions';
import { scopeTeams, type Filter } from './views';
import { offsetMinutes, transitions } from './zone';

/**
 * A VEVENT as it was written by an export, kept so that a later export of the same scope can
 * send it again as cancelled when it is gone. `start`/`end` are the whole DTSTART/DTEND lines.
 */
export interface ExportedEvent {
  uid: string;
  /** `event.unit` of a meeting; absent for all-day items. */
  key?: string;
  /** Set for a recurring series (one UID for all occurrences). */
  series?: boolean;
  date: ISODate;
  start: string;
  end: string;
  summary: string;
}

export interface IcsExportOptions {
  scope: Filter;
  /** What the last export of this scope wrote; what is gone now is written as cancelled. */
  previous?: ExportedEvent[];
  from: ISODate;
  to: ISODate;
  reminderMinutes: number | null;
  allDay: { holidays: boolean; schoolHolidays: boolean; milestones: boolean };
  now: Date;
  locale: 'de' | 'en';
}

const pad = (n: number, w = 2): string => String(Math.abs(n)).padStart(w, '0');

/** Escapes a TEXT value: backslash, semicolon, comma and newlines. */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Control characters RFC 5545 forbids in content lines (all but HTAB). */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\x00-\x08\x0a-\x1f\x7f]/g;

/** A content line without control characters: no value can end the line or start a new one. */
export const contentLine = (line: string): string => line.replace(CONTROL, '');

/** A UID part: ids are restricted on load (validate.ts), anything else becomes '_'. */
export const uidPart = (s: string): string => s.replace(/[^A-Za-z0-9._-]/g, '_');

/** A parameter value (RFC 5545 3.1): no quotes or control characters, quoted when it holds ;:, */
export function paramValue(s: string): string {
  const v = contentLine(s).replace(/"/g, '');
  return /[;:,]/.test(v) ? `"${v}"` : v;
}

const utf8Length = (ch: string): number => {
  const c = ch.codePointAt(0) ?? 0;
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
};

/** Folds a content line at 75 octets (continuations start with a space), never inside a character. */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let cur = '';
  let octets = 0;
  let limit = 75;
  for (const ch of line) {
    const n = utf8Length(ch);
    if (octets + n > limit) {
      parts.push(cur);
      cur = ' ';
      octets = 1;
      limit = 75;
    }
    cur += ch;
    octets += n;
  }
  parts.push(cur);
  return parts.join('\r\n');
}

/** +0100 style offset. */
const tzOffset = (min: number): string =>
  `${min < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(min) / 60))}${pad(Math.abs(min) % 60)}`;

/** +01:00 style offset, used as TZNAME. */
const tzName = (min: number): string =>
  `${min < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(min) / 60))}:${pad(Math.abs(min) % 60)}`;

/** YYYYMMDDTHHMMSS of a UTC-millisecond value read as wall-clock (no zone conversion). */
function stamp(ms: number): string {
  const d = new Date(ms);
  return (
    `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

/** VTIMEZONE lines: one STANDARD or DAYLIGHT per transition in fromYear..toYear. */
export function vtimezone(tz: string, fromYear: number, toYear: number): string[] {
  const lines = ['BEGIN:VTIMEZONE', `TZID:${contentLine(tz)}`];
  const sub = (kind: string, dtstart: string, from: number, to: number) => {
    lines.push(
      `BEGIN:${kind}`,
      `DTSTART:${dtstart}`,
      `TZOFFSETFROM:${tzOffset(from)}`,
      `TZOFFSETTO:${tzOffset(to)}`,
      `TZNAME:${tzName(to)}`,
      `END:${kind}`,
    );
  };
  const list = transitions(tz, fromYear, toYear);
  if (list.length === 0) {
    const off = offsetMinutes(tz, Date.UTC(fromYear, 0, 1));
    sub('STANDARD', '19700101T000000', off, off);
  }
  for (const t of list) {
    sub(t.to > t.from ? 'DAYLIGHT' : 'STANDARD', stamp(t.utcMs + t.from * 60_000), t.from, t.to);
  }
  lines.push('END:VTIMEZONE');
  return lines;
}

const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const day = (wd: number): string => DAYS[wd - 1] ?? 'MO';

const compactDate = (d: ISODate): string => d.replace(/-/g, '');
const localStamp = (d: ISODate, t: Time): string => `${compactDate(d)}T${t.replace(':', '')}00`;

/** Wall-clock end: date and time after adding minutes (may cross midnight). */
function plusMinutes(d: ISODate, t: Time, minutes: number): string {
  const total = toMinutes(t) + minutes;
  const days = Math.floor(total / 1440);
  const rest = total - days * 1440;
  return `${compactDate(addDays(d, days))}T${pad(Math.floor(rest / 60))}${pad(rest % 60)}00`;
}

function rrule(rule: Rule, team: Team, first: ISODate, count: number): string | null {
  let body: string;
  switch (rule.type) {
    case 'weekly':
      body = `FREQ=WEEKLY;BYDAY=${day(rule.weekday)}`;
      break;
    case 'weekdays':
      body = `FREQ=WEEKLY;BYDAY=${[...rule.weekdays]
        .sort((a, b) => a - b)
        .map(day)
        .join(',')}`;
      break;
    case 'every-n-weeks':
      body = `FREQ=WEEKLY;INTERVAL=${rule.n};BYDAY=${day(rule.weekday)}`;
      break;
    case 'monthly-nth-weekday':
      body = `FREQ=MONTHLY;BYDAY=${rule.nth}${day(rule.weekday)}`;
      break;
    case 'cadence-day':
      body = `FREQ=WEEKLY;INTERVAL=${team.cadence.lengthWeeks};BYDAY=${day(weekday(first))}`;
      break;
    case 'cycle-milestone':
    case 'once':
      return null;
  }
  return `RRULE:${body};WKST=MO;COUNT=${count}`;
}

function utcStamp(d: Date): string {
  return `${stamp(Math.floor(d.getTime() / 1000) * 1000)}Z`;
}

/** Events of a team or area in scope (role or person filter). */
function eventsInScope(ws: Workspace, team: Team, scope: Filter): CalEvent[] {
  if (scope.personId) {
    const personId = scope.personId;
    return team.events.filter((e) =>
      e.participants.some((p) => attendees(ws, team.id, p).includes(personId)),
    );
  }
  if (scope.roleId) {
    return team.events.filter((e) => e.participants.some((p) => p.roleId === scope.roleId));
  }
  return team.events;
}

/**
 * True when the scope has at least one meeting at all, whatever the period. A cheap check for
 * enabling an export button; the exported file may still be empty for a given period.
 */
export function scopeHasEvents(ws: Workspace, scope: Filter): boolean {
  return exportUnits(ws, scope).some((team) => eventsInScope(ws, team, scope).length > 0);
}

/**
 * Teams and areas whose meetings a scope exports. An area on its own gives its own meetings
 * only: its teams have calendars of their own, so a ZIP of all calendars holds nothing twice.
 */
function exportUnits(ws: Workspace, scope: Filter): Team[] {
  const area = ws.areas.find((a) => a.id === scope.teamId);
  if (area) return [areaAsTeam(area)];
  return [...scopeTeams(ws, scope), ...areasInScope(ws, scope)];
}

/**
 * An exported file, how many of its VEVENTs are recurring series, single entries and cancelled
 * ones, and what the calendar holds after importing it (to pass as `previous` to the next export
 * of the same scope): what it wrote plus earlier entries outside its range.
 */
export type IcsExport = {
  text: string;
  series: number;
  single: number;
  cancelled: number;
  events: ExportedEvent[];
};

/**
 * SEQUENCE of every VEVENT: the minutes since 2020, so each export is newer than the one before
 * and calendars that honour updates replace the earlier version instead of adding a copy.
 */
export function sequenceOf(now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.UTC(2020, 0, 1)) / 60_000));
}

/**
 * The scoped events of the workspace in from..to as an iCalendar file (CRLF, folded).
 * `index` must cover from..to.
 */
export function exportIcs(ws: Workspace, index: HolidayIndex, opts: IcsExportOptions): string {
  return exportIcsWithCounts(ws, index, opts).text;
}

/**
 * Like `exportIcs`, with the number of recurring series (VEVENTs with an RRULE) and of single
 * entries (every other VEVENT, all-day items included), counted while the file is built.
 */
export function exportIcsWithCounts(
  ws: Workspace,
  index: HolidayIndex,
  opts: IcsExportOptions,
): IcsExport {
  let series = 0;
  let single = 0;
  let cancelled = 0;
  const events: ExportedEvent[] = [];
  /** Meetings in scope, and those that were written now, as `event.unit`. */
  const scopeKeys = new Set<string>();
  const writtenKeys = new Set<string>();
  const tz = ws.settings.timezone;
  const tzid = paramValue(tz);
  const dtstamp = `DTSTAMP:${utcStamp(opts.now)}`;
  // Every VEVENT of this export carries the same version, so a re-export updates all of them.
  const version = [`SEQUENCE:${sequenceOf(opts.now)}`, `LAST-MODIFIED:${utcStamp(opts.now)}`];
  const settings = { ...ws.settings, horizon: { from: opts.from, to: opts.to } };
  const roleNames = new Map(ws.roles.map((r) => [r.id, r.name]));
  const categoryNames = new Map(ws.categories.map((c) => [c.id, c.name]));
  const fromYear = Number(opts.from.slice(0, 4));
  const toYear = Number(opts.to.slice(0, 4));

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Caldence//Caldence ${APP_VERSION}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    // One year earlier, so times before the first in-range change resolve to a known offset.
    ...vtimezone(tz, fromYear - 1, toYear),
  ];

  const alarm = (summary: string): string[] =>
    opts.reminderMinutes === null
      ? []
      : [
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `TRIGGER:-PT${opts.reminderMinutes}M`,
          `DESCRIPTION:${escapeText(summary)}`,
          'END:VALARM',
        ];

  for (const team of exportUnits(ws, opts.scope)) {
    const byEvent = new Map<string, Occurrence[]>();
    for (const occ of occurrences(team, settings, index)) {
      const list = byEvent.get(occ.eventId);
      if (list) list.push(occ);
      else byEvent.set(occ.eventId, [occ]);
    }
    for (const event of eventsInScope(ws, team, opts.scope)) {
      scopeKeys.add(`${event.id}.${team.id}`);
      const occs = byEvent.get(event.id);
      const first = occs?.[0];
      if (!occs || !first) continue;
      const uid = [event.id, team.id, ws.id].map(uidPart).join('.');
      const key = `${event.id}.${team.id}`;
      const roles = event.participants
        .map((p) => roleNames.get(p.roleId))
        .filter((n): n is string => n !== undefined);
      const category = categoryNames.get(event.categoryId);
      const common = [
        `SUMMARY:${escapeText(event.name)}`,
        ...(category !== undefined ? [`CATEGORIES:${escapeText(category)}`] : []),
        `DESCRIPTION:${escapeText(`${team.name}\n${roles.join(', ')}`)}`,
        'TRANSP:OPAQUE',
      ];
      // A series whose every occurrence in range is skipped is not written.
      if (occs.every((o) => o.skippedHoliday)) continue;
      const rule = rrule(event.rule, team, first.date, occs.length);
      if (rule === null) {
        // Single entries: a skipped one is simply not written.
        for (const occ of occs) {
          if (occ.skippedHoliday) continue;
          single++;
          const start = `DTSTART;TZID=${tzid}:${localStamp(occ.date, occ.start)}`;
          const end = `DTEND;TZID=${tzid}:${plusMinutes(occ.date, occ.start, occ.duration)}`;
          const id = `${uid}-${occ.date}@caldence`;
          events.push({ uid: id, key, date: occ.date, start, end, summary: event.name });
          writtenKeys.add(key);
          lines.push(
            'BEGIN:VEVENT',
            `UID:${id}`,
            dtstamp,
            ...version,
            start,
            end,
            ...common,
            ...alarm(event.name),
            'END:VEVENT',
          );
        }
        continue;
      }
      series++;
      const start = `DTSTART;TZID=${tzid}:${localStamp(first.date, first.start)}`;
      const end = `DTEND;TZID=${tzid}:${plusMinutes(first.date, first.start, first.duration)}`;
      events.push({
        uid: `${uid}@caldence`,
        key,
        series: true,
        date: first.date,
        start,
        end,
        summary: event.name,
      });
      writtenKeys.add(key);
      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}@caldence`,
        dtstamp,
        ...version,
        start,
        end,
        rule,
        ...occs
          .filter((o) => o.skippedHoliday)
          .map((o) => `EXDATE;TZID=${tzid}:${localStamp(o.date, o.start)}`),
        ...common,
        ...alarm(event.name),
        'END:VEVENT',
      );
    }
  }

  const allDay = (
    uid: string,
    from: ISODate,
    toExclusive: ISODate,
    summary: string,
    desc?: string,
  ) => {
    single++;
    const id = `${uidPart(uid)}.${uidPart(ws.id)}@caldence`;
    const start = `DTSTART;VALUE=DATE:${compactDate(from)}`;
    const end = `DTEND;VALUE=DATE:${compactDate(toExclusive)}`;
    events.push({ uid: id, date: from, start, end, summary });
    lines.push(
      'BEGIN:VEVENT',
      `UID:${id}`,
      dtstamp,
      ...version,
      start,
      end,
      `SUMMARY:${escapeText(summary)}`,
      ...(desc !== undefined ? [`DESCRIPTION:${escapeText(desc)}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  };
  const inRange = (d: ISODate) => d >= opts.from && d <= opts.to;

  if (opts.allDay.holidays) {
    for (const [date, name] of [...index.holidays].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (inRange(date)) allDay(`holiday-${date}`, date, addDays(date, 1), name[opts.locale]);
    }
  }

  if (opts.allDay.schoolHolidays) {
    const days = [...index.schoolHolidays]
      .filter(([d]) => inRange(d))
      .sort(([a], [b]) => (a < b ? -1 : 1));
    let run: { from: ISODate; to: ISODate; name: HolidayName } | null = null;
    const flush = () => {
      if (run) allDay(`school-${run.from}`, run.from, addDays(run.to, 1), run.name[opts.locale]);
    };
    for (const [date, name] of days) {
      const same =
        run && diffDays(date, run.to) === 1 && run.name.de === name.de && run.name.en === name.en;
      if (run && same) run.to = date;
      else {
        flush();
        run = { from: date, to: date, name };
      }
    }
    flush();
  }

  if (opts.allDay.milestones) {
    for (const team of exportUnits(ws, opts.scope)) {
      for (const cycle of team.cycles) {
        for (const m of cycle.milestones) {
          if (!inRange(m.date)) continue;
          allDay(
            `milestone-${team.id}-${cycle.id}-${m.id}-${m.date}`,
            m.date,
            addDays(m.date, 1),
            m.name,
            `${team.name}\n${cycle.name}`,
          );
        }
      }
    }
  }

  // What the last export wrote and is gone now: cancelled, so calendars that honour updates
  // remove it. A single entry only within this export's range (a shorter range is no removal);
  // a series when its meeting is gone or is now written in another form.
  // What is neither written nor cancelled is still in the calendar: it stays remembered.
  const written = new Set(events.map((e) => e.uid));
  const kept: ExportedEvent[] = [];
  for (const old of opts.previous ?? []) {
    if (written.has(old.uid)) continue;
    const gone = old.series
      ? !old.key || !scopeKeys.has(old.key) || writtenKeys.has(old.key)
      : old.date >= opts.from && old.date <= opts.to;
    if (!gone) {
      kept.push(old);
      continue;
    }
    cancelled++;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${old.uid}`,
      dtstamp,
      ...version,
      old.start,
      old.end,
      `SUMMARY:${escapeText(old.summary)}`,
      'STATUS:CANCELLED',
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return {
    text: lines.map((l) => `${foldLine(contentLine(l))}\r\n`).join(''),
    series,
    single,
    cancelled,
    events: [...events, ...kept],
  };
}
