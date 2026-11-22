import { beforeEach, describe, expect, it } from 'vitest';
import { markChanged, rememberExport, staleForTeam } from '../../src/ui/state/exports';

const ev = (uid: string) => ({
  uid,
  date: '2026-01-07',
  start: 'DTSTART:20260107T090000',
  end: 'DTEND:20260107T100000',
  summary: 'Refinement',
});

describe('export out of date (#509)', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    } as Storage;
  });

  it('gives no hint when nothing was exported', () => {
    markChanged('ws', 'team-a', 'ref');
    expect(staleForTeam('ws', 'team-a')).toBe(false);
  });

  it('flags the team after a change to an exported meeting, until that scope is exported again', () => {
    rememberExport('ws', { personId: 'p1' }, [ev('ref.team-a.ws@caldence')]);
    expect(staleForTeam('ws', 'team-a')).toBe(false);
    markChanged('ws', 'team-a', 'other');
    expect(staleForTeam('ws', 'team-a')).toBe(false);
    markChanged('ws', 'team-a', 'ref');
    expect(staleForTeam('ws', 'team-a')).toBe(true);
    expect(staleForTeam('ws', 'team-b')).toBe(false);
    expect(staleForTeam('other-ws', 'team-a')).toBe(false);
    rememberExport('ws', { personId: 'p1' }, [ev('ref.team-a.ws@caldence')]);
    expect(staleForTeam('ws', 'team-a')).toBe(false);
  });

  it('also matches meetings written one entry per date', () => {
    rememberExport('ws', { teamId: 'team-a' }, [ev('ref.team-a.ws-2026-01-07@caldence')]);
    markChanged('ws', 'team-a', 'ref');
    expect(staleForTeam('ws', 'team-a')).toBe(true);
  });

  it('clears a team in every scope when an export holds it again', () => {
    rememberExport('ws', { personId: 'p1' }, [ev('ref.team-a.ws@caldence')]);
    markChanged('ws', 'team-a', 'ref');
    rememberExport('ws', { teamId: 'team-a' }, [ev('daily.team-a.ws@caldence')]);
    expect(staleForTeam('ws', 'team-a')).toBe(false);
  });

  it('reads entries without marks and survives blocked storage', () => {
    localStorage.setItem(
      'caldence.exports.v1',
      JSON.stringify({ 'ws|||p1': { at: 1, events: [ev('ref.team-a.ws@caldence')] } }),
    );
    expect(staleForTeam('ws', 'team-a')).toBe(false);
    globalThis.localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(() => markChanged('ws', 'team-a', 'ref')).not.toThrow();
    expect(staleForTeam('ws', 'team-a')).toBe(false);
  });
});
