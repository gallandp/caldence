import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/valid-workspace.json';
import type { CalEvent, Workspace } from '../../src/core/model';
import { validate, type Result } from '../../src/core/validate';
import {
  addItem,
  addTeam,
  duplicateEvent,
  duplicateTeam,
  moveItem,
  newId,
  removeCycle,
  removeEvent,
  removeItem,
  removeTeam,
  renameAssumption,
  updateItem,
  updateSettings,
  updateTeam,
  upsertCycle,
  upsertEvent,
} from '../../src/core/edit';

const base = (): Workspace => structuredClone(fixture) as unknown as Workspace;

function ok<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
}
const valid = (ws: Workspace) => expect(validate(ws).ok).toBe(true);

/** A workspace with two roles, two people, two categories and a second event. */
function rich(): Workspace {
  const ws = base();
  ws.roles.push({ id: 'r2', name: 'Tester', colour: '#00aa00' });
  ws.people.push({ id: 'p2', name: 'Bo', hoursPerWeek: 20 });
  ws.categories.push({ id: 'c2', name: 'Review', colour: '#0000ff' });
  const team = ws.teams[0]!;
  team.members.push({ personId: 'p2', roleId: 'r2' });
  team.events.push({
    id: 'e2',
    name: 'Review',
    categoryId: 'c2',
    rule: { type: 'weekly', weekday: 2 },
    time: '10:00',
    duration: 30,
    participants: [
      { roleId: 'r1', share: 0.5 },
      { roleId: 'r2', share: 0.75 },
    ],
    preparation: 0,
  });
  return ws;
}

describe('newId', () => {
  it('returns the smallest free number', () => {
    expect(newId('r', ['r1', 'r3'])).toBe('r2');
    expect(newId('r', [])).toBe('r1');
  });
});

describe('list items', () => {
  it('adds, updates and moves without mutating', () => {
    const ws = base();
    const before = structuredClone(ws);
    const [w2, id] = addItem(ws, 'roles', { name: 'PO', colour: '#112233' });
    expect(id).toBe('r2');
    expect(ws).toEqual(before);
    const w3 = updateItem(w2, 'roles', 'r2', { name: 'Owner' });
    expect(w3.roles[1]!.name).toBe('Owner');
    expect(w2.roles[1]!.name).toBe('PO');
    const w4 = moveItem(w3, 'roles', 'r2', -1);
    expect(w4.roles.map((r) => r.id)).toEqual(['r2', 'r1']);
    valid(w4);
  });

  it('uses prefixes p and c', () => {
    const [w, p] = addItem(base(), 'people', { name: 'X', hoursPerWeek: 10 });
    const [, c] = addItem(w, 'categories', { name: 'Y', colour: '#ffffff' });
    expect([p, c]).toEqual(['p2', 'c2']);
  });

  it('moving past either end is a no-op', () => {
    const ws = rich();
    expect(moveItem(ws, 'roles', 'r1', -1)).toEqual(ws);
    expect(moveItem(ws, 'roles', 'r2', 1)).toEqual(ws);
    expect(moveItem(ws, 'roles', 'nope', 1)).toEqual(ws);
  });
});

describe('removeItem', () => {
  it('refuses a role in use without replacement', () => {
    const ws = base();
    const before = structuredClone(ws);
    const r = removeItem(ws, 'roles', 'r1');
    expect(r).toEqual({ ok: false, errors: [{ path: 'roles.0', key: 'error.ref.inuse' }] });
    expect(ws).toEqual(before);
  });

  it('removes an unused role', () => {
    const [w, id] = addItem(base(), 'roles', { name: 'PO', colour: '#112233' });
    const out = ok(removeItem(w, 'roles', id));
    expect(out.roles.map((r) => r.id)).toEqual(['r1']);
    valid(out);
  });

  it('merges participants and members when replacing a role', () => {
    const ws = rich();
    ws.teams[0]!.members.push({ personId: 'p1', roleId: 'r2' });
    const out = ok(removeItem(ws, 'roles', 'r1', 'r2'));
    const team = out.teams[0]!;
    expect(team.events[1]!.participants).toEqual([{ roleId: 'r2', share: 1 }]);
    expect(team.events[0]!.participants).toEqual([{ roleId: 'r2', share: 1 }]);
    expect(team.members).toEqual([
      { personId: 'p1', roleId: 'r2' },
      { personId: 'p2', roleId: 'r2' },
    ]);
    expect(out.roles.map((r) => r.id)).toEqual(['r2']);
    valid(out);
  });

  it('rejects unknown or identical replacements', () => {
    const ws = base();
    for (const rep of ['r1', 'zzz'])
      expect(removeItem(ws, 'roles', 'r1', rep)).toMatchObject({
        ok: false,
        errors: [{ key: 'error.ref.unknown' }],
      });
  });

  it('moves events of a removed category to the replacement', () => {
    const ws = rich();
    expect(removeItem(ws, 'categories', 'c1').ok).toBe(false);
    const out = ok(removeItem(ws, 'categories', 'c1', 'c2'));
    expect(out.teams[0]!.events.map((e) => e.categoryId)).toEqual(['c2', 'c2']);
    expect(out.categories.map((c) => c.id)).toEqual(['c2']);
    valid(out);
  });

  it('drops memberships of a removed person', () => {
    const out = ok(removeItem(rich(), 'people', 'p2'));
    expect(out.teams[0]!.members).toEqual([{ personId: 'p1', roleId: 'r1' }]);
    expect(out.people.map((p) => p.id)).toEqual(['p1']);
    valid(out);
  });

  it('moves memberships to the replacement person without duplicates', () => {
    const ws = rich();
    ws.teams[0]!.members.push({ personId: 'p2', roleId: 'r1' });
    const out = ok(removeItem(ws, 'people', 'p2', 'p1'));
    expect(out.teams[0]!.members).toEqual([
      { personId: 'p1', roleId: 'r1' },
      { personId: 'p1', roleId: 'r2' },
    ]);
    valid(out);
  });
});

describe('teams', () => {
  it('adds an empty team on the Monday of today', () => {
    const [w, id] = addTeam(base(), 'New', '2026-11-11');
    expect(id).toBe('t2');
    expect(w.teams[1]).toEqual({
      id: 't2',
      name: 'New',
      cadence: { kind: 'sprint', lengthWeeks: 2, start: '2026-11-09' },
      members: [],
      assumptions: {},
      cycles: [],
      events: [],
    });
    valid(w);
  });

  it('refuses to remove an assumption used by scaling', () => {
    const ws = base();
    const r = updateTeam(ws, 't1', { assumptions: {} });
    expect(r).toEqual({
      ok: false,
      errors: [{ path: 'teams.0.assumptions.stories', key: 'error.ref.inuse' }],
    });
    const out = ok(updateTeam(ws, 't1', { assumptions: { stories: 3, extra: 1 }, name: 'Z' }));
    expect(out.teams[0]!.name).toBe('Z');
    valid(out);
  });

  it('validates members of updateTeam', () => {
    const r = updateTeam(base(), 't1', { members: [{ personId: 'nope', roleId: 'r1' }] });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok)
      expect(r.errors[0]).toEqual({
        path: 'teams.0.members.0.personId',
        key: 'error.ref.unknown',
      });
    const r2 = updateTeam(base(), 't1', { members: [{ personId: 'p1', roleId: 'nope' }] });
    if (!r2.ok) expect(r2.errors[0]!.key).toBe('error.ref.unknown');
    else throw new Error('expected failure');
  });

  it('unknown team: unchanged / error-free', () => {
    const ws = base();
    expect(removeTeam(ws, 'zz')).toEqual(ws);
    expect(removeEvent(ws, 'zz', 'e1')).toEqual(ws);
    expect(ok(upsertCycle(ws, 'zz', { id: '', name: 'x', milestones: [] }))).toEqual(ws);
  });

  it('duplicates deeply with a new id', () => {
    const ws = base();
    const before = structuredClone(ws);
    const [w, id] = duplicateTeam(ws, 't1', 'Copy');
    expect(ws).toEqual(before);
    expect(id).toBe('t2');
    expect(w.teams[1]!.name).toBe('Copy');
    expect(w.teams[1]!.events).toEqual(w.teams[0]!.events);
    const w2 = updateItem(w, 'roles', 'r1', { name: 'Same' });
    w.teams[1]!.events[0]!.name = 'Changed';
    expect(w.teams[0]!.events[0]!.name).toBe('Planning');
    expect(w2.teams[0]!.events[0]!.name).toBe('Planning');
    valid(w2);
    valid(removeTeam(w2, 't1'));
    expect(removeTeam(w2, 't1').teams.map((t) => t.id)).toEqual(['t2']);
  });
});

describe('renameAssumption', () => {
  it('renames the key, keeps its value and order, and updates scaling rules', () => {
    const ws = base();
    ws.teams[0]!.assumptions = { first: 1, stories: 8, last: 2 };
    const out = ok(renameAssumption(ws, 't1', 'stories', 'tickets'));
    const team = out.teams[0]!;
    expect(Object.entries(team.assumptions)).toEqual([
      ['first', 1],
      ['tickets', 8],
      ['last', 2],
    ]);
    expect(team.events.flatMap((e) => (e.scaling ? [e.scaling.assumption] : []))).toEqual([
      'tickets',
    ]);
    valid(out);
  });

  it('refuses a target key that exists', () => {
    const ws = base();
    ws.teams[0]!.assumptions = { stories: 8, other: 1 };
    expect(renameAssumption(ws, 't1', 'stories', 'other')).toEqual({
      ok: false,
      errors: [{ path: 'teams.0.assumptions.other', key: 'error.id.duplicate' }],
    });
  });

  it('refuses an empty target and an unknown source', () => {
    const ws = base();
    expect(renameAssumption(ws, 't1', 'stories', '  ').ok).toBe(false);
    expect(renameAssumption(ws, 't1', 'nope', 'x')).toEqual({
      ok: false,
      errors: [{ path: 'teams.0.assumptions.nope', key: 'error.ref.unknown' }],
    });
  });

  it('is a no-op for the same key', () => {
    const ws = base();
    expect(ok(renameAssumption(ws, 't1', 'stories', 'stories'))).toEqual(ws);
  });
});

describe('cycles', () => {
  it('refuses to remove a cycle used by an event', () => {
    expect(removeCycle(base(), 't1', 'cy1')).toEqual({
      ok: false,
      errors: [{ path: 'teams.0.cycles.0', key: 'error.ref.inuse' }],
    });
  });

  it('refuses to drop a milestone an event still references', () => {
    const r = upsertCycle(base(), 't1', { id: 'cy1', name: 'Release', milestones: [] });
    expect(r).toEqual({
      ok: false,
      errors: [{ path: 'teams.0.cycles.0.milestones', key: 'error.ref.inuse' }],
    });
    const keep = ok(
      upsertCycle(base(), 't1', {
        id: 'cy1',
        name: 'R2',
        milestones: [
          { id: 'm1', name: 'Freeze', date: '2026-12-02' },
          { id: 'm2', name: 'Ship', date: '2026-12-20' },
        ],
      }),
    );
    valid(keep);
  });

  it('upserts and removes unused cycles', () => {
    const w = ok(upsertCycle(base(), 't1', { id: '', name: 'Q1', milestones: [] }));
    expect(w.teams[0]!.cycles.map((c) => c.id)).toEqual(['cy1', 'cy2']);
    const w2 = ok(upsertCycle(w, 't1', { id: 'cy2', name: 'Q2', milestones: [] }));
    expect(w2.teams[0]!.cycles[1]!.name).toBe('Q2');
    expect(w2.teams[0]!.cycles).toHaveLength(2);
    const out = ok(removeCycle(w2, 't1', 'cy2'));
    expect(out.teams[0]!.cycles).toHaveLength(1);
    valid(out);
  });
});

describe('events', () => {
  const draft = (): CalEvent => ({
    id: '',
    name: 'Daily',
    categoryId: 'c1',
    rule: { type: 'weekly', weekday: 1 },
    time: '09:30',
    duration: 15,
    participants: [{ roleId: 'r1', share: 1 }],
    preparation: 0,
  });

  it('creates, replaces, duplicates and removes', () => {
    const ws = base();
    const before = structuredClone(ws);
    const [w, id] = upsertEvent(ws, 't1', draft());
    expect(ws).toEqual(before);
    expect(id).toBe('e2');
    const [w2, id2] = upsertEvent(w, 't1', { ...draft(), id, name: 'Standup' });
    expect(id2).toBe('e2');
    expect(w2.teams[0]!.events.map((e) => e.name)).toEqual(['Planning', 'Standup']);
    const [w3, id3] = duplicateEvent(w2, 't1', 'e1');
    expect(id3).toBe('e3');
    expect(w3.teams[0]!.events[2]).toEqual({ ...w3.teams[0]!.events[0]!, id: 'e3' });
    valid(w3);
    const w4 = removeEvent(w3, 't1', 'e1');
    expect(w4.teams[0]!.events.map((e) => e.id)).toEqual(['e2', 'e3']);
    valid(w4);
  });

  it('unknown team or event leaves ws unchanged', () => {
    const ws = base();
    expect(duplicateEvent(ws, 't1', 'zz')[0]).toEqual(ws);
    expect(upsertEvent(ws, 'zz', draft())[0]).toEqual(ws);
  });
});

describe('settings', () => {
  it('merges the patch', () => {
    const ws = base();
    const w = updateSettings(ws, { hoursPerWeek: 35 });
    expect(w.settings.hoursPerWeek).toBe(35);
    expect(ws.settings.hoursPerWeek).toBe(40);
    valid(w);
  });
});

describe('validate preparation cap', () => {
  it('rejects preparation above 1', () => {
    const ws = base();
    ws.teams[0]!.events[0]!.preparation = 1.5;
    const r = validate(ws);
    expect(r).toEqual({
      ok: false,
      errors: [{ path: 'teams.0.events.0.preparation', key: 'error.number.invalid' }],
    });
  });
});

describe('purity of every edit function', () => {
  const ev = (): CalEvent => ({
    id: '',
    name: 'New',
    categoryId: 'c1',
    rule: { type: 'weekly', weekday: 3 },
    time: '11:00',
    duration: 30,
    participants: [{ roleId: 'r1', share: 1 }],
    preparation: 0,
  });
  const cases: [string, (ws: Workspace) => unknown][] = [
    ['addItem', (ws) => addItem(ws, 'roles', { name: 'N', colour: '#112233' })],
    ['updateItem', (ws) => updateItem(ws, 'people', 'p1', { name: 'Z' })],
    ['moveItem', (ws) => moveItem(ws, 'roles', 'r2', -1)],
    ['removeItem roles', (ws) => removeItem(ws, 'roles', 'r1', 'r2')],
    ['removeItem categories', (ws) => removeItem(ws, 'categories', 'c1', 'c2')],
    ['removeItem people', (ws) => removeItem(ws, 'people', 'p2', 'p1')],
    ['removeItem refused', (ws) => removeItem(ws, 'roles', 'r1')],
    ['addTeam', (ws) => addTeam(ws, 'N', '2026-11-11')],
    ['updateTeam', (ws) => updateTeam(ws, 't1', { name: 'Q', assumptions: { stories: 1 } })],
    ['renameAssumption', (ws) => renameAssumption(ws, 't1', 'stories', 'tickets')],
    ['duplicateTeam', (ws) => duplicateTeam(ws, 't1', 'C')],
    ['removeTeam', (ws) => removeTeam(ws, 't1')],
    ['upsertCycle', (ws) => upsertCycle(ws, 't1', { id: '', name: 'Q', milestones: [] })],
    ['removeCycle refused', (ws) => removeCycle(ws, 't1', 'cy1')],
    ['upsertEvent', (ws) => upsertEvent(ws, 't1', ev())],
    ['duplicateEvent', (ws) => duplicateEvent(ws, 't1', 'e1')],
    ['removeEvent', (ws) => removeEvent(ws, 't1', 'e1')],
    ['updateSettings', (ws) => updateSettings(ws, { hoursPerWeek: 30 })],
  ];

  it.each(cases)('%s leaves its input untouched', (_n, fn) => {
    const ws = rich();
    const before = structuredClone(ws);
    fn(ws);
    expect(ws).toEqual(before);
  });

  it.each(cases)('%s returns a result that shares nothing with the input', (_n, fn) => {
    const ws = rich();
    const before = structuredClone(ws);
    const raw = fn(ws);
    const out = (Array.isArray(raw) ? raw[0] : raw) as Workspace | Result<Workspace>;
    const w = 'ok' in out ? (out.ok ? out.value : undefined) : out;
    if (!w) return;
    for (const t of w.teams) {
      t.name = 'X';
      t.members.push({ personId: 'p1', roleId: 'r1' });
      for (const e of t.events) e.participants.push({ roleId: 'r1', share: 0.1 });
      for (const c of t.cycles) c.milestones.push({ id: 'zz', name: 'z', date: '2026-01-01' });
    }
    for (const r of w.roles) r.name = 'X';
    w.settings.workdays.push(9);
    expect(ws).toEqual(before);
  });
});
