import { describe, expect, it } from 'vitest';
import { emptyWorkspace, ORG_UNIT } from '../../src/core/model';
import { setupLine, setupStructure, splitNames } from '../../src/core/setup';
import { builtinTemplate } from '../../src/data/templates';

const today = '2027-01-04';
const scrum = builtinTemplate('scrum', 'en');
const safe = builtinTemplate('safe', 'en');

describe('splitNames', () => {
  it('splits on lines and commas, trims and drops blanks and repeats', () => {
    expect(splitNames(' Kestrel\nOsprey, kestrel ,\n\n Wren ')).toEqual([
      'Kestrel',
      'Osprey',
      'Wren',
    ]);
  });
});

describe('setupStructure', () => {
  it('creates one area with its teams from the template and the level names', () => {
    const r = setupStructure(emptyWorkspace(today), {
      template: scrum,
      start: today,
      levelNames: { preset: 'platform' },
      areas: [{ name: 'Payments', teams: ['Kestrel', 'Osprey'] }],
      settings: { timezone: 'Europe/Berlin' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [out, show] = r.value;
    expect(out.areas.map((a) => a.name)).toEqual(['Payments']);
    expect(show).toBe(out.areas[0]!.id);
    expect(out.teams.map((t) => t.name)).toEqual(['Kestrel', 'Osprey']);
    expect(out.areas[0]!.teamIds).toEqual(out.teams.map((t) => t.id));
    expect(out.teams.every((t) => t.templateId === scrum.id && t.events.length > 0)).toBe(true);
    expect(out.settings.levelNames).toEqual({ preset: 'platform' });
    expect(out.settings.timezone).toBe('Europe/Berlin');
    expect(out.people).toEqual([]);
  });

  it('names the organisation, creates several areas and shows the organisation', () => {
    const r = setupStructure(emptyWorkspace(today), {
      template: null,
      start: today,
      organisation: ' Nordlicht ',
      areas: [
        { name: 'Payments', teams: ['Kestrel'] },
        { name: 'Travel', teams: ['Wren', 'Heron'] },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [out, show] = r.value;
    expect(show).toBe(ORG_UNIT);
    expect(out.organisation).toEqual({ name: 'Nordlicht' });
    const names = (ids: string[]) => ids.map((id) => out.teams.find((t) => t.id === id)!.name);
    expect(out.areas.map((a) => [a.name, names(a.teamIds)])).toEqual([
      ['Payments', ['Kestrel']],
      ['Travel', ['Wren', 'Heron']],
    ]);
  });

  it('gives every area its own area cadence with a template that has an area level', () => {
    const r = setupStructure(emptyWorkspace(today), {
      template: safe,
      start: today,
      areas: [
        { name: 'Payments', teams: ['Kestrel', 'Osprey'] },
        { name: 'Travel', teams: ['Wren'] },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [out] = r.value;
    expect(out.areas).toHaveLength(2);
    const [pay, travel] = out.areas;
    expect(pay!.name).toBe('Payments');
    expect(pay!.teamIds).toHaveLength(2);
    expect(travel!.name).toBe('Travel');
    expect(travel!.teamIds).toHaveLength(1);
    expect(pay!.cadence).toBeDefined();
    expect(travel!.cadence).toBeDefined();
    expect(travel!.events.length).toBe(pay!.events.length);
    expect(travel!.events.length).toBeGreaterThan(0);
  });

  it('refuses a blank area name and a structure without any team', () => {
    const blank = setupStructure(emptyWorkspace(today), {
      template: null,
      start: today,
      areas: [{ name: ' ', teams: ['Kestrel'] }],
    });
    expect(blank.ok).toBe(false);
    const none = setupStructure(emptyWorkspace(today), {
      template: null,
      start: today,
      areas: [{ name: 'Payments', teams: [' '] }],
    });
    expect(none.ok).toBe(false);
  });
});

describe('setupLine', () => {
  it('creates line teams under a group and shows the group', () => {
    const r = setupLine(emptyWorkspace(today), {
      lineName: 'Nordlicht Gruppe',
      group: 'Engineering',
      teams: ['Backend', 'Frontend'],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [out, show] = r.value;
    const group = out.lineUnits!.find((u) => u.name === 'Engineering')!;
    expect(show).toBe(group.id);
    expect(out.lineUnits!.filter((u) => u.parentId === group.id).map((u) => u.name)).toEqual([
      'Backend',
      'Frontend',
    ]);
    // The line's own name, never the product organisation's (#417).
    expect(out.lineName).toBe('Nordlicht Gruppe');
    expect(out.organisation).toBeUndefined();
    expect(out.teams).toEqual([]);
  });

  it('puts line teams at the top without a group and shows the first one', () => {
    const r = setupLine(emptyWorkspace(today), { teams: ['Backend', 'Data'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [out, show] = r.value;
    expect(out.lineUnits!.map((u) => [u.name, u.parentId])).toEqual([
      ['Backend', undefined],
      ['Data', undefined],
    ]);
    expect(show).toBe(out.lineUnits![0]!.id);
  });

  it('needs at least one line team', () => {
    expect(setupLine(emptyWorkspace(today), { group: 'Engineering', teams: [''] }).ok).toBe(false);
  });
});
