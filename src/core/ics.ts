import { APP_VERSION } from '../version';
import { addDays, diffDays, toMinutes, weekday, type ISODate, type Time } from './date';
import {
  areaAsTeam,
  areasInScope,
  findArea,
  eventAttendees,
  type CalEvent,
  type Rule,
  type Team,
  type Workspace,
  invitesRole,
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
  /**
   * Set for all-day items every selection of the workspace writes the same way (holidays, school
   * holidays): never cancelled, since another export in the same calendar may still hold them.
   */
  shared?: boolean;
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

/** Words for an on-site meeting (#309); the export has no i18n of its own. */
const ON_SITE = {
  de: { place: 'Vor Ort', travel: (m: number) => `Anreise: ${m} Min. (hin und zurück)` },
  en: { place: 'On site', travel: (m: number) => `Travel: ${m} min (there and back)` },
} as const;

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
    return team.events.filter((e) => eventAttendees(ws, team.id, e).includes(personId));
  }
  if (scope.roleId) {
    const roleId = scope.roleId;
    return team.events.filter((e) =>
      e.participants.some((p) => invitesRole(ws, team.id, p, roleId)),
    );
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
  // The organisation's calendar, like an area's, holds its own meetings (#328).
  const area = findArea(ws, scope.teamId);
  if (area) return [areaAsTeam(area)];
  return [...scopeTeams(ws, scope), ...areasInScope(ws, scope)];
}

/**
 * Every meeting a scope exports with its occurrences in from..to, holiday-skipped ones included
 * (`skippedHoliday`): the file leaves those out (EXDATE), `holidayDrops` names them.
 */
function* scopedMeetings(
  ws: Workspace,
  index: HolidayIndex,
  scope: Filter,
  from: ISODate,
  to: ISODate,
): Generator<{ team: Team; event: CalEvent; occs: Occurrence[] }> {
  const settings = { ...ws.settings, horizon: { from, to } };
  for (const team of exportUnits(ws, scope)) {
    const byEvent = new Map<string, Occurrence[]>();
    for (const occ of occurrences(team, settings, index)) {
      const list = byEvent.get(occ.eventId);
      if (list) list.push(occ);
      else byEvent.set(occ.eventId, [occ]);
    }
    for (const event of eventsInScope(ws, team, scope)) {
      yield { team, event, occs: byEvent.get(event.id) ?? [] };
    }
  }
}

/** Meetings holidays leave out of an export, all on the same dates (#341). */
export interface HolidayDrop {
  names: string[];
  dates: ISODate[];
}

/**
 * The meetings of a scope that fall on a public holiday in from..to and so are missing from its
 * .ics file. Meetings dropped on the same dates share one entry; meetings bound to the cadence
 * (sprint or PI days, such as Review and Retrospective) come first, then by their first date.
 * `index` must cover from..to. Empty when the file skips no holidays.
 */
export function holidayDrops(
  ws: Workspace,
  index: HolidayIndex,
  scope: Filter,
  from: ISODate,
  to: ISODate,
): HolidayDrop[] {
  const byName = new Map<string, { dates: Set<ISODate>; cadence: boolean }>();
  for (const { event, occs } of scopedMeetings(ws, index, scope, from, to)) {
    for (const occ of occs) {
      if (!occ.skippedHoliday) continue;
      const entry = byName.get(event.name) ?? { dates: new Set<ISODate>(), cadence: false };
      entry.dates.add(occ.date);
      entry.cadence ||= event.rule.type === 'cadence-day';
      byName.set(event.name, entry);
    }
  }
  const groups = new Map<string, { names: string[]; dates: ISODate[]; cadence: boolean }>();
  for (const [name, { dates, cadence }] of byName) {
    const sorted = [...dates].sort();
    const key = sorted.join(' ');
    const group = groups.get(key);
    if (group) {
      group.names.push(name);
      group.cadence ||= cadence;
    } else groups.set(key, { names: [name], dates: sorted, cadence });
  }
  const first = (g: { dates: ISODate[] }) => g.dates[0] ?? '';
  return [...groups.values()]
    .sort((a, b) =>
      a.cadence !== b.cadence
        ? a.cadence
          ? -1
          : 1
        : first(a) < first(b)
          ? -1
          : first(a) > first(b)
            ? 1
            : 0,
    )
    .map(({ names, dates }) => ({ names, dates }));
}

/** True when the person attends at least one of the meetings a team's or area's export holds. */
export function attendsUnitMeetings(ws: Workspace, unitId: string, personId: string): boolean {
  return exportUnits(ws, { teamId: unitId }).some(
    (unit) => eventsInScope(ws, unit, { personId }).length > 0,
  );
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
 * SEQUENCE of every VEVENT: the seconds since 2020, so each export is newer than the one before
 * and calendars that honour updates replace the earlier version instead of adding a copy.
 * Stays below 2^31 until 2088.
 */
export function sequenceOf(now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.UTC(2020, 0, 1)) / 1000));
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
  const personNames = new Map(ws.people.map((p) => [p.id, p.name]));
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

  for (const { team, event, occs } of scopedMeetings(ws, index, opts.scope, opts.from, opts.to)) {
    scopeKeys.add(`${event.id}.${team.id}`);
    const first = occs[0];
    if (!first) continue;
    const uid = [event.id, team.id, ws.id].map(uidPart).join('.');
    const key = `${event.id}.${team.id}`;
    // Roles, then the people invited by name (#285).
    const roles = event.participants
      .map((p) =>
        p.personId !== undefined ? personNames.get(p.personId) : roleNames.get(p.roleId),
      )
      .filter((n): n is string => n !== undefined);
    const category = categoryNames.get(event.categoryId);
    // Remote meetings are written as before, so existing subscriptions do not change (#309).
    const words = ON_SITE[opts.locale];
    const travel = event.onSite?.travel ? `\n${words.travel(event.onSite.travel)}` : '';
    const common = [
      `SUMMARY:${escapeText(event.name)}`,
      ...(category !== undefined ? [`CATEGORIES:${escapeText(category)}`] : []),
      ...(event.onSite ? [`LOCATION:${escapeText(words.place)}`] : []),
      `DESCRIPTION:${escapeText(`${team.name}\n${roles.join(', ')}${travel}`)}`,
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

  const allDay = (
    uid: string,
    from: ISODate,
    toExclusive: ISODate,
    summary: string,
    desc?: string,
    shared = false,
  ) => {
    single++;
    const id = `${uidPart(uid)}.${uidPart(ws.id)}@caldence`;
    const start = `DTSTART;VALUE=DATE:${compactDate(from)}`;
    const end = `DTEND;VALUE=DATE:${compactDate(toExclusive)}`;
    events.push({ uid: id, date: from, start, end, summary, ...(shared ? { shared } : {}) });
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
      if (inRange(date)) {
        allDay(`holiday-${date}`, date, addDays(date, 1), name[opts.locale], undefined, true);
      }
    }
  }

  if (opts.allDay.schoolHolidays) {
    // Runs are built from every day the index knows, also beyond the range, and written whole
    // when they touch the range: the UID names the first day of the holidays, not of the range,
    // so a later export with another start updates the same entry.
    const days = [...index.schoolHolidays].sort(([a], [b]) => (a < b ? -1 : 1));
    let run: { from: ISODate; to: ISODate; name: HolidayName } | null = null;
    const flush = () => {
      if (run && run.to >= opts.from && run.from <= opts.to) {
        const { from, to, name } = run;
        allDay(`school-${from}`, from, addDays(to, 1), name[opts.locale], undefined, true);
      }
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
  // remove it: a series whose meeting left this selection or no longer exists or is now written
  // in another form, and single entries within this export's range that were not written again.
  // A series that is still a meeting of this selection stays, even with nothing to write in this
  // range (all occurrences skipped, or the range is shorter): it may still run outside the range.
  // Holidays and school holidays are the same in every selection, so one calendar holding several
  // selections keeps them: never cancelled, only forgotten.
  // What is neither written nor cancelled is still in the calendar: it stays remembered.
  const written = new Set(events.map((e) => e.uid));
  const kept: ExportedEvent[] = [];
  const inRangeNow = (d: ISODate) => d >= opts.from && d <= opts.to;
  for (const old of opts.previous ?? []) {
    if (written.has(old.uid)) continue;
    if (old.shared) {
      if (!inRangeNow(old.date)) kept.push(old);
      continue;
    }
    const gone = old.series
      ? !old.key || !scopeKeys.has(old.key) || writtenKeys.has(old.key)
      : inRangeNow(old.date);
    if (!gone) {
      kept.push(old);
      continue;
    }
    cancelled++;
    // The stored lines name the time zone of their export; this file defines the current one.
    const zone = (line: string) => line.replace(/;TZID=[^:;]*/, `;TZID=${tzid}`);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${old.uid}`,
      dtstamp,
      ...version,
      zone(old.start),
      zone(old.end),
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
