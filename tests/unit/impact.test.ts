import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/valid-workspace.json';
import type { CalEvent, Workspace } from '../../src/core/model';
import { assign } from '../../src/core/line';
import { minCommitment, productMeetings } from '../../src/core/demand';
import { commitmentImpact, impactState, overallLoad } from '../../src/core/impact';
import { loadPerWeek } from '../../src/core/load';
import type { HolidayIndex } from '../../src/core/regions';

const noIndex = (): HolidayIndex => ({
  holidays: new Map(),
  schoolHolidays: new Map(),
  beyondKnown: false,
});
const overall = (w: Workspace, id: string) => overallLoad(w, loadPerWeek(w, noIndex()), id);

const ok = <T>(r: { ok: true; value: T } | { ok: false; errors: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

const meeting = (
  id: string,
  rule: CalEvent['rule'],
  duration: number,
  extra: Partial<CalEvent['participants'][number]> = {},
): CalEvent => ({
  id,
  name: id,
  categoryId: (fixture as unknown as Workspace).categories[0]!.id,
  rule,
  time: '09:00',
  duration,
  preparation: 0,
  participants: [{ roleId: 'r1', share: 1, ...extra } as CalEvent['participants'][number]],
});

/**
 * Product "Team A" (40 h week, Grenze 60 %): a daily 15 min and a weekly 5 h block for developers,
 * 6.25 h a week → Mindestzusage 0.3 FTE. Product "Team B" has no meetings. Atlas is in no team.
 */
function product(): Workspace {
  const w = structuredClone(fixture) as unknown as Workspace;
  w.people.push({ id: 'p2', name: 'Atlas Ware' });
  const a = w.teams[0]!;
  a.events = [
    meeting('daily', { type: 'weekdays', weekdays: [1, 2, 3, 4, 5] }, 15),
    meeting('block', { type: 'weekly', weekday: 2 }, 300),
  ];
  a.demands = [{ id: 'd1', fte: 1, roleId: 'r1' }];
  w.teams.push({
    id: 't2',
    name: 'Team B',
    cadence: { kind: 'flow', lengthWeeks: 1, start: '2026-11-09' },
    members: [],
    memberHours: {},
    assumptions: {},
    cycles: [],
    events: [],
    demands: [{ id: 'd1', fte: 1, roleId: 'r1' }],
  } as unknown as Workspace['teams'][number]);
  return w;
}

const staff = (w: Workspace, teamId: string, fte: number) =>
  ok(assign(w, { personId: 'p2', teamId, demandId: 'd1', fte }))[0];

describe('effect check per product (#320)', () => {
  it('is "unter Mindestzusage" between the meetings and the Mindestzusage', () => {
    const w = staff(product(), 't1', 0.2);
    const i = commitmentImpact(w, 't1', 'p2', 'r1')!;
    expect(i).toMatchObject({ hours: 8, meetingHours: 6.25, left: 1.75, state: 'under' });
    expect(i.share).toBeCloseTo(0.78125);
    expect(i.min).toEqual({ meetingHours: 6.25, fte: 0.3, hours: 12 });
    expect(i.meetings.map((m) => [m.event.id, m.hours])).toEqual([
      ['daily', 1.25],
      ['block', 5],
    ]);
  });

  it('is "deckt nur Termine" when the hours do not exceed the meetings', () => {
    const w = staff(product(), 't1', 0.1);
    const i = commitmentImpact(w, 't1', 'p2', 'r1')!;
    expect(i).toMatchObject({ hours: 4, left: 0, state: 'meetingsOnly' });
    expect(impactState(6.25, 6.25, i.min)).toBe('meetingsOnly');
  });

  it('is "reicht" at the Mindestzusage and above', () => {
    expect(commitmentImpact(staff(product(), 't1', 0.3), 't1', 'p2', 'r1')!.state).toBe('enough');
    expect(commitmentImpact(staff(product(), 't1', 1), 't1', 'p2', 'r1')!.state).toBe('enough');
    // A product without meetings: whatever is committed is product work.
    const b = commitmentImpact(staff(product(), 't2', 0.1), 't2', 'p2', 'r1')!;
    expect(b).toMatchObject({ meetingHours: 0, left: 4, state: 'enough', min: undefined });
  });

  it('counts platform meetings that invite the role from every team', () => {
    const w = product();
    w.areas = [
      {
        id: 'a1',
        name: 'Platform',
        teamIds: ['t1'],
        members: [],
        memberHours: {},
        cycles: [],
        events: [
          meeting('sync', { type: 'weekly', weekday: 3 }, 60, { fromTeams: true }),
          // Only the area's own developers: not a product meeting.
          meeting('own', { type: 'weekly', weekday: 4 }, 60),
        ],
      } as unknown as Workspace['areas'][number],
    ];
    const team = w.teams[0]!;
    expect(productMeetings(w, team, 'r1').map((m) => [m.event.id, m.unitId, m.hours])).toEqual([
      ['daily', 't1', 1.25],
      ['block', 't1', 5],
      ['sync', 'a1', 1],
    ]);
    // 7.25 h ÷ 0.6 = 12.08 h → 0.4 FTE.
    expect(minCommitment(w, team, 'r1')?.fte).toBe(0.4);
    const i = commitmentImpact(staff(w, 't1', 0.3), 't1', 'p2', 'r1')!;
    expect(i).toMatchObject({ meetingHours: 7.25, state: 'under' });
  });
});

describe('effect check edge cases (#320)', () => {
  it('counts a platform meeting through a role link (#338)', () => {
    const w = product();
    w.roles.push({ id: 'lead', name: 'Lead', colour: '#000000' });
    w.areas = [
      {
        id: 'a1',
        name: 'Platform',
        teamIds: ['t1'],
        members: [],
        memberHours: {},
        cycles: [],
        roleLinks: [{ teamId: 't1', roleId: 'lead', teamRoleId: 'r1' }],
        events: [
          {
            ...meeting('guild', { type: 'weekly', weekday: 3 }, 60, { fromTeams: true }),
            participants: [{ roleId: 'lead', share: 1, fromTeams: true }],
          },
        ],
      } as unknown as Workspace['areas'][number],
    ];
    expect(productMeetings(w, w.teams[0]!, 'r1').map((m) => m.event.id)).toContain('guild');
  });

  it('is "reicht" at a Mindestzusage whose hours are stored rounded', () => {
    // 0.7 × 41.25 h = 28.875 h; `assign` stores 28.88 (or 28.87 from floating point).
    const min = { meetingHours: 17, fte: 0.7, hours: 0.7 * 41.25 };
    expect(impactState(28.87, 17, min)).toBe('enough');
    expect(impactState(28.8, 17, min)).toBe('under');
  });
});

describe('overall status after the assignment (#320)', () => {
  it('is "über Grenze" when all meetings ÷ all hours exceed the Grenze', () => {
    const w = staff(product(), 't1', 0.2);
    const o = overall(w, 'p2');
    expect(o).toMatchObject({ base: 8, over: true });
    expect(o.hours).toBeGreaterThan(5);
  });

  it('keeps a person under the Mindestzusage in one product within the Grenze overall', () => {
    let w = staff(product(), 't2', 0.8);
    w = staff(w, 't1', 0.2);
    const i = commitmentImpact(w, 't1', 'p2', 'r1')!;
    expect(i.state).toBe('under');
    // About 6.25 h of 40 h in all products: about 16 %, not over the Grenze.
    const o = overall(w, 'p2');
    expect(o).toMatchObject({ base: 40, over: false });
    expect(o.share).toBeLessThan(0.2);
    expect(commitmentImpact(w, 't2', 'p2', 'r1')!.state).toBe('enough');
  });

  it('counts the weekly hours for a member without an hours entry', () => {
    const w = product();
    // Alex (p1) has 32 h in Team A.
    const i = commitmentImpact(w, 't1', 'p1', 'r1')!;
    expect(i).toMatchObject({ hours: 32, state: 'enough' });
    delete w.teams[0]!.memberHours['p1'];
    expect(commitmentImpact(w, 't1', 'p1', 'r1')!.hours).toBe(40);
  });
});
