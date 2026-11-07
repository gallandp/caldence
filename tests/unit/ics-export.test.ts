import ICAL from 'ical.js';
import { describe, expect, it } from 'vitest';
import valid from '../../src/data/examples/example.caldence.json';
import {
  escapeText,
  exportIcs,
  foldLine,
  vtimezone,
  type IcsExportOptions,
} from '../../src/core/ics';
import type { CalEvent, Rule, Workspace } from '../../src/core/model';
import { occurrences } from '../../src/core/recurrence';
import { workspaceIndex } from '../../src/core/views';
import type { Filter } from '../../src/core/views';

const FROM = '2027-01-01';
const TO = '2027-12-31';

const example = (): Workspace => structuredClone(valid) as unknown as Workspace;

const opts = (over: Partial<IcsExportOptions> = {}): IcsExportOptions => ({
  scope: {},
  from: FROM,
  to: TO,
  reminderMinutes: null,
  allDay: { holidays: false, schoolHolidays: false, milestones: false },
  now: new Date(Date.UTC(2026, 10, 7, 12, 0, 0)),
  locale: 'en',
  ...over,
});

function run(ws: Workspace, o: IcsExportOptions = opts()): string {
  const copy: Workspace = {
    ...ws,
    settings: { ...ws.settings, horizon: { from: o.from, to: o.to } },
  };
  return exportIcs(ws, workspaceIndex(copy), o);
}

const unfold = (text: string): string[] => text.replace(/\r\n[ \t]/g, '').split('\r\n');

function blocks(text: string, name: string): string[][] {
  const out: string[][] = [];
  let cur: string[] | null = null;
  for (const line of unfold(text)) {
    if (line === `BEGIN:${name}`) cur = [];
    else if (line === `END:${name}`) {
      if (cur) out.push(cur);
      cur = null;
    } else cur?.push(line);
  }
  return out;
}

const prop = (block: string[], name: string): string | undefined =>
  block.find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));

const ev = (id: string, rule: Rule, time: string, roleId = 'role-po'): CalEvent => ({
  id,
  name: id,
  categoryId: valid.categories[0]!.id,
  rule,
  time,
  duration: 60,
  participants: [{ roleId, share: 1 }],
  preparation: 0,
});

const pad = (n: number): string => String(n).padStart(2, '0');

/** Parse with ical.js and expand every VEVENT to local 'YYYY-MM-DD HH:MM' keyed by UID. */
function expand(text: string): Map<string, { local: string[]; utc: number[] }> {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz);
  const out = new Map<string, { local: string[]; utc: number[] }>();
  for (const v of root.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(v);
    if (event.startDate.isDate) continue;
    const it = event.iterator();
    const local: string[] = [];
    const utc: number[] = [];
    for (let t = it.next(); t; t = it.next()) {
      local.push(`${t.year}-${pad(t.month)}-${pad(t.day)} ${pad(t.hour)}:${pad(t.minute)}`);
      utc.push(t.toUnixTime());
      if (local.length > 1000) throw new Error('runaway expansion');
    }
    out.set(event.uid, { local, utc });
  }
  return out;
}

describe('escapeText and foldLine', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    expect(escapeText('x\r\ny')).toBe('x\\ny');
  });

  it('keeps short lines and folds long ones at 75 octets', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short');
    const folded = foldLine(`DESCRIPTION:${'x'.repeat(200)}`);
    for (const l of folded.split('\r\n'))
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(`DESCRIPTION:${'x'.repeat(200)}`);
  });

  it('never splits a UTF-8 character', () => {
    const line = `SUMMARY:${'ä'.repeat(40)}`;
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const l of parts) {
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
      expect(l).not.toContain('�');
    }
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
});

describe('vtimezone', () => {
  it('lists the Berlin transitions of 2027', () => {
    const lines = vtimezone('Europe/Berlin', 2027, 2027);
    expect(lines[0]).toBe('BEGIN:VTIMEZONE');
    expect(lines).toContain('TZID:Europe/Berlin');
    const text = lines.join('\n');
    expect(text).toContain(
      'BEGIN:DAYLIGHT\nDTSTART:20270328T020000\nTZOFFSETFROM:+0100\nTZOFFSETTO:+0200\nTZNAME:+02:00\nEND:DAYLIGHT',
    );
    expect(text).toContain(
      'BEGIN:STANDARD\nDTSTART:20271031T030000\nTZOFFSETFROM:+0200\nTZOFFSETTO:+0100\nTZNAME:+01:00\nEND:STANDARD',
    );
  });

  it('gives one STANDARD for a zone without transitions', () => {
    const text = vtimezone('Asia/Tokyo', 2027, 2027).join('\n');
    expect(text).toContain(
      'BEGIN:STANDARD\nDTSTART:19700101T000000\nTZOFFSETFROM:+0900\nTZOFFSETTO:+0900\nTZNAME:+09:00\nEND:STANDARD',
    );
    expect(text.match(/BEGIN:(STANDARD|DAYLIGHT)/g)).toHaveLength(1);
  });
});

describe('exportIcs structure', () => {
  const text = run(
    example(),
    opts({ allDay: { holidays: true, schoolHolidays: true, milestones: true } }),
  );

  it('ends every line in CRLF and keeps lines within 75 octets', () => {
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    for (const l of text.split('\r\n'))
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });

  it('has the calendar header', () => {
    const lines = unfold(text);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines).toContain('PRODID:-//Caldence//Caldence 0.0.0-test//EN');
    expect(lines).toContain('CALSCALE:GREGORIAN');
    expect(lines).toContain('METHOD:PUBLISH');
    expect(lines.at(-2)).toBe('END:VCALENDAR');
  });

  it('balances BEGIN and END', () => {
    const stack: string[] = [];
    for (const l of unfold(text)) {
      if (l.startsWith('BEGIN:')) stack.push(l.slice(6));
      else if (l.startsWith('END:')) expect(stack.pop()).toBe(l.slice(4));
    }
    expect(stack).toEqual([]);
  });

  it('gives every VEVENT a UID, DTSTAMP and DTSTART', () => {
    const events = blocks(text, 'VEVENT');
    expect(events.length).toBeGreaterThan(10);
    for (const b of events) {
      expect(prop(b, 'UID')).toBeDefined();
      expect(prop(b, 'DTSTAMP')).toBe('DTSTAMP:20261107T120000Z');
      expect(prop(b, 'DTSTART')).toBeDefined();
    }
  });

  it('has one VTIMEZONE with the Berlin transitions of 2027', () => {
    const tz = blocks(text, 'VTIMEZONE');
    expect(tz).toHaveLength(1);
    expect(tz[0]).toContain('DTSTART:20270328T020000');
    expect(tz[0]).toContain('DTSTART:20271031T030000');
  });

  it('writes summary, categories, description and transparency', () => {
    const sync = blocks(text, 'VEVENT').find((b) => prop(b, 'UID')?.startsWith('UID:ev-sync.'))!;
    expect(sync).toContain(
      'SUMMARY:' + escapeText(valid.teams[0]!.events.find((e) => e.id === 'ev-sync')!.name),
    );
    expect(prop(sync, 'CATEGORIES')).toBeDefined();
    const desc = prop(sync, 'DESCRIPTION')!;
    expect(desc).toContain(escapeText(valid.teams[0]!.name));
    for (const r of valid.roles.filter((r) => r.id === 'role-po' || r.id === 'role-sm'))
      expect(desc).toContain(escapeText(r.name));
    expect(sync).toContain('TRANSP:OPAQUE');
    expect(prop(sync, 'RRULE')).toBe('RRULE:FREQ=WEEKLY;BYDAY=TU;WKST=MO;COUNT=51');
  });
});

describe('exportIcs rules (independent parse with ical.js)', () => {
  const ws = example();
  ws.teams[1]!.events.push(
    ev('ev-daily', { type: 'weekdays', weekdays: [1, 2, 3, 4, 5] }, '09:15', 'role-dev'),
    ev('ev-last-fri', { type: 'monthly-nth-weekday', weekday: 5, nth: -1 }, '16:00'),
  );
  const text = run(ws);
  const expanded = expand(text);
  const index = workspaceIndex(ws);

  it('covers every rule type', () => {
    const types = new Set(ws.teams.flatMap((t) => t.events.map((e) => e.rule.type)));
    expect([...types].sort()).toEqual(
      [
        'cadence-day',
        'cycle-milestone',
        'every-n-weeks',
        'monthly-nth-weekday',
        'once',
        'weekdays',
        'weekly',
      ].sort(),
    );
  });

  for (const team of ws.teams) {
    for (const event of team.events) {
      it(`expands ${event.id} (${event.rule.type}) to the core occurrences`, () => {
        const expected = occurrences(team, ws.settings, index)
          .filter((o) => o.eventId === event.id && !o.skippedHoliday)
          .map((o) => `${o.date} ${o.start}`);
        expect(expected.length).toBeGreaterThan(0);
        const uid = `${event.id}.${team.id}.${ws.id}@caldence`;
        const got = [...expanded.entries()]
          .filter(([k]) => k === uid || k.startsWith(`${uid}-`))
          .flatMap(([, v]) => v.local)
          .sort();
        expect(got).toEqual(expected);
      });
    }
  }

  it('maps rules to RRULEs', () => {
    const rr = (id: string) =>
      prop(
        blocks(text, 'VEVENT').find((b) => prop(b, 'UID')!.startsWith(`UID:${id}.`))!,
        'RRULE',
      );
    expect(rr('ev-daily')).toMatch(/^RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;WKST=MO;COUNT=\d+$/);
    expect(rr('ev-refinement')).toMatch(
      /^RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=WE;WKST=MO;COUNT=\d+$/,
    );
    expect(rr('ev-stakeholders')).toMatch(/^RRULE:FREQ=MONTHLY;BYDAY=1TH;WKST=MO;COUNT=12$/);
    expect(rr('ev-last-fri')).toMatch(/^RRULE:FREQ=MONTHLY;BYDAY=-1FR;WKST=MO;COUNT=12$/);
    expect(rr('ev-planning')).toMatch(/^RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TH;WKST=MO;COUNT=\d+$/);
    const kickoff = blocks(text, 'VEVENT').find((b) =>
      prop(b, 'UID')!.startsWith('UID:ev-kickoff.'),
    )!;
    expect(prop(kickoff, 'RRULE')).toBeUndefined();
    expect(prop(kickoff, 'UID')).toBe(`UID:ev-kickoff.team-alpha.${ws.id}@caldence-2027-01-11`);
  });

  it('keeps 09:00 local across the DST change (Review Focus 2)', () => {
    const w = example();
    // 2027-03-29 is Easter Monday in Saxony; keep it so both sides of the change are present.
    w.settings.skipHolidays = false;
    w.teams[0]!.events = [ev('ev-monday', { type: 'weekly', weekday: 1 }, '09:00')];
    const out = expand(run(w, opts({ from: '2027-03-01', to: '2027-04-30' })));
    const series = out.get(`ev-monday.team-alpha.${w.id}@caldence`)!;
    const i22 = series.local.indexOf('2027-03-22 09:00');
    const i29 = series.local.indexOf('2027-03-29 09:00');
    expect(i22).toBeGreaterThanOrEqual(0);
    expect(i29).toBe(i22 + 1);
    // Real instants: 08:00Z before, 07:00Z after the change.
    expect(series.utc[i22]).toBe(Date.UTC(2027, 2, 22, 8) / 1000);
    expect(series.utc[i29]).toBe(Date.UTC(2027, 2, 29, 7) / 1000);
    expect(series.local.every((l) => l.endsWith(' 09:00'))).toBe(true);
  });
});

describe('exportIcs holidays (Review Focus 3)', () => {
  const friday = (skip: boolean): string => {
    const w = example();
    w.settings.skipHolidays = skip;
    w.teams[0]!.events = [ev('ev-friday', { type: 'weekly', weekday: 5 }, '10:00')];
    return run(w, opts({ from: '2027-03-01', to: '2027-04-30' }));
  };

  it('writes an EXDATE for a meeting on Good Friday', () => {
    const lines = unfold(friday(true));
    expect(lines).toContain('EXDATE;TZID=Europe/Berlin:20270326T100000');
    const series = [...expand(friday(true)).values()][0]!;
    expect(series.local).not.toContain('2027-03-26 10:00');
    expect(series.local).toContain('2027-04-02 10:00');
  });

  it('writes no EXDATE when skipHolidays is off', () => {
    const text = friday(false);
    expect(text).not.toContain('EXDATE');
    expect([...expand(text).values()][0]!.local).toContain('2027-03-26 10:00');
  });

  it('writes all-day holidays, school holidays and milestones', () => {
    const ws = example();
    const text = run(
      ws,
      opts({ allDay: { holidays: true, schoolHolidays: true, milestones: true }, locale: 'de' }),
    );
    const allDay = blocks(text, 'VEVENT').filter((b) =>
      prop(b, 'DTSTART')!.startsWith('DTSTART;VALUE=DATE:'),
    );
    const good = allDay.find((b) => prop(b, 'UID') === `UID:holiday-2027-03-26.${ws.id}@caldence`)!;
    expect(good).toContain('DTSTART;VALUE=DATE:20270326');
    expect(good).toContain('DTEND;VALUE=DATE:20270327');
    expect(good).toContain('SUMMARY:Karfreitag');
    expect(good).toContain('TRANSP:TRANSPARENT');
    const school = allDay.filter((b) => prop(b, 'UID')!.startsWith('UID:school-'));
    expect(school.length).toBeGreaterThan(0);
    for (const s of school) {
      const start = prop(s, 'DTSTART')!.slice(-8);
      const end = prop(s, 'DTEND')!.slice(-8);
      expect(end > start).toBe(true);
    }
    // One entry per period, not per day.
    expect(school.length).toBeLessThan(10);
    const ms = allDay.filter((b) => prop(b, 'UID')!.startsWith('UID:milestone-'));
    expect(ms.length).toBeGreaterThan(0);
    expect(prop(ms[0]!, 'UID')).toMatch(
      new RegExp(`^UID:milestone-[^.]+-\\d{4}-\\d{2}-\\d{2}\\.${ws.id}@caldence$`),
    );
  });

  it('leaves all-day entries out unless asked', () => {
    const text = run(example());
    expect(text).not.toContain('VALUE=DATE:');
  });
});

describe('exportIcs UIDs, scope and reminder', () => {
  const uids = (text: string): string[] =>
    unfold(text)
      .filter((l) => l.startsWith('UID:'))
      .sort();

  it('keeps UIDs stable across exports', () => {
    const ws = example();
    const a = run(ws, opts({ now: new Date(Date.UTC(2026, 0, 1)) }));
    const b = run(ws, opts({ now: new Date(Date.UTC(2026, 5, 1)) }));
    expect(uids(a)).toEqual(uids(b));
    expect(uids(a)).toContain(`UID:ev-sync.team-alpha.${ws.id}@caldence`);
  });

  it('differs between workspaces with different ids', () => {
    const a = example();
    const b = { ...example(), id: 'other-id' };
    const ua = uids(run(a));
    const ub = uids(run(b));
    expect(ua.filter((u) => ub.includes(u))).toEqual([]);
  });

  it('leaves out events without the scoped role', () => {
    const text = run(example(), opts({ scope: { roleId: 'role-dev' } satisfies Filter }));
    const ids = uids(text).map((u) => u.slice(4).split('.')[0]);
    expect(ids.sort()).toEqual(['ev-flow-review', 'ev-replenishment']);
    const sm = uids(run(example(), opts({ scope: { roleId: 'role-sm' } }))).map(
      (u) => u.slice(4).split('.')[0],
    );
    expect(sm).not.toContain('ev-stakeholders');
  });

  it('includes the events of every team of a person', () => {
    const text = run(example(), opts({ scope: { personId: 'person-sam' } }));
    const teams = new Set(uids(text).map((u) => u.split('.')[1]));
    expect([...teams].sort()).toEqual(['team-alpha', 'team-beta']);
    // Sam is SM in alpha: the PO-only stakeholder meeting is not theirs.
    expect(text).not.toContain('UID:ev-stakeholders.');
  });

  it('adds a reminder to timed events only', () => {
    const text = run(
      example(),
      opts({
        reminderMinutes: 15,
        allDay: { holidays: true, schoolHolidays: true, milestones: true },
      }),
    );
    for (const b of blocks(text, 'VEVENT')) {
      const timed = !prop(b, 'DTSTART')!.includes('VALUE=DATE');
      expect(b.includes('TRIGGER:-PT15M')).toBe(timed);
      if (timed) expect(b).toContain('ACTION:DISPLAY');
    }
    expect(run(example())).not.toContain('VALARM');
  });
});
