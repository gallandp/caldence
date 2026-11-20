import { describe, expect, it } from 'vitest';
import { exportIcsWithCounts } from '../../src/core/ics';
import { migrate } from '../../src/core/migrate';
import {
  CURRENT_SCHEMA,
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

const icsOf = (ws: Workspace, scope = {}) =>
  exportIcsWithCounts(ws, noIndex(), {
    scope,
    from: '2027-01-04',
    to: '2027-01-31',
    reminderMinutes: 10,
    allDay: { holidays: false, schoolHolidays: false, milestones: false },
    now: new Date('2027-01-01T00:00:00Z'),
    locale: 'en',
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
});
