import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadPerWeek, peopleOverLimit, personLoad } from '../../src/core/load';
import type { Workspace } from '../../src/core/model';
import { workspaceIndex } from '../../src/core/views';

const ws = JSON.parse(readFileSync('src/data/examples/example.caldence.json', 'utf8')) as Workspace;
const weeks = loadPerWeek(ws, workspaceIndex(ws));

describe('the example file (#511)', () => {
  it('shows one person over the limit: Robin, in two teams with few weekly hours', () => {
    const ids = ws.people.map((p) => p.id);
    expect(peopleOverLimit(ws, weeks, ids)).toEqual(['person-robin']);
    expect(personLoad(ws, weeks, 'person-robin').share).toBeCloseTo(0.65, 1);
  });
});
