import { describe, expect, it } from 'vitest';
import { costSummary, meetingCost, unitCostSummary } from '../../src/core/cost';
import { removeItem } from '../../src/core/edit';
import { exportIcsWithCounts } from '../../src/core/ics';
import { loadPerWeek, weeklyHoursByPerson } from '../../src/core/load';
import { migrate } from '../../src/core/migrate';
import {
  attendees,
  emptyWorkspace,
  eventAttendees,
  participantName,
  type CalEvent,
  type Team,
  type Workspace,
} from '../../src/core/model';
import type { HolidayIndex } from '../../src/core/regions';
import { teamToTemplate, validateTemplate } from '../../src/core/template';
import { validate } from '../../src/core/validate';
import { filteredOccurrences, loadSummary, scopeTeams } from '../../src/core/views';

const noIndex = (): HolidayIndex => ({
  holidays: new Map(),
  schoolHolidays: new Map(),
  beyondKnown: false,
});

/** Refinement in Alpha: Mondays 1 h, all developers, plus people by name. */
const refinement = (named: CalEvent['participants'] = []): CalEvent => ({
  id: 'e1',
  name: 'Refinement',
  categoryId: 'c1',
  rule: { type: 'weekly', weekday: 1 },
  time: '10:00',
  duration: 60,
  participants: [{ roleId: 'dev', share: 1 }, ...named],
  preparation: 0,
});

const team = (id: string, members: [string, string][], events: CalEvent[] = []): Team => ({
  id,
  name: id,
  cadence: { kind: 'sprint', lengthWeeks: 2, start: '2027-01-04' },
  members: members.map(([personId, roleId]) => ({ personId, roleId })),
  memberHours: {},
  assumptions: {},
  cycles: [],
  events,
});

/**
 * Alpha has two developers (Dana, Eli) and an architect (Ari); Beta has Bo, a developer who is
 * sometimes invited to Alpha's refinement by name. Four Mondays in the horizon.
 */
function workspace(event: CalEvent): Workspace {
  const ws = emptyWorkspace('2027-01-04');
  ws.settings.horizon = { from: '2027-01-04', to: '2027-01-31' };
  ws.settings.hourlyRate = 100;
  ws.roles = [
    { id: 'dev', name: 'Developer', colour: '#16a34a' },
    { id: 'arch', name: 'Architect', colour: '#9333ea' },
  ];
  ws.people = ['dana', 'eli', 'ari', 'bo'].map((id) => ({ id, name: id.toUpperCase() }));
  ws.categories = [{ id: 'c1', name: 'Refinement', colour: '#2563eb' }];
  ws.teams = [
    team(
      'alpha',
      [
        ['dana', 'dev'],
        ['eli', 'dev'],
        ['ari', 'arch'],
      ],
      [event],
    ),
    team('beta', [['bo', 'dev']]),
  ];
  return ws;
}

describe('people invited by name (#285)', () => {
  it('validates a person participant and rejects unknown, doubled or mixed ones', () => {
    expect(validate(workspace(refinement([{ personId: 'ari', share: 0.5 }]))).ok).toBe(true);
    const paths = (named: unknown[]) => {
      const r = validate(workspace(refinement(named as CalEvent['participants'])));
      return r.ok ? [] : r.errors.map((e) => `${e.path} ${e.key}`);
    };
    const at = 'teams.0.events.0.participants';
    expect(paths([{ personId: 'nobody', share: 1 }])).toEqual([
      `${at}.1.personId error.ref.unknown`,
    ]);
    expect(
      paths([
        { personId: 'ari', share: 1 },
        { personId: 'ari', share: 0.5 },
      ]),
    ).toEqual([`${at}.2.personId error.id.duplicate`]);
    expect(paths([{ personId: 'ari', roleId: 'arch', share: 1 }])).toEqual([
      `${at}.1.roleId error.participant.both`,
    ]);
    expect(paths([{ personId: 'ari', share: 0 }])).toEqual([`${at}.1.share error.share.range`]);
  });

  it('adds the person to the load and the cost, also from another team', () => {
    const ws = workspace(refinement([{ personId: 'bo', share: 0.5 }]));
    expect(weeklyHoursByPerson(ws, 'alpha')).toEqual({ dana: 1, eli: 1, bo: 0.5 });
    const week = loadPerWeek(ws, noIndex())[0]!;
    expect(week.byPerson).toMatchObject({ dana: 1, eli: 1, ari: 0, bo: 0.5 });
    expect(week.byTeamPerson.alpha).toEqual({ dana: 1, eli: 1, bo: 0.5 });
    // Two developers at 100 € plus Bo for half of the meetings.
    expect(meetingCost(ws, ws.teams[0]!, ws.teams[0]!.events[0]!, 60, 100)).toBe(250);
    expect(unitCostSummary(ws, noIndex(), ws.teams[0]!, 100).perWeek).toBe(250);
    expect(costSummary(ws, noIndex(), { personId: 'bo' }, 100).perWeek).toBe(50);
  });

  it('counts a person once, with their own share, when one of their roles is invited too', () => {
    const ws = workspace(refinement([{ personId: 'eli', share: 0.5 }]));
    const event = ws.teams[0]!.events[0]!;
    expect(attendees(ws, 'alpha', event.participants[0]!, event)).toEqual(['dana']);
    expect(eventAttendees(ws, 'alpha', event)).toEqual(['dana', 'eli']);
    expect(weeklyHoursByPerson(ws, 'alpha')).toEqual({ dana: 1, eli: 0.5 });
    expect(unitCostSummary(ws, noIndex(), ws.teams[0]!, 100).perWeek).toBe(150);
  });

  it('keeps a role whose holders are all named filled: no extra head for the cost', () => {
    const ws = workspace(
      refinement([
        { personId: 'dana', share: 1 },
        { personId: 'eli', share: 1 },
      ]),
    );
    const cost = unitCostSummary(ws, noIndex(), ws.teams[0]!, 100);
    expect(cost.perWeek).toBe(200);
    expect(cost.unfilled).toEqual([]);
  });

  it('lists the person in their own load figures and filters', () => {
    const ws = workspace(refinement([{ personId: 'bo', share: 0.5 }]));
    expect(scopeTeams(ws, { personId: 'bo' }).map((t) => t.id)).toEqual(['alpha', 'beta']);
    expect(filteredOccurrences(ws, noIndex(), { personId: 'bo' }).map((o) => o.hours)).toEqual([
      0.5, 0.5, 0.5, 0.5,
    ]);
    const summary = loadSummary(ws, { teamId: 'alpha' });
    expect(summary.byRole.map((r) => [r.roleId, r.hours])).toEqual([
      ['dev', 1],
      ['bo', 0.5],
    ]);
    expect(participantName(ws, { personId: 'bo', share: 1 })).toBe('BO');
  });

  it('exports the meeting into the named person’s calendar and names them', () => {
    const ws = workspace(refinement([{ personId: 'bo', share: 1 }]));
    const ics = exportIcsWithCounts(ws, noIndex(), {
      scope: { personId: 'bo' },
      from: '2027-01-04',
      to: '2027-01-31',
      reminderMinutes: null,
      allDay: { holidays: false, schoolHolidays: false, milestones: false },
      now: new Date('2027-01-01T00:00:00Z'),
      locale: 'en',
    });
    expect(ics.series).toBe(1);
    expect(ics.text).toContain('DESCRIPTION:alpha\\nDeveloper\\, BO');
  });

  it('removing a person drops them from meetings; replacing moves the invitation', () => {
    const ws = workspace(refinement([{ personId: 'bo', share: 0.5 }]));
    const gone = removeItem(ws, 'people', 'bo');
    expect(gone.ok && gone.value.teams[0]!.events[0]!.participants).toEqual([
      { roleId: 'dev', share: 1 },
    ]);
    const moved = removeItem(ws, 'people', 'bo', 'ari');
    expect(moved.ok && moved.value.teams[0]!.events[0]!.participants).toEqual([
      { roleId: 'dev', share: 1 },
      { personId: 'ari', share: 0.5 },
    ]);
    if (moved.ok) expect(validate(moved.value).ok).toBe(true);
  });

  it('leaves people out of a template', () => {
    const ws = workspace(refinement([{ personId: 'bo', share: 1 }]));
    const tpl = teamToTemplate(ws, 'alpha', { id: 'x', name: 'X', description: '' });
    expect(tpl.team.events[0]!.participants).toEqual([{ roleId: 'dev', share: 1 }]);
    expect(validateTemplate(tpl).ok).toBe(true);
  });

  it('opens a schema 5 file unchanged but for the version', () => {
    const old = { ...workspace(refinement()), schemaVersion: 5 };
    const r = migrate(old);
    expect(r.ok && r.value).toEqual({ ...old, schemaVersion: 6 });
  });
});
