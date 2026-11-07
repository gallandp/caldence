import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Workspace } from '../../src/core/model';
import { conflicts, dayLoad, workspaceIndex } from '../../src/core/views';
import { ALEX_OVERLAP_DAY, DAY_HOURS } from '../e2e/calendar-expected';

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
});
