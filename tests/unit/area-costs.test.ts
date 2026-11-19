import { describe, expect, it } from 'vitest';
import { areaCosts, areaShare, costliest, meetingCosts } from '../../src/core/areaCosts';
import { areaMeetingHours, teamLoad } from '../../src/core/areaOverview';
import { costPerCadence, costSummary, unitCostSummary } from '../../src/core/cost';
import { loadPerWeek } from '../../src/core/load';
import { loadSummary } from '../../src/core/views';
import { areaAsTeam, attendees, type Workspace } from '../../src/core/model';
import type { HolidayIndex } from '../../src/core/regions';
import { areaWorkspace } from '../e2e/area-fixture';

const noIndex = (): HolidayIndex => ({
  holidays: new Map(),
  schoolHolidays: new Map(),
  beyondKnown: false,
});

const ws = () => areaWorkspace() as unknown as Workspace;

describe('areaCosts', () => {
  it('has one row per team, one for the area, and a total that adds them up', () => {
    const w = ws();
    const area = w.areas[0]!;
    const c = areaCosts(w, noIndex(), area, 100);
    expect(c.teams.map((r) => r.unitId)).toEqual(area.teamIds);
    const rows = [...c.teams, c.area];
    expect(c.total.hours).toBeCloseTo(rows.reduce((s, r) => s + r.hours, 0));
    expect(c.total.cost!.perWeek).toBeCloseTo(rows.reduce((s, r) => s + r.cost!.perWeek, 0));
    expect(c.total.cost!.horizon).toBeCloseTo(rows.reduce((s, r) => s + r.cost!.horizon, 0));
    expect(c.total.share).toBeCloseTo(c.total.hours / c.total.capacity);
    // In the fixture every member of the area and its teams attends a meeting, each once.
    const members = new Set([
      ...area.members.map((m) => m.personId),
      ...w.teams
        .filter((t) => area.teamIds.includes(t.id))
        .flatMap((t) => t.members.map((m) => m.personId)),
    ]);
    expect(c.total.invited).toBe(members.size);
  });

  it('counts per person only people invited to a meeting, in team rows and the total (#263)', () => {
    const w = ws();
    const area = w.areas[0]!;
    const before = areaCosts(w, noIndex(), area, 100);
    // A member of the area and of a team in a role that no meeting invites (Area Lead).
    w.people.push({ id: 'person-idle', name: 'Idle' } as Workspace['people'][number]);
    w.roles.push({ id: 'role-idle', name: 'Observer', colour: '#777777' });
    area.members.push({ personId: 'person-idle', roleId: 'role-idle' });
    const gamma = w.teams.find((t) => t.id === 'team-gamma')!;
    gamma.members.push({ personId: 'person-idle', roleId: 'role-idle' });
    const after = areaCosts(w, noIndex(), area, 100);
    expect(after.total.invited).toBe(before.total.invited);
    expect(after.teams.find((r) => r.unitId === 'team-gamma')!.invited).toBe(
      before.teams.find((r) => r.unitId === 'team-gamma')!.invited,
    );
    expect(after.total.cost!.perWeek).toBeCloseTo(before.total.cost!.perWeek);
    const perPerson = (r: { cost?: { perWeek: number }; invited: number }) =>
      r.cost!.perWeek / r.invited;
    expect(perPerson(after.total)).toBeCloseTo(perPerson(before.total));
  });

  it('counts a role nobody holds as one person, like the cost does', () => {
    const w = ws();
    const area = w.areas[0]!;
    const gamma = w.teams.find((t) => t.id === 'team-gamma')!;
    const before = areaCosts(w, noIndex(), area, 100).teams.find((r) => r.unitId === gamma.id)!;
    gamma.events.push({
      ...structuredClone(gamma.events[0]!),
      id: 'ev-dev-sync',
      rule: { type: 'weekly', weekday: 1 },
      participants: [{ roleId: 'role-dev', share: 1 }],
    });
    const after = areaCosts(w, noIndex(), area, 100).teams.find((r) => r.unitId === gamma.id)!;
    expect(after.invited).toBe(before.invited + 1);
  });

  it('matches the cost card of each team and of the area', () => {
    const w = ws();
    const area = w.areas[0]!;
    const c = areaCosts(w, noIndex(), area, 85);
    for (const r of c.teams) {
      const team = w.teams.find((t) => t.id === r.unitId)!;
      expect(r.cost!.perWeek).toBeCloseTo(unitCostSummary(w, noIndex(), team, 85).perWeek);
    }
    expect(c.area.cost!.horizon).toBeCloseTo(
      unitCostSummary(w, noIndex(), areaAsTeam(area), 85).horizon,
    );
  });

  it('a team share is its meeting hours over its members hours in the team', () => {
    const w = ws();
    const c = areaCosts(w, noIndex(), w.areas[0]!);
    const gamma = c.teams.find((r) => r.unitId === 'team-gamma')!;
    // Two members with 20 h each in Gamma.
    expect(gamma.capacity).toBe(40);
    expect(gamma.share).toBeCloseTo(gamma.hours / 40);
    expect(gamma.cost).toBeUndefined();
  });
});

describe('areaShare (#336)', () => {
  /** Ola works 30 h in Gamma and 10 h in Delta and attends a weekly 1-hour meeting of the area. */
  function withOla() {
    const w = ws();
    const area = w.areas[0]!;
    w.roles.push({ id: 'role-arch', name: 'Architect', colour: '#555555' });
    const gamma = w.teams.find((t) => t.id === 'team-gamma')!;
    const delta = w.teams.find((t) => t.id === 'team-delta')!;
    gamma.members.push({ personId: 'person-ola', roleId: 'role-arch' });
    gamma.memberHours['person-ola'] = 30;
    delta.members.push({ personId: 'person-ola', roleId: 'role-arch' });
    delta.memberHours['person-ola'] = 10;
    const before = {
      gamma: areaShare(w, noIndex(), 'team-gamma', 100)!,
      delta: areaShare(w, noIndex(), 'team-delta', 100)!,
    };
    area.events.push({
      ...structuredClone(area.events[0]!),
      id: 'ev-arch-sync',
      rule: { type: 'weekly', weekday: 3 },
      duration: 60,
      participants: [{ roleId: 'role-arch', share: 1, fromTeams: true }],
    });
    return { w, area, before };
  }

  it("splits a person's area meetings over their teams by their weekly hours there", () => {
    const { w, before } = withOla();
    const gamma = areaShare(w, noIndex(), 'team-gamma', 100)!;
    const delta = areaShare(w, noIndex(), 'team-delta', 100)!;
    expect(gamma.perWeek - before.gamma.perWeek).toBeCloseTo(75);
    expect(delta.perWeek - before.delta.perWeek).toBeCloseTo(25);
    expect(gamma.horizon).toBeGreaterThan(before.gamma.horizon);
  });

  it('splits evenly when the person has 0 h in each of their teams', () => {
    const { w, before } = withOla();
    w.teams.find((t) => t.id === 'team-gamma')!.memberHours['person-ola'] = 0;
    w.teams.find((t) => t.id === 'team-delta')!.memberHours['person-ola'] = 0;
    const gamma = areaShare(w, noIndex(), 'team-gamma', 100)!;
    const delta = areaShare(w, noIndex(), 'team-delta', 100)!;
    expect(gamma.perWeek - before.gamma.perWeek).toBeCloseTo(50);
    expect(delta.perWeek - before.delta.perWeek).toBeCloseTo(50);
  });

  it('splits only over the teams of that area for a person in teams of two areas', () => {
    const { w, area, before } = withOla();
    // Delta moves to another area: Ola's Payments meeting now belongs to Gamma alone.
    area.teamIds = area.teamIds.filter((id) => id !== 'team-delta');
    w.areas.push({
      ...structuredClone(area),
      id: 'area-other',
      name: 'Other',
      teamIds: ['team-delta'],
      members: [],
      memberHours: {},
      events: [],
    });
    const gamma = areaShare(w, noIndex(), 'team-gamma', 100)!;
    expect(gamma.perWeek - before.gamma.perWeek).toBeCloseTo(100);
    expect(areaShare(w, noIndex(), 'team-delta', 100)!.perWeek).toBe(0);
  });

  it('adds up to the area row without the people in no team and the unfilled roles', () => {
    const { w, area } = withOla();
    const c = areaCosts(w, noIndex(), area, 100);
    const shares = c.teams.reduce((s, r) => s + r.areaShare!.perWeek, 0);
    // Ruth and Pia work only in the area: their part stays with the area row alone.
    const onlyArea = unitCostSummary(
      w,
      noIndex(),
      areaAsTeam(area),
      100,
      (p, e) =>
        ['person-ruth', 'person-pia'].filter((id) => attendees(w, area.id, p, e).includes(id))
          .length,
    ).perWeek;
    expect(c.area.cost!.unfilled).toEqual([]);
    expect(shares + onlyArea).toBeCloseTo(c.area.cost!.perWeek);
    // Informative only: the total stays the sum of the rows.
    expect(c.total.cost!.perWeek).toBeCloseTo(
      [...c.teams, c.area].reduce((s, r) => s + r.cost!.perWeek, 0),
    );
  });

  it('has a value per sprint or PI like the cost card, none in flow (#366)', () => {
    const w = ws();
    const team = (id: string) => w.teams.find((t) => t.id === id)!;
    const gamma = areaShare(w, noIndex(), 'team-gamma', 100)!;
    // Gamma runs 3-week sprints: Kim's 1 h forum and Lou's 0.5 h sync, €150 a week.
    expect(gamma.perWeek).toBeCloseTo(150);
    expect(costPerCadence(gamma.perWeek, team('team-gamma').cadence)).toBeCloseTo(450);
    expect(costPerCadence(1, team('team-delta').cadence)).toBeUndefined();
  });

  it('is undefined for a team without an area and without a rate', () => {
    const w = ws();
    w.areas[0]!.teamIds = w.areas[0]!.teamIds.filter((id) => id !== 'team-delta');
    expect(areaShare(w, noIndex(), 'team-delta', 100)).toBeUndefined();
    expect(areaShare(w, noIndex(), 'team-gamma', 0)).toBeUndefined();
    expect(areaCosts(w, noIndex(), w.areas[0]!).teams[0]!.areaShare).toBeUndefined();
  });
});

describe('costliest', () => {
  it('ranks by the cost of the period, at most five, with each share of all cost', () => {
    const w = ws();
    const list = meetingCosts(w, noIndex(), w.areas[0]!, 100);
    for (const period of ['week', 'horizon'] as const) {
      const top = costliest(list, period);
      expect(top.length).toBe(5);
      for (let i = 1; i < top.length; i++)
        expect(top[i - 1]!.cost).toBeGreaterThanOrEqual(top[i]!.cost);
      const all = costliest(list, period, 1000);
      expect(all.reduce((s, m) => s + m.shareOfAll, 0)).toBeCloseTo(1);
    }
    // A one-off meeting has no weekly average but counts in the horizon.
    const isPlanning = (m: { unitId: string; event: { id: string } }) =>
      m.unitId === 'area-payments' && m.event.id === 'ev-planning';
    expect(costliest(list, 'week', 1000).some(isPlanning)).toBe(false);
    expect(costliest(list, 'horizon', 1000).some(isPlanning)).toBe(true);
  });

  it('names roles nobody holds, which still cost one person', () => {
    const w = ws();
    const planning = meetingCosts(w, noIndex(), w.areas[0]!, 100).find(
      (m) => m.unitId === 'area-payments' && m.event.id === 'ev-planning',
    )!;
    expect(planning.unfilled).toEqual([]);
    const forum = meetingCosts(w, noIndex(), w.areas[0]!, 100).find(
      (m) => m.event.id === 'ev-po-forum',
    )!;
    expect(forum.invited).toBe(5);
  });
});

describe('areaCosts without hours', () => {
  it('flags meeting hours that have no weekly hours to be measured against', () => {
    const w = ws();
    const gamma = w.teams.find((t) => t.id === 'team-gamma')!;
    for (const id of Object.keys(gamma.memberHours)) gamma.memberHours[id] = 0;
    const row = areaCosts(w, noIndex(), w.areas[0]!).teams.find((r) => r.unitId === 'team-gamma')!;
    expect(row.noHours).toBe(true);
  });
});

describe('one meeting load in the cost table and the heat map (#262)', () => {
  it('pins the numbers of the area fixture', () => {
    const w = ws();
    const area = w.areas[0]!;
    const c = areaCosts(w, noIndex(), area);
    expect(c.total.share).toBeCloseTo(0.133, 3);
    const weeks = loadPerWeek(w, noIndex()).slice(0, 12);
    const avg = (id: string) => {
      const cells = teamLoad(
        w,
        w.teams.find((t) => t.id === id)!,
        weeks,
      );
      return cells.reduce((s, x) => s + x.share, 0) / cells.length;
    };
    const row = (id: string) => c.teams.find((r) => r.unitId === id)!.share;
    // Table (typical week) and heat map average (real weeks): close, but not equal.
    expect([row('team-alpha'), avg('team-alpha')].map((n) => n.toFixed(3))).toEqual([
      '0.156',
      '0.163',
    ]);
    expect([row('team-beta'), avg('team-beta')].map((n) => n.toFixed(3))).toEqual([
      '0.082',
      '0.075',
    ]);
    expect([row('team-gamma'), avg('team-gamma')].map((n) => n.toFixed(3))).toEqual([
      '0.107',
      '0.120',
    ]);
    expect([row('team-delta'), avg('team-delta')].map((n) => n.toFixed(3))).toEqual([
      '0.140',
      '0.146',
    ]);
  });

  it('a team with weekly meetings only has the same share in both', () => {
    const w = ws();
    const area = w.areas[0]!;
    for (const t of w.teams) t.events = t.events.filter((e) => e.rule.type === 'weekly');
    const gamma = w.teams.find((t) => t.id === 'team-gamma')!;
    expect(gamma.events.length).toBeGreaterThan(0);
    const row = areaCosts(w, noIndex(), area).teams.find((r) => r.unitId === gamma.id)!;
    // Whole weeks inside the horizon: every one holds each weekly meeting once.
    const weeks = loadPerWeek(w, noIndex()).slice(1, -1);
    const cells = teamLoad(w, gamma, weeks);
    expect(row.share).toBeGreaterThan(0);
    for (const c of cells) expect(c.share).toBeCloseTo(row.share);
  });

  it('a one-off meeting raises its week only, not the recurring share', () => {
    const w = ws();
    const area = w.areas[0]!;
    for (const t of w.teams) t.events = t.events.filter((e) => e.rule.type === 'weekly');
    const gamma = w.teams.find((t) => t.id === 'team-gamma')!;
    const weeks = () => loadPerWeek(w, noIndex()).slice(1, -1);
    const monday = weeks()[2]!.monday;
    const share = areaCosts(w, noIndex(), area).teams.find((r) => r.unitId === gamma.id)!.share;
    gamma.events.push({
      ...structuredClone(gamma.events[0]!),
      id: 'ev-once',
      rule: { type: 'once', date: monday },
    });
    const after = areaCosts(w, noIndex(), area).teams.find((r) => r.unitId === gamma.id)!;
    expect(after.share).toBeCloseTo(share);
    const cells = teamLoad(w, gamma, weeks());
    expect(cells.find((c) => c.monday === monday)!.share).toBeGreaterThan(share);
    expect(cells.find((c) => c.monday !== monday)!.share).toBeCloseTo(share);
  });
});

describe('unfilled roles (#264)', () => {
  /** A weekly meeting for Developers (nobody in Gamma or Delta is one) in a team. */
  const devMeeting = (
    w: Workspace,
    teamId: string,
    rule: object = { type: 'weekly', weekday: 1 },
  ) => {
    const team = w.teams.find((t) => t.id === teamId)!;
    team.events.push({
      ...structuredClone(team.events[0]!),
      id: `ev-dev-${teamId}`,
      name: 'Dev sync',
      rule: rule as never,
      participants: [{ roleId: 'role-dev', share: 1 }],
    });
    return team;
  };
  const roles = (list: { roleId: string }[]) => list.map((u) => u.roleId);

  it('names the unfilled roles, per team and in the cost table', () => {
    const w = ws();
    const gamma = devMeeting(w, 'team-gamma');
    const summary = unitCostSummary(w, noIndex(), gamma, 100);
    expect(summary.unfilled).toEqual([
      { unitId: 'team-gamma', roleId: 'role-dev', week: true, horizon: true },
    ]);
    const row = areaCosts(w, noIndex(), w.areas[0]!, 100).teams.find((r) => r.unitId === gamma.id)!;
    expect(row.cost!.unfilled).toEqual(summary.unfilled);
  });

  it('lists no role once someone holds it', () => {
    const w = ws();
    const gamma = devMeeting(w, 'team-gamma');
    gamma.members.push({ personId: 'person-kim', roleId: 'role-dev' });
    expect(unitCostSummary(w, noIndex(), gamma, 100).unfilled).toEqual([]);
  });

  it('keeps one entry per team, so two teams without Developers are two people', () => {
    const w = ws();
    devMeeting(w, 'team-gamma');
    devMeeting(w, 'team-delta');
    const all = costSummary(w, noIndex(), {}, 100).unfilled;
    expect(all.map((u) => `${u.unitId}:${u.roleId}`)).toEqual([
      'team-gamma:role-dev',
      'team-delta:role-dev',
    ]);
  });

  it('a person or another role filter costs no phantom people, so lists none', () => {
    const w = ws();
    devMeeting(w, 'team-gamma');
    expect(costSummary(w, noIndex(), { personId: 'person-kim' }, 100).unfilled).toEqual([]);
    expect(costSummary(w, noIndex(), { roleId: 'role-po' }, 100).unfilled).toEqual([]);
    expect(roles(costSummary(w, noIndex(), { roleId: 'role-dev' }, 100).unfilled)).toEqual([
      'role-dev',
    ]);
  });

  it('an area meeting for a role from every team is unfilled only if no team holds it', () => {
    const w = ws();
    const area = w.areas[0]!;
    // The area fixture invites Developers from every team; Alpha and Beta have some.
    expect(roles(unitCostSummary(w, noIndex(), areaAsTeam(area), 100).unfilled)).toEqual([]);
    for (const t of w.teams) t.members = t.members.filter((m) => m.roleId !== 'role-dev');
    expect(roles(unitCostSummary(w, noIndex(), areaAsTeam(area), 100).unfilled)).toContain(
      'role-dev',
    );
  });

  it('counts an unfilled role as one person in the hours and share too (#335)', () => {
    const w = ws();
    const area = w.areas[0]!;
    const gamma = devMeeting(w, 'team-gamma');
    // Preparation and on-site travel are in the hours as in the cost, so hours × rate = cost.
    const dev = gamma.events.find((e) => e.id === 'ev-dev-team-gamma')!;
    dev.preparation = 0.25;
    dev.onSite = { travel: 30 };
    const c = areaCosts(w, noIndex(), area, 100);
    const row = c.teams.find((r) => r.unitId === gamma.id)!;
    const tiles = (teamId: string) =>
      loadSummary(w, { teamId }).byRole.reduce((s, r) => s + r.hours, 0);
    // The same hours as the Meeting load tiles, for the team and for the whole area.
    expect(row.hours).toBeCloseTo(tiles(gamma.id));
    expect(c.total.hours).toBeCloseTo(tiles(area.id));
    // Hours × rate = cost, in every row and in the total.
    for (const r of [...c.teams, c.area, c.total]) {
      expect(r.hours * 100).toBeCloseTo(r.cost!.perWeek);
    }
    // The unfilled role brings the default weekly hours, as in the Meeting load tiles.
    const hpw = w.settings.hoursPerWeek;
    expect(row.capacity).toBe(40 + hpw);
    expect(row.share).toBeCloseTo(row.hours / (40 + hpw));
    expect(c.total.share).toBeCloseTo(c.total.hours / c.total.capacity);
  });

  it('the strip counts an unfilled role like the cost table, persons alone warn (#360)', () => {
    const w = ws();
    for (const t of w.teams) t.events = t.events.filter((e) => e.rule.type === 'weekly');
    const gamma = w.teams.find((t) => t.id === 'team-gamma')!;
    const weeks = () => loadPerWeek(w, noIndex()).slice(1, -1);
    const warnBefore = teamLoad(w, gamma, weeks()).map((c) => c.warn);
    devMeeting(w, 'team-gamma');
    const row = areaCosts(w, noIndex(), w.areas[0]!).teams.find((r) => r.unitId === gamma.id)!;
    const cells = teamLoad(w, gamma, weeks());
    expect(row.capacity).toBe(40 + w.settings.hoursPerWeek);
    for (const c of cells) expect(c.share).toBeCloseTo(row.share, 6);
    // Nobody holds the role, so no person's hours and no warning change.
    expect(cells.map((c) => c.warn)).toEqual(warnBefore);
  });

  it('the steering list counts an unfilled area role like the area row (#360)', () => {
    const w = ws();
    const area = w.areas[0]!;
    area.events.push({
      ...structuredClone(area.events[0]!),
      id: 'ev-dev-area',
      rule: { type: 'weekly', weekday: 3 },
      participants: [{ roleId: 'role-dev', share: 1 }],
    });
    const meetings = areaMeetingHours(w, area);
    const steering = meetings.reduce((s, m) => s + m.perWeek, 0);
    expect(steering).toBeCloseTo(areaCosts(w, noIndex(), area).area.hours);
    expect(meetings.find((m) => m.eventId === 'ev-dev-area')!.attendees).toEqual([[]]);
  });

  it('a one-off meeting adds cost only in the horizon, and the note says so', () => {
    const w = ws();
    const gamma = devMeeting(w, 'team-gamma', { type: 'once', date: '2027-01-12' });
    expect(unitCostSummary(w, noIndex(), gamma, 100).unfilled).toEqual([
      { unitId: 'team-gamma', roleId: 'role-dev', week: false, horizon: true },
    ]);
  });
});
