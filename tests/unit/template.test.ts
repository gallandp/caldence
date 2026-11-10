import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA, emptyWorkspace } from '../../src/core/model';
import {
  applyTemplate,
  loadTemplate,
  teamToTemplate,
  validateTemplate,
  type Template,
} from '../../src/core/template';
import { BUILTIN_TEMPLATES, builtinTemplate } from '../../src/data/templates';
import { exampleWorkspace } from '../../src/data/examples';
import { occurrences } from '../../src/core/recurrence';
import { workspaceIndex } from '../../src/core/views';
import { addDays, weekday } from '../../src/core/date';

const IDS = ['scrum', 'kanban', 'safe'] as const;
const LOCALES = ['de', 'en'] as const;

function stripText(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripText);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => k !== 'name' && k !== 'description')
        .map(([k, x]) => [k, stripText(x)]),
    );
  }
  return v;
}

const noIds = (events: unknown[]): unknown =>
  JSON.parse(JSON.stringify(events, (k, v) => (k === 'id' ? undefined : v)));

describe('built-in templates', () => {
  for (const id of IDS)
    for (const loc of LOCALES) {
      it(`${id}.${loc} is valid`, () => {
        const t = BUILTIN_TEMPLATES[id][loc];
        expect(validateTemplate(structuredClone(t)).ok).toBe(true);
        expect(builtinTemplate(id, loc)).toBe(t);
        expect(t.id).toBe(id);
      });
    }
  for (const id of IDS)
    it(`${id}: de and en differ only in text`, () => {
      expect(stripText(BUILTIN_TEMPLATES[id].de)).toEqual(stripText(BUILTIN_TEMPLATES[id].en));
    });
});

describe('applyTemplate', () => {
  const scrum = BUILTIN_TEMPLATES.scrum.en;

  it('adds one team, roles, categories and events and shifts the cadence', () => {
    const r = applyTemplate(emptyWorkspace('2027-02-10'), scrum, {
      name: 'Alpha',
      today: '2027-02-10',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [ws, teamId] = r.value;
    expect(ws.teams).toHaveLength(1);
    expect(ws.roles).toHaveLength(3);
    expect(ws.categories).toHaveLength(2);
    const team = ws.teams[0]!;
    expect(team.id).toBe(teamId);
    expect(team.name).toBe('Alpha');
    expect(team.templateId).toBe('scrum');
    expect(team.events).toHaveLength(5);
    expect(team.members).toEqual([]);
    expect(team.cadence.start).toBe('2027-02-15');
  });

  it('keeps the start when today is already that weekday', () => {
    const r = applyTemplate(emptyWorkspace('2027-02-15'), scrum, {
      name: 'A',
      today: '2027-02-15',
    });
    expect(r.ok && r.value[0].teams[0]!.cadence.start).toBe('2027-02-15');
  });

  it('reuses roles and categories when applied twice', () => {
    const first = applyTemplate(emptyWorkspace('2027-02-10'), scrum, {
      name: 'A',
      today: '2027-02-10',
    });
    if (!first.ok) throw new Error('first');
    const second = applyTemplate(first.value[0], scrum, { name: 'B', today: '2027-02-10' });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const ws = second.value[0];
    expect(ws.teams).toHaveLength(2);
    expect(ws.roles).toHaveLength(3);
    expect(ws.categories).toHaveLength(2);
    expect(ws.teams[1]!.id).not.toBe(ws.teams[0]!.id);
  });

  it('matches existing roles by trimmed, case-insensitive name and remaps references', () => {
    const base = emptyWorkspace('2027-02-10');
    base.roles.push({ id: 'x', name: '  product owner ', colour: '#112233' });
    const r = applyTemplate(base, scrum, { name: 'A', today: '2027-02-10' });
    if (!r.ok) throw new Error('apply');
    const ws = r.value[0];
    expect(ws.roles).toHaveLength(3);
    const planning = ws.teams[0]!.events.find((e) => e.name === 'Sprint Planning')!;
    expect(planning.participants.some((p) => p.roleId === 'x')).toBe(true);
  });

  it('shifts SAFe milestones and anchors with the cadence start', () => {
    const safe = BUILTIN_TEMPLATES.safe.en;
    const r = applyTemplate(emptyWorkspace('2027-02-10'), safe, {
      name: 'ART',
      today: '2027-02-10',
    });
    if (!r.ok) throw new Error('apply');
    const team = r.value[0].teams[0]!;
    expect(team.cadence.start).toBe('2027-02-15');
    const ms = team.cycles[0]!.milestones.map((m) => m.date);
    expect(ms).toEqual(['2027-04-22', '2027-04-26']);
    const iterationEnd = new Set(['Iteration Review', 'Iteration Retrospective', 'System Demo']);
    for (const e of team.events)
      if (e.rule.type === 'every-n-weeks')
        expect(e.rule.anchor).toBe(iterationEnd.has(e.name) ? '2027-02-22' : '2027-02-15');
  });

  for (const loc of LOCALES)
    it(`SAFe.${loc}: review, retrospective and demo first fall in the iteration's second week`, () => {
      const r = applyTemplate(emptyWorkspace('2027-02-10'), BUILTIN_TEMPLATES.safe[loc], {
        name: 'ART',
        today: '2027-02-10',
      });
      if (!r.ok) throw new Error('apply');
      const ws = r.value[0];
      const team = ws.teams[0]!;
      const start = team.cadence.start;
      const occ = occurrences(team, ws.settings, workspaceIndex(ws));
      const ids = ['e-itreview', 'e-itretro', 'e-demo'];
      for (const id of ids) {
        const first = occ.find((o) => o.eventId === id)!;
        expect(first, id).toBeDefined();
        // Second week of the first 2-week iteration, still on Friday.
        expect(first.date, id).toBe(addDays(start, 11));
        expect(weekday(first.date), id).toBe(5);
        const second = occ.filter((o) => o.eventId === id)[1]!;
        expect(second.date, id).toBe(addDays(start, 25));
      }
      const planning = occ.find((o) => o.eventId === 'e-itplan')!;
      expect(planning.date).toBe(start);
    });

  it('does not mutate its inputs', () => {
    const ws = emptyWorkspace('2027-02-10');
    const before = JSON.stringify(ws);
    const tBefore = JSON.stringify(scrum);
    applyTemplate(ws, scrum, { name: 'A', today: '2027-02-10' });
    expect(JSON.stringify(ws)).toBe(before);
    expect(JSON.stringify(scrum)).toBe(tBefore);
  });
});

describe('teamToTemplate', () => {
  const example = exampleWorkspace();
  const opts = { id: 'mine', name: 'Mine', description: 'My team' };

  it('contains no personal data and validates', () => {
    const t = teamToTemplate(example, 'team-alpha', opts);
    const json = JSON.stringify(t);
    for (const p of example.people) expect(json).not.toContain(p.name);
    expect(t).not.toHaveProperty('people');
    expect(t.team).not.toHaveProperty('members');
    expect(t.team).not.toHaveProperty('id');
    expect(validateTemplate(structuredClone(t)).ok).toBe(true);
    const usedCats = new Set(example.teams[0]!.events.map((e) => e.categoryId));
    expect(t.categories.map((c) => c.id).sort()).toEqual([...usedCats].sort());
  });

  it('round-trips through applyTemplate', () => {
    const t = teamToTemplate(example, 'team-alpha', opts);
    const start = example.teams[0]!.cadence.start;
    const r = applyTemplate(emptyWorkspace(start), t, { name: 'Copy', today: start });
    if (!r.ok) throw new Error('apply');
    const copy = r.value[0].teams[0]!;
    const orig = example.teams[0]!;
    const resolve = (ws: typeof example, e: (typeof orig.events)[number]): unknown => ({
      ...e,
      id: undefined,
      categoryId: ws.categories.find((c) => c.id === e.categoryId)!.name,
      participants: e.participants.map((p) => ({
        share: p.share,
        role: ws.roles.find((x) => x.id === p.roleId)!.name,
      })),
    });
    expect(copy.events.map((e) => noIds([resolve(r.value[0], e)]))).toEqual(
      orig.events.map((e) => noIds([resolve(example, e)])),
    );
  });
});

describe('wrong files', () => {
  const tpl = (): Record<string, unknown> => structuredClone(BUILTIN_TEMPLATES.scrum.en) as never;
  const keys = (r: ReturnType<typeof loadTemplate>): string[] =>
    r.ok ? [] : r.errors.map((e) => e.key);

  it('rejects a workspace file as not a template', () => {
    expect(keys(loadTemplate(JSON.stringify(exampleWorkspace())))).toContain(
      'template.error.notTemplate',
    );
  });
  it('rejects settings', () => {
    expect(keys(validateTemplate({ ...tpl(), settings: {} }))).toContain(
      'template.error.notTemplate',
    );
  });
  it('rejects people and members', () => {
    expect(keys(validateTemplate({ ...tpl(), people: [] }))).toContain('template.error.personal');
    const t = tpl();
    (t.team as Record<string, unknown>).members = [];
    expect(keys(validateTemplate(t))).toContain('template.error.personal');
  });
  it('rejects newer schema and bad JSON', () => {
    expect(keys(loadTemplate(JSON.stringify({ ...tpl(), schemaVersion: 99 })))).toEqual([
      'error.schema.newer',
    ]);
    expect(keys(loadTemplate('{nope'))).toEqual(['error.file.json']);
  });
  it('maps error paths to team.', () => {
    const t = tpl();
    (t.team as { events: { time: string }[] }).events[0]!.time = 'x';
    const r = validateTemplate(t);
    expect(!r.ok && r.errors[0]!.path).toBe('team.events.0.time');
  });
  it('rejects ids with line breaks or other unsafe characters (security #39)', () => {
    const t = tpl();
    t.id = 'scrum\r\nX-INJECT:1';
    (t.team as { events: { id: string }[] }).events[0]!.id = 'e\nBEGIN:VEVENT';
    const r = validateTemplate(t);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors).toContainEqual({ path: 'id', key: 'error.id.invalid' });
    expect(!r.ok && r.errors).toContainEqual({ path: 'team.events.0.id', key: 'error.id.invalid' });
  });
  it('rejects customRegions', () => {
    expect(keys(validateTemplate({ ...tpl(), customRegions: [] }))).toContain(
      'template.error.notTemplate',
    );
  });
  it('applies a schema 2 template without picking up customRegions', () => {
    const t = { ...tpl(), schemaVersion: 2 };
    const r = validateTemplate(t);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.value).not.toHaveProperty('customRegions');
    const applied = applyTemplate(emptyWorkspace('2026-11-09'), r.value, {
      name: 'Team',
      today: '2026-11-09',
    });
    expect(applied.ok).toBe(true);
  });
  it('exports templates with the current schema and no customRegions', () => {
    const t = teamToTemplate(exampleWorkspace(), 'team-alpha', {
      id: 'x',
      name: 'X',
      description: '',
    });
    expect(t.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(t).not.toHaveProperty('customRegions');
  });
  it('accepts a template as loaded text', () => {
    const r: ReturnType<typeof loadTemplate> = loadTemplate(JSON.stringify(tpl()));
    expect(r.ok).toBe(true);
    const v: Template | undefined = r.ok ? r.value : undefined;
    expect(v?.kind).toBe('caldence-template');
  });
});

describe('template limits (security #41)', () => {
  it('rejects text above 5 MB before parsing it', () => {
    const r = loadTemplate(`{"x":"${'a'.repeat(5 * 1024 * 1024)}"}`);
    expect(!r.ok && r.errors).toEqual([{ path: '', key: 'error.file.tooLarge' }]);
  });
  it('rejects a description above 2000 characters', () => {
    const t = structuredClone(BUILTIN_TEMPLATES.scrum.en) as unknown as Record<string, unknown>;
    t.description = 'x'.repeat(2001);
    const r = validateTemplate(t);
    expect(!r.ok && r.errors).toContainEqual({ path: 'description', key: 'error.text.tooLong' });
  });
});
