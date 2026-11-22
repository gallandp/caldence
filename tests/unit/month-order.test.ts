import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Workspace } from '../../src/core/model';
import { meetingFrequency, rareFirst, teamTags, workspaceIndex } from '../../src/core/views';

describe('rareFirst (#504)', () => {
  it('puts rarer meetings first, then longer ones, dailies last', () => {
    const count = { 'a/daily': 60, 'a/planning': 6, 'a/review': 6, 'b/refine': 12 };
    const day = [
      { teamId: 'a', eventId: 'daily', start: '09:00', duration: 15 },
      { teamId: 'b', eventId: 'refine', start: '11:00', duration: 60 },
      { teamId: 'a', eventId: 'review', start: '14:00', duration: 60 },
      { teamId: 'a', eventId: 'planning', start: '10:00', duration: 120 },
    ];
    expect(rareFirst(day, count).map((o) => o.eventId)).toEqual([
      'planning',
      'review',
      'refine',
      'daily',
    ]);
  });
});

describe('rareFirst tie-breaks (#504)', () => {
  const m = (teamId: string, eventId: string, start: string, duration: number) => ({
    teamId,
    eventId,
    start,
    duration,
  });
  it('same count: longer first, then earlier, then team id', () => {
    const count = { 'a/x': 5, 'a/y': 5, 'b/y': 5, 'a/z': 5 };
    const day = [
      m('b', 'y', '10:00', 30),
      m('a', 'y', '10:00', 30),
      m('a', 'z', '09:00', 30),
      m('a', 'x', '11:00', 90),
    ];
    expect(rareFirst(day, count).map((o) => `${o.teamId}/${o.eventId}`)).toEqual([
      'a/x',
      'a/z',
      'a/y',
      'b/y',
    ]);
  });
  it('an unknown meeting counts as the rarest', () => {
    expect(
      rareFirst([m('a', 'd', '09:00', 15), m('a', 'new', '12:00', 15)], { 'a/d': 9 })[0]!.eventId,
    ).toBe('new');
  });
});

describe('teamTags (#504)', () => {
  it('drops the words all teams share, keyed by team id', () => {
    expect(
      teamTags([
        { id: 'a', name: 'Team Alpha' },
        { id: 'b', name: 'Team Beta' },
      ]),
    ).toEqual({ a: 'Alpha', b: 'Beta' });
  });
  it('keeps a name that would be empty', () => {
    expect(
      teamTags([
        { id: 't', name: 'Team' },
        { id: 'g', name: 'Team Gamma' },
      ]),
    ).toEqual({ t: 'Team', g: 'Gamma' });
  });
});

describe('meetingFrequency (#504)', () => {
  it('counts every occurrence in the horizon, whatever the filter', () => {
    const ws = JSON.parse(
      readFileSync('src/data/examples/example.caldence.json', 'utf8'),
    ) as Workspace;
    const count = meetingFrequency(ws, workspaceIndex(ws));
    const alpha = ws.teams[0]!;
    const daily = alpha.events.find((e) => e.name === 'Weekly Sync')!;
    const planning = alpha.events.find((e) => e.name === 'Sprint Planning')!;
    expect(count[`${alpha.id}/${daily.id}`]!).toBeGreaterThan(count[`${alpha.id}/${planning.id}`]!);
  });
});
