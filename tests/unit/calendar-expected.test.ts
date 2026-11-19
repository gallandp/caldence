import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Workspace } from '../../src/core/model';
import { addDays } from '../../src/core/date';
import { clashes, conflicts, dayLoad, workspaceIndex } from '../../src/core/views';
import {
  ALEX_CLASHES,
  ALEX_OVERLAP_DAY,
  COMMERCE_CLASH_DAYS,
  COMMERCE_FIRST_CLASH,
  DAY_HOURS,
} from '../e2e/calendar-expected';

const ws = JSON.parse(readFileSync('src/data/examples/example.caldence.json', 'utf8')) as Workspace;
const index = workspaceIndex(ws);

describe('constants of the calendar e2e tests', () => {
  it('match dayLoad of the example', () => {
    const load = dayLoad(ws, index, { teamId: 'team-alpha' });
    for (const [date, hours] of Object.entries(DAY_HOURS))
      expect(load.get(date), date).toBeCloseTo(hours, 6);
  });

  it('match the first overlap of Alex', () => {
    expect(conflicts(ws, index, 'person-alex')[0]?.date).toBe(ALEX_OVERLAP_DAY);
  });

  it('match the clashes of Alex and of the Commerce area', () => {
    expect(clashes(ws, index, ['person-alex'])).toHaveLength(ALEX_CLASHES);
    const area = ws.areas.find((a) => a.id === 'area-commerce')!;
    const people = [
      ...area.members.map((m) => m.personId),
      ...ws.teams
        .filter((t) => area.teamIds.includes(t.id))
        .flatMap((t) => t.members.map((m) => m.personId)),
    ];
    const found = clashes(ws, index, people, {
      from: COMMERCE_FIRST_CLASH,
      to: addDays(COMMERCE_FIRST_CLASH, 12 * 7),
      units: new Set([area.id, ...area.teamIds]),
    });
    expect(new Set(found.map((c) => c.date)).size).toBe(COMMERCE_CLASH_DAYS);
    expect(found[0]).toMatchObject({ personId: 'person-robin', date: COMMERCE_FIRST_CLASH });
  });

  it('finds per person exactly the conflicts the calendar marks', () => {
    for (const person of ws.people) {
      const one = clashes(ws, index, [person.id]).map(({ date, a, b }) => ({ date, a, b }));
      expect(one, person.name).toEqual(conflicts(ws, index, person.id));
    }
  });
});
