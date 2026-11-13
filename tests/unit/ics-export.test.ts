import ICAL from 'ical.js';
import { describe, expect, it } from 'vitest';
import valid from '../../src/data/examples/example.caldence.json';
import {
  contentLine,
  escapeText,
  exportIcs,
  exportIcsWithCounts,
  foldLine,
  paramValue,
  scopeHasEvents,
  uidPart,
  vtimezone,
  type IcsExportOptions,
} from '../../src/core/ics';
import { escapeRegExp } from '../../scripts/version-bump.mjs';
import type { CalEvent, Rule, Workspace } from '../../src/core/model';
import { occurrences } from '../../src/core/recurrence';
import { applyTemplate } from '../../src/core/template';
import { builtinTemplate } from '../../src/data/templates';
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
        const uid = `${event.id}.${team.id}.${ws.id}`;
        const single = new RegExp(`^${escapeRegExp(uid)}-\\d{4}-\\d{2}-\\d{2}@caldence$`);
        const got = [...expanded.entries()]
          .filter(([k]) => k === `${uid}@caldence` || single.test(k))
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
    expect(prop(kickoff, 'UID')).toBe(`UID:ev-kickoff.team-alpha.${ws.id}-2027-01-11@caldence`);
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

describe('exportIcs fix round 1', () => {
  it('gives milestones of two teams from the same template distinct UIDs', () => {
    const tpl = builtinTemplate('safe', 'en');
    let ws = example();
    for (const name of ['Train A', 'Train B']) {
      const r = applyTemplate(ws, tpl, { name, today: '2027-01-04' });
      if (!r.ok) throw new Error('template failed');
      ws = r.value[0];
    }
    const text = run(
      ws,
      opts({ allDay: { holidays: false, schoolHolidays: false, milestones: true } }),
    );
    const ms = unfold(text).filter((l) => l.startsWith('UID:milestone-'));
    const added = ws.teams.slice(-2);
    const dates = added.map((t) => t.cycles[0]!.milestones[0]!.date);
    expect(dates[0]).toBe(dates[1]);
    for (const t of added) {
      const c = t.cycles[0]!;
      const m = c.milestones[0]!;
      expect(ms).toContain(`UID:milestone-${t.id}-${c.id}-${m.id}-${m.date}.${ws.id}@caldence`);
    }
    expect(new Set(ms).size).toBe(ms.length);
    const all = unfold(text).filter((l) => l.startsWith('UID:'));
    expect(new Set(all).size).toBe(all.length);
  });

  it('leaves out a series whose occurrences in range are all skipped', () => {
    const w = example();
    w.teams = [w.teams[0]!];
    w.teams[0]!.events = [
      ev('ev-friday', { type: 'weekly', weekday: 5 }, '10:00'),
      ev('ev-monday', { type: 'weekly', weekday: 1 }, '10:00'),
    ];
    // 2027-03-26 Good Friday .. 2027-03-29 Easter Monday: every occurrence is a holiday.
    const text = run(w, opts({ from: '2027-03-26', to: '2027-03-29' }));
    expect(text).not.toContain('BEGIN:VEVENT');
    w.settings.skipHolidays = false;
    expect(blocks(run(w, opts({ from: '2027-03-26', to: '2027-03-29' })), 'VEVENT')).toHaveLength(
      2,
    );
  });

  it('maps monthly nth 5 and expands only months with a fifth weekday', () => {
    const w = example();
    w.teams[0]!.events = [
      ev('ev-fifth', { type: 'monthly-nth-weekday', weekday: 5, nth: 5 }, '12:00'),
    ];
    const text = run(w);
    const b = blocks(text, 'VEVENT')[0]!;
    // Fridays: 2027 months with five Fridays are Jan, Apr, Jul, Oct, Dec.
    expect(prop(b, 'RRULE')).toBe('RRULE:FREQ=MONTHLY;BYDAY=5FR;WKST=MO;COUNT=5');
    const team = w.teams[0]!;
    const expected = occurrences(team, w.settings, workspaceIndex(w))
      .filter((o) => !o.skippedHoliday)
      .map((o) => `${o.date} ${o.start}`);
    expect([...expand(text).values()][0]!.local).toEqual(expected);
    expect(expected.map((e) => e.slice(5, 7))).toEqual(['01', '04', '07', '10', '12']);
  });

  it('writes DTEND across midnight', () => {
    const w = example();
    w.teams[0]!.events = [
      { ...ev('ev-late', { type: 'weekly', weekday: 5 }, '23:30'), duration: 120 },
    ];
    const b = blocks(run(w, opts({ from: '2027-01-04', to: '2027-01-31' })), 'VEVENT')[0]!;
    expect(prop(b, 'DTSTART')).toBe('DTSTART;TZID=Europe/Berlin:20270108T233000');
    expect(prop(b, 'DTEND')).toBe('DTEND;TZID=Europe/Berlin:20270109T013000');
  });

  it('folds 4-byte emoji without splitting them', () => {
    const line = `SUMMARY:${'😀'.repeat(40)}`;
    const folded = foldLine(line);
    const enc = new TextEncoder();
    const dec = new TextDecoder('utf-8', { fatal: true });
    for (const l of folded.split('\r\n')) {
      const bytes = enc.encode(l);
      expect(bytes.length).toBeLessThanOrEqual(75);
      expect(() => dec.decode(bytes)).not.toThrow();
      expect(l).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    }
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });

  it('writes the southern-hemisphere VTIMEZONE for Australia/Sydney', () => {
    const text = vtimezone('Australia/Sydney', 2027, 2027).join('\n');
    expect(text).toContain(
      'BEGIN:STANDARD\nDTSTART:20270404T030000\nTZOFFSETFROM:+1100\nTZOFFSETTO:+1000\nTZNAME:+10:00\nEND:STANDARD',
    );
    expect(text).toContain(
      'BEGIN:DAYLIGHT\nDTSTART:20271003T020000\nTZOFFSETFROM:+1000\nTZOFFSETTO:+1100\nTZNAME:+11:00\nEND:DAYLIGHT',
    );
    expect(text.match(/BEGIN:(STANDARD|DAYLIGHT)/g)).toHaveLength(2);
  });
});

describe('exportIcsWithCounts', () => {
  const withRange = (ws: Workspace, o: IcsExportOptions) =>
    workspaceIndex({ ...ws, settings: { ...ws.settings, horizon: { from: o.from, to: o.to } } });

  for (const allDay of [
    { holidays: false, schoolHolidays: false, milestones: false },
    { holidays: true, schoolHolidays: true, milestones: true },
  ])
    it(`counts the series and single VEVENTs it writes (all-day ${allDay.holidays})`, () => {
      const ws = example();
      const o = opts({ allDay });
      const r = exportIcsWithCounts(ws, withRange(ws, o), o);
      expect(r.text).toBe(run(ws, o));
      const vevents = blocks(r.text, 'VEVENT');
      const series = vevents.filter((b) => prop(b, 'RRULE') !== undefined).length;
      expect(series).toBeGreaterThan(0);
      expect(r.series).toBe(series);
      expect(r.single).toBe(vevents.length - series);
      if (allDay.holidays) expect(r.single).toBeGreaterThan(0);
    });

  it('gives zero counts for a period without meetings', () => {
    const ws = example();
    const o = opts({ from: '1999-01-01', to: '1999-01-02' });
    const r = exportIcsWithCounts(ws, withRange(ws, o), o);
    expect([r.series, r.single]).toEqual([0, 0]);
  });
});

describe('scopeHasEvents', () => {
  it('is true for a team with meetings and false for an unknown or unused scope', () => {
    const ws = example();
    const team = ws.teams.find((t) => t.events.length > 0)!;
    expect(scopeHasEvents(ws, { teamId: team.id })).toBe(true);
    expect(scopeHasEvents(ws, { teamId: 'nope' })).toBe(false);
    expect(scopeHasEvents(ws, { personId: 'nobody' })).toBe(false);
    const role = ws.roles.find((r) =>
      ws.teams.some((t) => t.events.some((e) => e.participants.some((p) => p.roleId === r.id))),
    )!;
    expect(scopeHasEvents(ws, { roleId: role.id })).toBe(true);
  });
});

describe('exportIcs with an unknown region', () => {
  it('writes no holidays and does not throw', () => {
    const ws = example();
    ws.settings.region = 'xx-gone';
    const index = workspaceIndex(ws);
    expect(index.holidays.size).toBe(0);
    expect(index.schoolHolidays.size).toBe(0);
    let text = '';
    expect(() => {
      text = run(ws, opts({ allDay: { holidays: true, schoolHolidays: true, milestones: false } }));
    }).not.toThrow();
    expect(text).not.toContain('UID:holiday-');
    expect(text).not.toContain('UID:school-');
    expect(text).toContain('BEGIN:VEVENT');
  });
});

describe('exportIcs with unsafe ids or zone names (security #39)', () => {
  // validate() rejects such ids; the export must stay safe even when a caller skips it.
  const INJECT = '\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:injected\r\nX-A;B="c":d';

  it('never lets an id end a content line', () => {
    const ws = example();
    ws.id = `w${INJECT}`;
    const team = ws.teams[0]!;
    team.id = `t${INJECT}`;
    team.events[0]!.id = `e${INJECT}`;
    for (const c of team.cycles) {
      c.id = `c${INJECT}`;
      for (const m of c.milestones) m.id = `m${INJECT}`;
    }
    const text = run(
      ws,
      opts({ allDay: { holidays: true, schoolHolidays: true, milestones: true } }),
    );
    const lines = unfold(text);
    expect(lines).not.toContain('SUMMARY:injected');
    // eslint-disable-next-line no-control-regex -- looking for control characters
    expect(text).not.toMatch(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    for (const uid of lines.filter((l) => l.startsWith('UID:')))
      expect(uid).toMatch(/^UID:[A-Za-z0-9._@-]+$/);
    expect(new ICAL.Component(ICAL.parse(text)).getAllSubcomponents('vevent').length).toBe(
      blocks(text, 'VEVENT').length,
    );
  });

  it('refuses a zone name with a line break, so it never reaches the file', () => {
    // The zone also goes through contentLine/paramValue (tested below) in case this ever changes.
    const ws = example();
    ws.settings.timezone = 'Europe/Berlin\r\nX-EVIL:1';
    expect(() => run(ws)).toThrow(RangeError);
  });
});

describe('line helpers (security #39)', () => {
  it('drops control characters from a content line, keeps tabs', () => {
    expect(contentLine('A\r\nB\u0000C\tD\u007f')).toBe('ABC\tD');
  });
  it('keeps safe id characters in a UID part and replaces the rest', () => {
    expect(uidPart('e-1.a_B')).toBe('e-1.a_B');
    expect(uidPart('a\r\n;:"b')).toBe('a_____b');
  });
  it('quotes a parameter value with ; : or , and drops quotes', () => {
    expect(paramValue('Europe/Berlin')).toBe('Europe/Berlin');
    expect(paramValue('Etc/GMT+1')).toBe('Etc/GMT+1');
    expect(paramValue('a;b')).toBe('"a;b"');
    expect(paramValue('a:b')).toBe('"a:b"');
    expect(paramValue('a"b\r\n')).toBe('ab');
  });
});
