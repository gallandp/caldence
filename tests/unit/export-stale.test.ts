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
});
