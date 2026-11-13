import { describe, expect, it } from 'vitest';
import { costSummary, meetingCost } from '../../src/core/cost';
import { emptyWorkspace, type CalEvent, type Team, type Workspace } from '../../src/core/model';
import type { HolidayIndex } from '../../src/core/regions';

const noIndex = (): HolidayIndex => ({
  holidays: new Map(),
  schoolHolidays: new Map(),
  beyondKnown: false,
});

function event(extra: Partial<CalEvent> = {}): CalEvent {
  return {
    id: 'e1',
    name: 'Sync',
    categoryId: 'c1',
    rule: { type: 'weekly', weekday: 1 },
    time: '10:00',
    duration: 60,
    participants: [
      { roleId: 'dev', share: 1 },
      { roleId: 'po', share: 0.5 },
    ],
    preparation: 0,
    ...extra,
  };
}

function team(events: CalEvent[]): Team {
  return {
    id: 't1',
    name: 'Team',
    cadence: { kind: 'sprint', lengthWeeks: 2, start: '2027-01-04' },
    members: [
      { personId: 'a', roleId: 'dev' },
      { personId: 'b', roleId: 'dev' },
      { personId: 'c', roleId: 'dev' },
    ],
    memberHours: {},
    assumptions: {},
    cycles: [],
    events,
  };
}

function workspace(t: Team): Workspace {
  const ws = emptyWorkspace('2027-01-04');
  ws.settings.horizon = { from: '2027-01-04', to: '2027-01-31' }; // four Mondays
  ws.settings.hourlyRate = 100;
  ws.categories = [{ id: 'c1', name: 'Events', colour: '#2563eb' }];
  ws.teams = [t];
  return ws;
}

describe('meetingCost', () => {
  it('counts every member of a role, and one person for a role without members', () => {
    // 3 devs x 1 h + 1 po (no members) x 0.5 h = 3.5 person-hours
    expect(meetingCost(team([]), event(), 60, 100)).toBe(350);
  });

  it('includes preparation time', () => {
    expect(meetingCost(team([]), event({ preparation: 0.5 }), 60, 100)).toBe(525);
  });
});

describe('costSummary', () => {
  it('sums the weekly average and the actual horizon', () => {
    const ws = workspace(team([event()]));
    const s = costSummary(ws, noIndex(), {}, 100);
    expect(s.perWeek).toBe(350);
    expect(s.horizon).toBe(4 * 350);
    expect(s.byCategory).toEqual([{ categoryId: 'c1', perWeek: 350 }]);
  });

  it('counts one-off meetings only in the horizon', () => {
    const once = event({ id: 'e2', rule: { type: 'once', date: '2027-01-05' } });
    const s = costSummary(workspace(team([once])), noIndex(), {}, 100);
    expect(s.perWeek).toBe(0);
    expect(s.horizon).toBe(350);
    expect(s.byCategory).toEqual([]);
  });

  it('follows the role and person filters', () => {
    const ws = workspace(team([event()]));
    expect(costSummary(ws, noIndex(), { roleId: 'po' }, 100).perWeek).toBe(50);
    // A person pays only their own time.
    expect(costSummary(ws, noIndex(), { personId: 'a' }, 100).perWeek).toBe(100);
  });
});
