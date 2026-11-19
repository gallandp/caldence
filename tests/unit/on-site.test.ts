import { describe, expect, it } from 'vitest';
import { costSummary } from '../../src/core/cost';
import { duplicateEvent } from '../../src/core/edit';
import { exportIcsWithCounts } from '../../src/core/ics';
import { loadPerWeek, occurrenceHours, weeklyBaseLoad } from '../../src/core/load';
import { migrate } from '../../src/core/migrate';
import { emptyWorkspace, type CalEvent, type Workspace } from '../../src/core/model';
import type { HolidayIndex } from '../../src/core/regions';
import { teamToTemplate, validateTemplate } from '../../src/core/template';
import { validate } from '../../src/core/validate';

const noIndex = (): HolidayIndex => ({
  holidays: new Map(),
  schoolHolidays: new Map(),
  beyondKnown: false,
});

/** Review on Mondays, 60 min with 50 % preparation, for both developers. */
const review = (extra: Partial<CalEvent> = {}): CalEvent => ({
  id: 'e1',
  name: 'Review',
  categoryId: 'c1',
  rule: { type: 'weekly', weekday: 1 },
  time: '10:00',
  duration: 60,
  participants: [{ roleId: 'dev', share: 1 }],
  preparation: 0.5,
  ...extra,
});

/** Team Alpha with two developers, four Mondays in the horizon, 100 € per hour. */
function workspace(event: CalEvent): Workspace {
  const ws = emptyWorkspace('2027-01-04');
  ws.settings.horizon = { from: '2027-01-04', to: '2027-01-31' };
  ws.settings.hourlyRate = 100;
  ws.roles = [{ id: 'dev', name: 'Developer', colour: '#16a34a' }];
  ws.people = [
    { id: 'dana', name: 'Dana' },
    { id: 'eli', name: 'Eli' },
  ];
  ws.categories = [{ id: 'c1', name: 'Review', colour: '#2563eb' }];
  ws.teams = [
    {
      id: 'alpha',
      name: 'Alpha',
      cadence: { kind: 'sprint', lengthWeeks: 2, start: '2027-01-04' },
      members: [
        { personId: 'dana', roleId: 'dev' },
        { personId: 'eli', roleId: 'dev' },
      ],
      memberHours: {},
      assumptions: {},
      cycles: [],
      events: [event],
    },
  ];
  return ws;
}

const icsOf = (ws: Workspace, locale: 'de' | 'en') =>
  exportIcsWithCounts(ws, noIndex(), {
    scope: {},
    from: '2027-01-04',
    to: '2027-01-31',
    reminderMinutes: null,
    allDay: { holidays: false, schoolHolidays: false, milestones: false },
    now: new Date('2027-01-01T00:00:00Z'),
    locale,
  }).text;

describe('meetings on site with travel time (#309)', () => {
  it('adds travel to each occurrence, weighted by share but not grown by preparation', () => {
    const event = review({ onSite: { travel: 30 } });
    // 60 min + 50 % preparation = 90 min, plus 30 min travel = 2 h.
    expect(occurrenceHours(event, 60, 1)).toBe(2);
    // Every second time: half of it, travel included.
    expect(occurrenceHours(event, 60, 0.5)).toBe(1);
    expect(occurrenceHours(review(), 60, 1)).toBe(1.5);
  });

  it('counts travel in the weekly and per-week load of every attendee', () => {
    const ws = workspace(review({ onSite: { travel: 30 } }));
    expect(weeklyBaseLoad(ws.teams[0]!).byRole.dev).toBe(2);
    const week = loadPerWeek(ws, noIndex())[0]!;
    expect(week.byPerson).toMatchObject({ dana: 2, eli: 2 });
  });

  it('counts travel in the cost', () => {
    const remote = costSummary(workspace(review()), noIndex(), {}, 100);
    const onSite = costSummary(workspace(review({ onSite: { travel: 30 } })), noIndex(), {}, 100);
    // Two people, 1.5 h vs 2 h, 100 €/h.
    expect(remote.perWeek).toBe(300);
    expect(onSite.perWeek).toBe(400);
    expect(onSite.horizon).toBe(1600);
  });

  it('keeps an on-site meeting without travel at the remote numbers', () => {
    const ws = workspace(review({ onSite: { travel: 0 } }));
    expect(validate(ws).ok).toBe(true);
    expect(weeklyBaseLoad(ws.teams[0]!).byRole.dev).toBe(1.5);
  });

  it('validates the travel time', () => {
    const errorsOf = (onSite: unknown) => {
      const r = validate(workspace(review({ onSite } as Partial<CalEvent>)));
      return r.ok ? [] : r.errors.map((e) => `${e.path} ${e.key}`);
    };
    expect(errorsOf({ travel: 45 })).toEqual([]);
    expect(errorsOf({ travel: -5 })).toEqual([
      'teams.0.events.0.onSite.travel error.number.invalid',
    ]);
    expect(errorsOf({ travel: 2000 })).toEqual([
      'teams.0.events.0.onSite.travel error.number.invalid',
    ]);
    expect(errorsOf({ travel: 1.5 })).toEqual([
      'teams.0.events.0.onSite.travel error.number.invalid',
    ]);
    expect(errorsOf({})).toEqual(['teams.0.events.0.onSite.travel error.required']);
    expect(errorsOf('yes')).toContainEqual(expect.stringMatching(/^teams\.0\.events\.0\.onSite /));
  });

  it('exports the place and travel time; remote meetings as before', () => {
    const remote = icsOf(workspace(review()), 'en');
    expect(remote).not.toContain('LOCATION');
    expect(remote).toContain('DESCRIPTION:Alpha\\nDeveloper\r\n');
    const en = icsOf(workspace(review({ onSite: { travel: 30 } })), 'en');
    expect(en).toContain('LOCATION:On site');
    expect(en).toContain('DESCRIPTION:Alpha\\nDeveloper\\nTravel: 30 min (there and back)');
    const de = icsOf(workspace(review({ onSite: { travel: 0 } })), 'de');
    expect(de).toContain('LOCATION:Vor Ort');
    expect(de).toContain('DESCRIPTION:Alpha\\nDeveloper\r\n');
  });

  it('keeps place and travel in templates and duplicates', () => {
    const ws = workspace(review({ onSite: { travel: 20 } }));
    const tpl = teamToTemplate(ws, 'alpha', { id: 'x', name: 'X', description: '' });
    expect(tpl.team.events[0]!.onSite).toEqual({ travel: 20 });
    expect(validateTemplate(tpl).ok).toBe(true);
    const [copy] = duplicateEvent(ws, 'alpha', 'e1');
    expect(copy.teams[0]!.events[1]!.onSite).toEqual({ travel: 20 });
  });

  it('opens a schema 6 file unchanged but for the version', () => {
    const old = { ...workspace(review()), schemaVersion: 6 };
    const r = migrate(old);
    expect(r.ok && r.value).toEqual({ ...old, schemaVersion: 8 });
  });
});
