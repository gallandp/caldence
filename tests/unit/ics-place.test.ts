import { describe, expect, it } from 'vitest';
import { exportIcsWithCounts, sequenceOf, type ExportedEvent } from '../../src/core/ics';
import { importEvents } from '../../src/core/edit';
import { parseIcs, reviewImport } from '../../src/core/icsImport';
import { LIMITS } from '../../src/core/limits';
import { migrate } from '../../src/core/migrate';
import {
  CURRENT_SCHEMA,
  ORG_UNIT,
  emptyWorkspace,
  type CalEvent,
  type Workspace,
} from '../../src/core/model';
import type { HolidayIndex } from '../../src/core/regions';
import { teamToTemplate } from '../../src/core/template';
import { validate } from '../../src/core/validate';

const noIndex = (): HolidayIndex => ({
  holidays: new Map(),
  schoolHolidays: new Map(),
  beyondKnown: false,
});

const daily = (extra: Partial<CalEvent> = {}): CalEvent => ({
  id: 'e1',
  name: 'Daily Scrum',
  categoryId: 'c1',
  rule: { type: 'weekly', weekday: 1 },
  time: '09:15',
  duration: 15,
  participants: [{ roleId: 'dev', share: 1 }],
  preparation: 0,
  ...extra,
});

function workspace(event: CalEvent): Workspace {
  const ws = emptyWorkspace('2027-01-04');
  ws.settings.horizon = { from: '2027-01-04', to: '2027-01-31' };
  ws.roles = [{ id: 'dev', name: 'Developer', colour: '#16a34a' }];
  ws.categories = [{ id: 'c1', name: 'Scrum', colour: '#2563eb' }];
  ws.teams = [
    {
      id: 'alpha',
      name: 'Alpha',
      cadence: { kind: 'sprint', lengthWeeks: 2, start: '2027-01-04' },
      members: [],
      memberHours: {},
      assumptions: {},
      cycles: [],
      events: [event],
    },
  ];
  return ws;
}

const icsOf = (
  ws: Workspace,
  scope = {},
  previous?: ExportedEvent[],
  now = '2027-01-01T00:00:00Z',
) =>
  exportIcsWithCounts(ws, noIndex(), {
    scope,
    from: '2027-01-04',
    to: '2027-01-31',
    reminderMinutes: 10,
    allDay: { holidays: false, schoolHolidays: false, milestones: false },
    now: new Date(now),
    locale: 'en',
    ...(previous ? { previous } : {}),
  });

const unfold = (text: string): string[] => text.replace(/\r\n[ \t]/g, '').split('\r\n');

describe('place or link of a meeting in the .ics export (#442)', () => {
  it('writes a room as LOCATION', () => {
    const lines = unfold(
      icsOf(workspace(daily({ onSite: { travel: 0 }, place: 'Room 2.14, east wing' }))).text,
    );
    expect(lines).toContain('LOCATION:Room 2.14\\, east wing');
    expect(lines.some((l) => l.startsWith('URL'))).toBe(false);
  });

  it('writes a link as LOCATION and URL', () => {
    const link = 'https://meet.example.com/alpha-daily?pwd=a;b';
    const lines = unfold(icsOf(workspace(daily({ place: link }))).text);
    expect(lines).toContain('LOCATION:https://meet.example.com/alpha-daily?pwd=a\\;b');
    expect(lines).toContain(`URL:${link}`);
  });

  it('does not take a text that only starts like a link as URL', () => {
    const lines = unfold(
      icsOf(workspace(daily({ place: 'https://exa mple.com and room 3' }))).text,
    );
    expect(lines.some((l) => l.startsWith('URL'))).toBe(false);
  });

  it('keeps no control characters from the place', () => {
    const text = icsOf(workspace(daily({ place: 'Room 1\r\nX-EVIL:1' }))).text;
    expect(unfold(text)).not.toContain('X-EVIL:1');
  });

  it('writes no "On site" location without a place, but keeps it in the description', () => {
    const lines = unfold(icsOf(workspace(daily({ onSite: { travel: 30 } }))).text);
    expect(lines.some((l) => l.startsWith('LOCATION'))).toBe(false);
    expect(lines).toContain(
      'DESCRIPTION:Alpha\\nDeveloper\\nOn site · Travel: 30 min (there and back)',
    );
    const remote = unfold(icsOf(workspace(daily())).text);
    expect(remote.some((l) => l.startsWith('LOCATION'))).toBe(false);
    expect(remote).toContain('DESCRIPTION:Alpha\\nDeveloper');
  });

  it('names the team in the title and the reminder', () => {
    const r = icsOf(workspace(daily()));
    const lines = unfold(r.text);
    expect(lines).toContain('SUMMARY:Daily Scrum · Alpha');
    expect(lines.filter((l) => l === 'DESCRIPTION:Daily Scrum · Alpha')).toHaveLength(1);
    expect(r.events[0]!.summary).toBe('Daily Scrum · Alpha');
  });

  it('names the area for area meetings', () => {
    const ws = workspace(daily());
    ws.areas = [
      {
        id: 'north',
        name: 'North, Train',
        teamIds: ['alpha'],
        members: [],
        memberHours: {},
        cycles: [],
        events: [daily({ id: 'e2', name: 'Scrum of Scrums', participants: [] })],
      },
    ];
    const lines = unfold(icsOf(ws, { teamId: 'north' }).text);
    expect(lines).toContain('SUMMARY:Scrum of Scrums · North\\, Train');
  });

  it('validates the place', () => {
    const errorsOf = (place: unknown) => {
      const r = validate(workspace(daily({ place } as Partial<CalEvent>)));
      return r.ok ? [] : r.errors.map((e) => `${e.path} ${e.key}`);
    };
    expect(errorsOf('Room 1')).toEqual([]);
    expect(errorsOf(undefined)).toEqual([]);
    expect(errorsOf(3)).toEqual(['teams.0.events.0.place error.type']);
    expect(errorsOf('x'.repeat(201))).toEqual(['teams.0.events.0.place error.text.tooLong']);
  });

  it('leaves the place out of a team template', () => {
    const ws = workspace(daily({ onSite: { travel: 10 }, place: 'Room 1' }));
    const tpl = teamToTemplate(ws, 'alpha', { id: 'x', name: 'X', description: '' });
    expect(tpl.team.events[0]!.onSite).toEqual({ travel: 10 });
    expect(tpl.team.events[0]!.place).toBeUndefined();
  });

  it('opens a schema 9 file unchanged but for the version', () => {
    expect(CURRENT_SCHEMA).toBe(10);
    const old = { ...workspace(daily()), schemaVersion: 9 };
    const r = migrate(old);
    expect(r.ok && r.value).toEqual({ ...old, schemaVersion: 10 });
  });
  it('puts a link into the notes too', () => {
    const lines = unfold(icsOf(workspace(daily({ place: 'https://meet.example.com/d' }))).text);
    expect(lines).toContain('DESCRIPTION:Alpha\\nDeveloper\\nhttps://meet.example.com/d');
  });

  it('adds nothing to the title of an organisation without a name', () => {
    const ws = workspace(daily());
    ws.organisation = { events: [daily({ id: 'e9', name: 'All hands', participants: [] })] };
    const lines = unfold(icsOf(ws, { teamId: ORG_UNIT }).text);
    expect(lines).toContain('SUMMARY:All hands');
    ws.organisation.name = 'Northwind';
    expect(unfold(icsOf(ws, { teamId: ORG_UNIT }).text)).toContain('SUMMARY:All hands · Northwind');
  });

  it('gives each entry of an earlier export a new SEQUENCE once', () => {
    const ws = workspace(daily());
    const now = icsOf(ws);
    // What an export before #442 remembered: the bare name, another fingerprint.
    const before: ExportedEvent[] = now.events.map((e) => ({
      ...e,
      summary: 'Daily Scrum',
      sequence: 100,
      hash: '00000000',
    }));
    const later = '2027-01-02T00:00:00Z';
    const first = icsOf(ws, {}, before, later);
    expect(first.events[0]!.sequence).toBe(sequenceOf(new Date(later)));
    expect(first.events[0]!.summary).toBe('Daily Scrum · Alpha');
    const again = icsOf(ws, {}, first.events, '2027-01-03T00:00:00Z');
    expect(again.events[0]!.sequence).toBe(first.events[0]!.sequence);
  });

  it('imports its own export by the meeting name, also into another file', () => {
    const ws = workspace(daily());
    const parsed = parseIcs(icsOf(ws).text);
    expect(parsed.ok).toBe(true);
    const other = workspace(daily({ id: 'x1' }));
    other.id = 'another-file';
    const review = reviewImport(parsed.ok ? parsed.value : [], {
      ws: other,
      teamId: 'alpha',
      today: '2027-01-04',
    });
    expect(review.candidates).toHaveLength(1);
    expect(review.candidates[0]!.name).toBe('Daily Scrum');
    expect(review.candidates[0]!.duplicateOf).toBe('x1');
    // Another file's meeting with a name that only looks like the suffix keeps it.
    const plain = parseIcs(
      icsOf(workspace(daily({ name: 'Sync · Beta' }))).text.replace(
        'DESCRIPTION:Alpha',
        'DESCRIPTION:Gamma',
      ),
    );
    expect(plain.ok && plain.value[0]!.summary).toBe('Sync · Beta · Alpha');
  });
});

describe('import of LOCATION (#466)', () => {
  it('fills the place of an imported meeting from LOCATION, also from its own export', () => {
    const ws = workspace(daily({ place: 'Room 2.14, 2nd floor' }));
    const parsed = parseIcs(icsOf(ws).text);
    expect(parsed.ok && parsed.value[0]!.location).toBe('Room 2.14, 2nd floor');
    const target = workspace(daily({ id: 'x1', name: 'Other' }));
    const review = reviewImport(parsed.ok ? parsed.value : [], {
      ws: target,
      teamId: 'alpha',
      today: '2027-01-04',
    });
    expect(review.candidates[0]!.place).toBe('Room 2.14, 2nd floor');
    const out = importEvents(
      target,
      'alpha',
      review.candidates.map((candidate) => ({ candidate, categoryId: 'c1' })),
      { roleIds: ['dev'], newCategoryName: 'Import', untitledName: 'Untitled' },
    );
    expect(out.ok && out.value.teams[0]!.events[1]!.place).toBe('Room 2.14, 2nd floor');
  });

  it('adds no place without LOCATION and cuts an overlong one to the text limit', () => {
    const ics = (location?: string) =>
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:a',
        'SUMMARY:Sync',
        'DTSTART:20270105T090000',
        'DTEND:20270105T093000',
        ...(location !== undefined ? [`LOCATION:${location}`] : []),
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
    const place = (location?: string) => {
      const parsed = parseIcs(ics(location));
      const review = reviewImport(parsed.ok ? parsed.value : [], {
        ws: workspace(daily()),
        teamId: 'alpha',
        today: '2027-01-04',
      });
      const out = importEvents(
        workspace(daily()),
        'alpha',
        review.candidates.map((candidate) => ({ candidate, categoryId: 'c1' })),
        { roleIds: ['dev'], newCategoryName: 'Import', untitledName: 'Untitled' },
      );
      expect(out.ok).toBe(true);
      return out.ok ? out.value.teams[0]!.events[1]!.place : 'invalid';
    };
    expect(place()).toBeUndefined();
    expect(place('  ')).toBeUndefined();
    expect(place('x'.repeat(LIMITS.textChars + 50))).toHaveLength(LIMITS.textChars);
  });
});
