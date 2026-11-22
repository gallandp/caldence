import { describe, expect, it } from 'vitest';
import { rareFirst, teamTags } from '../../src/core/views';

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

describe('teamTags (#504)', () => {
  it('drops the words all teams share', () => {
    expect(teamTags(['Team Alpha', 'Team Beta'])).toEqual({
      'Team Alpha': 'Alpha',
      'Team Beta': 'Beta',
    });
  });
  it('keeps a name that would be empty', () => {
    expect(teamTags(['Team', 'Team Gamma'])).toEqual({ Team: 'Team', 'Team Gamma': 'Gamma' });
  });
});
