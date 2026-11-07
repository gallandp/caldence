import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addItem, addTeam, importEvents, upsertEvent } from '../../src/core/edit';
import { exportIcs } from '../../src/core/ics';
import {
  parseIcs,
  reviewImport,
  type IcsEvent,
  type ImportCandidate,
  type ImportReview,
} from '../../src/core/icsImport';
import { emptyWorkspace, type Rule, type Workspace } from '../../src/core/model';
import { occurrences } from '../../src/core/recurrence';
import { validate, type Result } from '../../src/core/validate';
import { workspaceIndex } from '../../src/core/views';
import { exampleWorkspace } from '../../src/data/examples';

const TODAY = '2026-11-07';
const fixture = (name: string): string => readFileSync(`tests/fixtures/ics/${name}`, 'utf8');

function ok<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
}

/** A workspace with one team, one role and a Berlin horizon covering TODAY + 1 year. */
function target(): { ws: Workspace; teamId: string } {
  let ws = emptyWorkspace(TODAY);
  ws.settings.timezone = 'Europe/Berlin';
  [ws] = addItem(ws, 'roles', { name: 'Dev', colour: '#1d4ed8' });
  const [next, teamId] = addTeam(ws, 'Alpha', TODAY);
  return { ws: next, teamId };
}

/** 2,000 past single appointments, one per day from 2021-01-04. */
function pastSingles(): string {
  const out: string[] = [];
  const start = Date.UTC(2021, 0, 4);
  for (let i = 0; i < 2000; i++) {
    const d = new Date(start + i * 86_400_000);
    const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    out.push(
      'BEGIN:VEVENT',
      `DTSTART;TZID=W. Europe Standard Time:${ymd}T080000`,
      `DTEND;TZID=W. Europe Standard Time:${ymd}T083000`,
      `SUMMARY;LANGUAGE=de:Termin ${i}`,
      `UID:past-${i}`,
      'END:VEVENT',
    );
  }
  return out.join('\r\n') + '\r\n';
}

const outlookText = (): string =>
  fixture('outlook-sample.ics').replace('END:VCALENDAR', `${pastSingles()}END:VCALENDAR`);

const byName = (review: ImportReview, name: string): ImportCandidate => {
  const c = review.candidates.find((x) => x.name === name);
  if (!c) throw new Error(`no candidate ${name}`);
  return c;
};
const noteKeys = (c: ImportCandidate): string[] => c.notes.map((n) => n.key);

describe('parseIcs', () => {
  it('rejects a text file that is not iCalendar', () => {
    const r = parseIcs('hello');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.key).toBe('ics.error.notIcs');
  });

  it('rejects a calendar without any VEVENT', () => {
    const r = parseIcs('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.key).toBe('ics.error.empty');
  });

  it('unfolds lines and reads quoted parameters', () => {
    const events = ok(parseIcs(fixture('google-sample.ics')));
    expect(events).toHaveLength(2);
    const retro = events[1]!;
    expect(retro.summary).toBe('Retro; Lessons learned');
    expect(retro.start).toEqual({
      date: '2026-12-01',
      time: '16:00',
      tzid: 'Europe/Berlin',
      utc: false,
    });
    expect(retro.durationMinutes).toBe(30);
    expect(retro.rrule).toMatchObject({ FREQ: 'WEEKLY', BYDAY: 'TU', UNTIL: '20270330T145959Z' });
    const planning = events[0]!;
    expect(planning.start).toEqual({ date: '2027-07-01', time: '07:00', tzid: null, utc: true });
    expect(planning.uid).toBe('3k9vq0example1@google.com');
  });

  it('reads Outlook UIDs, EXDATEs, RECURRENCE-ID, all-day and STATUS', () => {
    const events: IcsEvent[] = ok(parseIcs(fixture('outlook-sample.ics')));
    expect(events).toHaveLength(9);
    expect(events[0]!.uid).toMatch(/0001$/);
    expect(events[0]!.categories).toEqual(['Abstimmung']);
    expect(events[1]!.exdates).toBe(1);
    expect(events[2]!.recurrenceId).toBe(true);
    expect(events[5]!.allDay).toBe(true);
    expect(events[6]!.cancelled).toBe(true);
    expect(events[0]!.start.tzid).toBe('W. Europe Standard Time');
  });
});

describe('reviewImport: Outlook', () => {
  it('maps the series and the future single event', () => {
    const { ws, teamId } = target();
    const review = reviewImport(ok(parseIcs(outlookText())), { ws, teamId, today: TODAY });

    const weekly = byName(review, 'Team-Abstimmung');
    expect(weekly.rule).toEqual({ type: 'weekly', weekday: 2 });
    expect(weekly.time).toBe('13:00');
    expect(weekly.duration).toBe(30);
    expect(weekly.selected).toBe(true);
    expect(noteKeys(weekly)).toEqual([]);

    const biweekly = byName(review, 'Architektur-Runde');
    expect(biweekly.rule).toEqual({
      type: 'every-n-weeks',
      n: 2,
      weekday: 4,
      anchor: '2026-01-08',
    });
    expect(biweekly.time).toBe('09:30');
    expect(noteKeys(biweekly)).toContain('import.note.exceptions');
    expect(biweekly.notes.find((n) => n.key === 'import.note.exceptions')!.params).toEqual({
      count: 2,
    });

    const monthly = byName(review, 'Bereichsrunde');
    expect(monthly.rule).toEqual({ type: 'monthly-nth-weekday', weekday: 3, nth: 2 });
    expect(monthly.time).toBe('14:00');

    const daily = byName(review, 'Daily');
    expect(daily.rule).toEqual({ type: 'weekdays', weekdays: [1, 2, 3, 4, 5] });
    expect(daily.duration).toBe(15);

    const single = byName(review, 'Kundenworkshop');
    expect(single.rule).toEqual({ type: 'once', date: '2027-02-10' });
    expect(single.time).toBe('10:00');
    expect(single.duration).toBe(90);
    expect(single.selected).toBe(true);

    const yearly = byName(review, 'Jahresplanung');
    expect(yearly.rule).toEqual({ type: 'once', date: '2026-03-15' });
    expect(yearly.selected).toBe(false);
    expect(noteKeys(yearly)).toContain('import.note.unmapped');

    expect(review.candidates).toHaveLength(6);
    // The Windows zone is an alias of the workspace zone: no zone note.
    for (const c of review.candidates) expect(noteKeys(c)).not.toContain('import.note.zone');
  });

  it('reports all-day, cancelled and override items and hides past singles', () => {
    const { ws, teamId } = target();
    const events = ok(parseIcs(outlookText()));
    const t0 = performance.now();
    const review = reviewImport(events, { ws, teamId, today: TODAY });
    expect(performance.now() - t0).toBeLessThan(500);
    expect(review.skipped).toEqual([
      { summary: 'Architektur-Runde (verschoben)', reason: 'override' },
      { summary: 'Betriebsausflug', reason: 'allDay' },
      { summary: 'Abgesagt: Lieferantentermin', reason: 'cancelled' },
    ]);
    expect(review.hiddenPast).toBe(2000);
  });

  it('adds a zone note for a zone that is not the workspace zone', () => {
    const { ws, teamId } = target();
    const text = fixture('outlook-sample.ics').replaceAll(
      'W. Europe Standard Time',
      'GMT Standard Time',
    );
    const review = reviewImport(ok(parseIcs(text)), { ws, teamId, today: TODAY });
    const weekly = byName(review, 'Team-Abstimmung');
    expect(weekly.time).toBe('13:00');
    expect(weekly.notes).toContainEqual({
      key: 'import.note.zone',
      params: { zone: 'GMT Standard Time' },
    });
  });
});

describe('reviewImport: Google and endings', () => {
  it('converts UTC times into the workspace zone', () => {
    const { ws, teamId } = target();
    const review = reviewImport(ok(parseIcs(fixture('google-sample.ics'))), {
      ws,
      teamId,
      today: TODAY,
    });
    const planning = byName(review, 'Quarterly Planning');
    expect(planning.time).toBe('09:00');
    expect(planning.rule).toEqual({ type: 'once', date: '2027-07-01' });
    expect(planning.duration).toBe(60);

    const retro = byName(review, 'Retro; Lessons learned');
    expect(retro.rule).toEqual({ type: 'weekly', weekday: 2 });
    expect(retro.notes).toContainEqual({
      key: 'import.note.ends',
      params: { date: '2027-03-30' },
    });
  });

  it('skips series that ended before today and items without a duration', () => {
    const { ws, teamId } = target();
    const text = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:a',
      'SUMMARY:Old until',
      'DTSTART:20250106T090000',
      'DTEND:20250106T100000',
      'RRULE:FREQ=WEEKLY;UNTIL=20250630',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:b',
      'SUMMARY:Old count',
      'DTSTART:20260105T090000',
      'DURATION:PT1H',
      'RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=10',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:c',
      'SUMMARY:Live count',
      'DTSTART:20260105T090000',
      'DURATION:PT45M',
      'RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=30',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:d',
      'SUMMARY:Zero',
      'DTSTART:20270105T090000',
      'DTEND:20270105T090000',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const review = reviewImport(ok(parseIcs(text)), { ws, teamId, today: TODAY });
    expect(review.skipped).toEqual([
      { summary: 'Old until', reason: 'ended' },
      { summary: 'Old count', reason: 'ended' },
      { summary: 'Zero', reason: 'noDuration' },
    ]);
    const live = byName(review, 'Live count');
    expect(live.duration).toBe(45);
    // 2026-01-05 + 29 × 2 weeks
    expect(live.notes).toContainEqual({ key: 'import.note.ends', params: { date: '2027-02-15' } });
  });

  it('maps WEEKLY with several days to weekdays and leaves odd rules unmapped', () => {
    const { ws, teamId } = target();
    const ev = (uid: string, rrule: string) => [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `SUMMARY:${uid}`,
      'DTSTART:20270104T090000',
      'DTEND:20270104T100000',
      `RRULE:${rrule}`,
      'END:VEVENT',
    ];
    const text = [
      'BEGIN:VCALENDAR',
      ...ev('multi', 'FREQ=WEEKLY;BYDAY=WE,MO'),
      ...ev('monthly2', 'FREQ=MONTHLY;BYDAY=-1FR'),
      ...ev('everyday', 'FREQ=DAILY'),
      ...ev('daily2', 'FREQ=DAILY;INTERVAL=2'),
      ...ev('multi2', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE'),
      ...ev('monthday', 'FREQ=MONTHLY;BYMONTHDAY=4'),
      'END:VCALENDAR',
    ].join('\r\n');
    const review = reviewImport(ok(parseIcs(text)), { ws, teamId, today: TODAY });
    expect(byName(review, 'multi').rule).toEqual({ type: 'weekdays', weekdays: [1, 3] });
    expect(byName(review, 'monthly2').rule).toEqual({
      type: 'monthly-nth-weekday',
      weekday: 5,
      nth: -1,
    });
    expect(byName(review, 'everyday').rule).toEqual({
      type: 'weekdays',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    });
    for (const name of ['daily2', 'multi2', 'monthday']) {
      const c = byName(review, name);
      expect(c.rule).toEqual({ type: 'once', date: '2027-01-04' });
      expect(c.selected).toBe(false);
      expect(noteKeys(c)).toContain('import.note.unmapped');
    }
  });
});

describe('reviewImport: duplicates and categories', () => {
  it('flags an event with the same name, rule and time as a duplicate', () => {
    const { ws: base, teamId } = target();
    const [withCat, catId] = addItem(base, 'categories', {
      name: 'Abstimmung',
      colour: '#1d4ed8',
    });
    const [ws, eventId] = upsertEvent(withCat, teamId, {
      id: '',
      name: ' team-abstimmung ',
      categoryId: catId,
      rule: { type: 'weekly', weekday: 2 },
      time: '13:00',
      duration: 60,
      participants: [],
      preparation: 0,
    });
    const review = reviewImport(ok(parseIcs(fixture('outlook-sample.ics'))), {
      ws,
      teamId,
      today: TODAY,
    });
    const weekly = byName(review, 'Team-Abstimmung');
    expect(weekly.duplicateOf).toBe(eventId);
    expect(weekly.selected).toBe(false);
    expect(weekly.categoryHint).toBe(catId);
    expect(byName(review, 'Daily').duplicateOf).toBeNull();
    expect(byName(review, 'Daily').categoryHint).toBeNull();
  });
});

describe('round trip with exportIcs', () => {
  it('reads back every exported event with its rule, time, duration and source', () => {
    const ws = exampleWorkspace();
    const index = workspaceIndex(ws);
    const { from, to } = ws.settings.horizon;
    const text = exportIcs(ws, index, {
      scope: {},
      from,
      to,
      reminderMinutes: 10,
      allDay: { holidays: true, schoolHolidays: true, milestones: true },
      now: new Date(Date.UTC(2026, 10, 7)),
      locale: 'de',
    });
    const events = ok(parseIcs(text));
    const all = new Set<string>();
    const covered = new Set<string>();
    for (const team of ws.teams) {
      const review = reviewImport(events, { ws, teamId: team.id, today: TODAY });
      for (const c of review.candidates) all.add(c.key);
      const firstDate = new Map<string, string>();
      for (const o of occurrences(team, ws.settings, index))
        if (!firstDate.has(o.eventId)) firstDate.set(o.eventId, o.date);

      const mine = review.candidates.filter((c) => team.events.some((e) => e.id === c.duplicateOf));
      for (const event of team.events) {
        const found = mine.filter((c) => c.duplicateOf === event.id);
        expect(found.length, event.id).toBeGreaterThan(0);
        for (const c of found) {
          expect(c.selected).toBe(false);
          expect(c.time).toBe(event.time);
          expect(c.duration).toBe(event.duration);
          expect(c.categoryHint).toBe(event.categoryId);
          const first = firstDate.get(event.id)!;
          let expected: Rule | null = null;
          if (event.rule.type === 'cadence-day')
            expected = {
              type: 'every-n-weeks',
              n: team.cadence.lengthWeeks,
              weekday: new Date(`${first}T00:00:00Z`).getUTCDay() || 7,
              anchor: first,
            };
          else if (event.rule.type === 'every-n-weeks') expected = { ...event.rule, anchor: first };
          else if (event.rule.type !== 'once' && event.rule.type !== 'cycle-milestone')
            expected = event.rule;
          if (expected) expect(c.rule, event.id).toEqual(expected);
          else expect(c.rule.type).toBe('once');
        }
      }
      // Candidates of the other team are not duplicates of this team.
      expect(review.candidates.every((c) => c.duplicateOf === null || mine.includes(c))).toBe(true);
      for (const c of mine) covered.add(c.key);
    }
    // Every exported event is recognised as the source event of its own team.
    expect(all.size).toBeGreaterThan(0);
    expect([...covered].sort()).toEqual([...all].sort());
  });
});

describe('importEvents', () => {
  it('adds the category to a workspace without categories and passes validate', () => {
    const { ws, teamId } = target();
    const review = reviewImport(ok(parseIcs(fixture('outlook-sample.ics'))), {
      ws,
      teamId,
      today: TODAY,
    });
    const roleId = ws.roles[0]!.id;
    const items = review.candidates
      .filter((c) => c.selected)
      .map((candidate) => ({ candidate, categoryId: '' }));
    const out = ok(
      importEvents(ws, teamId, items, { roleIds: [roleId], newCategoryName: 'Import' }),
    );
    expect(validate(out).ok).toBe(true);
    expect(out.categories).toHaveLength(1);
    expect(out.categories[0]!.name).toBe('Import');
    const events = out.teams.find((t) => t.id === teamId)!.events;
    expect(events).toHaveLength(items.length);
    expect(events.every((e) => e.categoryId === out.categories[0]!.id)).toBe(true);
    const weekly = events.find((e) => e.name === 'Team-Abstimmung')!;
    expect(weekly).toMatchObject({
      rule: { type: 'weekly', weekday: 2 },
      time: '13:00',
      duration: 30,
      participants: [{ roleId, share: 1 }],
      preparation: 0,
    });
    expect(ws.categories).toHaveLength(0);
  });

  it('uses the chosen existing category', () => {
    const { ws: base, teamId } = target();
    const [ws, catId] = addItem(base, 'categories', { name: 'Termine', colour: '#047857' });
    const review = reviewImport(ok(parseIcs(fixture('google-sample.ics'))), {
      ws,
      teamId,
      today: TODAY,
    });
    const items = review.candidates.map((candidate) => ({ candidate, categoryId: catId }));
    const out = ok(importEvents(ws, teamId, items, { roleIds: [], newCategoryName: 'Import' }));
    expect(out.categories).toHaveLength(1);
    expect(out.teams[0]!.events.map((e) => e.categoryId)).toEqual([catId, catId]);
  });

  it('refuses an unknown team', () => {
    const { ws } = target();
    const r = importEvents(ws, 'nope', [], { roleIds: [], newCategoryName: 'Import' });
    expect(r.ok).toBe(false);
  });
});
