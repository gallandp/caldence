import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isoWeek } from '../../src/core/date';
import { capacity, loadPerWeek, warnings } from '../../src/core/load';
import type { Workspace } from '../../src/core/model';
import { loadSummary, weekRows, workspaceIndex } from '../../src/core/views';
import {
  ALEX,
  ALEX_START_WEEK,
  CADENCE_START_WEEK,
  CATEGORY_HOURS,
  ROLE_HOURS,
} from '../e2e/weeks-load-expected';

const ws = JSON.parse(readFileSync('src/data/examples/example.caldence.json', 'utf8')) as Workspace;
const index = workspaceIndex(ws);
const ALPHA = { teamId: 'team-alpha' };

describe('constants of the weeks and load e2e tests', () => {
  it('match loadSummary of Team Alpha', () => {
    const s = loadSummary(ws, ALPHA);
    expect(s.byRole.map((r) => r.roleId)).toEqual(ROLE_HOURS.map((r) => r.roleId));
    for (const r of ROLE_HOURS) {
      expect(s.byRole.find((x) => x.roleId === r.roleId)!.hours).toBeCloseTo(r.hours, 9);
      expect(ws.roles.find((x) => x.id === r.roleId)!.name).toBe(r.name);
    }
    expect(s.byCategory.map((c) => c.categoryId)).toEqual(CATEGORY_HOURS.map((c) => c[0]));
    for (const [id, name, roles] of CATEGORY_HOURS) {
      expect(ws.categories.find((x) => x.id === id)!.name).toBe(name);
      expect(Object.keys(s.matrix[id]!)).toEqual(Object.keys(roles));
      for (const [role, hours] of Object.entries(roles))
        expect(s.matrix[id]![role]).toBeCloseTo(hours, 9);
    }
  });

  it('match the week row of the cadence start', () => {
    const find = (filter: Parameters<typeof weekRows>[2]) =>
      weekRows(ws, index, filter).find((r) => r.monday === CADENCE_START_WEEK.monday)!;
    const row = find(ALPHA);
    expect(row.week).toBe(CADENCE_START_WEEK.isoWeek);
    expect(row.cadence).toEqual([{ teamId: 'team-alpha', number: 1 }]);
    expect(row.total).toBeCloseTo(CADENCE_START_WEEK.total, 9);
    expect(Object.keys(row.byRole)).toEqual(Object.keys(CADENCE_START_WEEK.byRole));
    for (const [role, hours] of Object.entries(CADENCE_START_WEEK.byRole))
      expect(row.byRole[role]).toBeCloseTo(hours, 9);
    // Alex is a member of both teams, so both cadences start in this week.
    const alex = find({ personId: 'person-alex' });
    expect(alex.cadence).toEqual([
      { teamId: 'team-alpha', number: 1 },
      { teamId: 'team-beta', number: 1 },
    ]);
    expect(alex.total).toBeCloseTo(ALEX_START_WEEK.total, 9);
    expect(Object.keys(alex.byRole)).toEqual(Object.keys(ALEX_START_WEEK.byRole));
  });

  it('match loadSummary with the person filter', () => {
    const s = loadSummary(ws, { personId: 'person-alex' });
    expect(s.byRole.map((r) => r.roleId)).toEqual(['role-po']);
    expect(s.byRole[0]!.hours).toBeCloseTo(ALEX.roleHours, 9);
  });

  it('match the person Alex (filter personId person-alex)', () => {
    const weeks = loadPerWeek(ws, index);
    const hours = weeks.map((w) => w.byPerson['person-alex']!);
    const average = hours.reduce((a, b) => a + b, 0) / hours.length;
    expect(average).toBeCloseTo(ALEX.average, 9);
    expect(average / capacity(ws, 'person-alex')).toBeCloseTo(ALEX.fte, 9);
    const peak = Math.max(...hours);
    expect(peak).toBeCloseTo(ALEX.peakHours, 9);
    expect(isoWeek(weeks[hours.indexOf(peak)]!.monday)).toBe(ALEX.peakWeek);
    const mine = warnings(weeks, ws).filter((w) => w.personId === 'person-alex');
    expect(mine.every((w) => w.kind === 'above-usual')).toBe(true);
    expect(
      mine.map((w) => [
        isoWeek(w.monday),
        Number(weeks.find((x) => x.monday === w.monday)!.byPerson['person-alex']!.toFixed(3)),
      ]),
    ).toEqual(ALEX.warnings);
  });
});
