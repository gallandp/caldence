import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { emptyWorkspace } from '../../src/core/model';
import { addTeam, removeTeam, updateSettings } from '../../src/core/edit';
import { createWorkspaceStore, createActiveTeamId } from '../../src/ui/state/workspace';
import { fieldErrors } from '../../src/ui/state/form';

const fresh = () => createWorkspaceStore(emptyWorkspace('2026-01-05'));
const bump = (n: number) => (ws: ReturnType<typeof emptyWorkspace>) =>
  updateSettings(ws, { hoursPerWeek: n });

describe('workspace store', () => {
  it('leaves everything unchanged on a failed result', () => {
    const s = fresh();
    const before = get(s);
    const r = s.apply(() => ({ ok: false, errors: [{ path: '', key: 'error.x' }] }));
    expect(r.ok).toBe(false);
    expect(get(s)).toBe(before);
    expect(get(s.canUndo)).toBe(false);
    expect(get(s.dirty)).toBe(false);
  });

  it('rejects results that fail validate', () => {
    const s = fresh();
    const r = s.apply((ws) => ({ ...ws, schemaVersion: 999 }));
    expect(r.ok).toBe(false);
    expect(get(s.dirty)).toBe(false);
  });

  it('sets dirty and canUndo on ok change, accepts tuples', () => {
    const s = fresh();
    const r = s.apply((ws) => addTeam(ws, 'A', '2026-01-05'));
    expect(r.ok).toBe(true);
    expect(get(s.dirty)).toBe(true);
    expect(get(s.canUndo)).toBe(true);
    expect(get(s).teams).toHaveLength(1);
  });

  it('treats a deep-equal result as a no-op', () => {
    const s = fresh();
    const r = s.apply((ws) => updateSettings(ws, {}));
    expect(r.ok).toBe(true);
    expect(get(s.dirty)).toBe(false);
    expect(get(s.canUndo)).toBe(false);
  });

  it('returns the new id when the change returns a tuple', () => {
    const s = fresh();
    const r = s.apply((ws) => addTeam(ws, 'A', '2026-01-05'));
    expect(r.ok).toBe(true);
    expect(r.ok && r.id).toBe(get(s).teams[0]!.id);
    const plain = s.apply(bump(30));
    expect(plain.ok && plain.id).toBeUndefined();
  });

  it('undo restores the exact previous workspace', () => {
    const s = fresh();
    const before = get(s);
    s.apply(bump(30));
    expect(s.undo()).toBe(true);
    expect(get(s)).toStrictEqual(before);
    expect(get(s.canUndo)).toBe(false);
    expect(s.undo()).toBe(false);
  });

  it('undo still restores the original when a change mutates its input in place', () => {
    const s = fresh();
    const before = get(s);
    const snapshot = structuredClone(before);
    const r = s.apply((ws) => {
      ws.settings.hoursPerWeek = 12;
      return ws;
    });
    expect(r.ok).toBe(true);
    expect(get(s).settings.hoursPerWeek).toBe(12);
    expect(before).toStrictEqual(snapshot);
    expect(s.undo()).toBe(true);
    expect(get(s)).toStrictEqual(snapshot);
  });

  it('keeps at most 50 undo steps', () => {
    const s = fresh();
    for (let i = 1; i <= 51; i++) s.apply(bump(i));
    let n = 0;
    while (s.undo()) n++;
    expect(n).toBe(50);
  });

  it('replace clears history and sets dirty as given', () => {
    const s = fresh();
    s.apply(bump(30));
    s.replace(emptyWorkspace('2027-01-01'), { fileName: 'a.json', dirty: false });
    expect(get(s.canUndo)).toBe(false);
    expect(get(s.dirty)).toBe(false);
    expect(get(s.fileName)).toBe('a.json');
  });

  it('markSaved clears dirty and sets the file name', () => {
    const s = fresh();
    s.apply(bump(30));
    s.markSaved('b.json');
    expect(get(s.dirty)).toBe(false);
    expect(get(s.fileName)).toBe('b.json');
  });
});

describe('activeTeamId', () => {
  it('falls back to first team, then null', () => {
    const s = fresh();
    const active = createActiveTeamId(s);
    expect(get(active)).toBeNull();
    s.apply((ws) => addTeam(ws, 'A', '2026-01-05'));
    expect(get(active)).toBe(get(s).teams[0]!.id);
    s.apply((ws) => addTeam(ws, 'B', '2026-01-05'));
    const second = get(s).teams[1]!.id;
    active.set(second);
    expect(get(active)).toBe(second);
    s.apply((ws) => removeTeam(ws, second));
    expect(get(active)).toBe(get(s).teams[0]!.id);
    s.apply((ws) => removeTeam(ws, get(s).teams[0]!.id));
    expect(get(active)).toBeNull();
  });
});

describe('fieldErrors', () => {
  it('maps paths relative to the prefix', () => {
    expect(
      fieldErrors(
        [{ path: 'teams.0.events.2.time', key: 'error.time.invalid' }],
        'teams.0.events.2',
      ),
    ).toEqual({ time: 'error.time.invalid' });
  });
  it('ignores other prefixes and keeps the first error per field', () => {
    expect(
      fieldErrors(
        [
          { path: 'teams.0.name', key: 'a' },
          { path: 'teams.1.name', key: 'b' },
          { path: 'teams.1.name', key: 'c' },
        ],
        'teams.1',
      ),
    ).toEqual({ name: 'b' });
  });
});
