import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/valid-workspace.json';
import type { Workspace } from '../../src/core/model';
import { validate } from '../../src/core/validate';
import { assign } from '../../src/core/line';
import { crc32 } from '../../src/core/zip';
import { xlsx } from '../../src/core/xlsx';
import { readXlsx } from '../../src/core/xlsxRead';
import {
  parseCsv,
  parseFte,
  reviewStaff,
  staffTable,
  staffTemplateCsv,
  staffTemplateSheets,
  type Choice,
  type TemplateText,
} from '../../src/core/staffImport';

const names = { family: (unit: string) => `Skills ${unit}` };
const HEAD = ['Name', 'Linienteam', 'Vertrag FTE', 'Skills', 'Fachgruppe', 'Gesellschaft'];

/** The fixture with an Orvalis line: group Handel with team Orvalis Ware, Atlas in it. */
function lined(): Workspace {
  const w = structuredClone(fixture) as unknown as Workspace;
  w.roles.push({ id: 'dev', name: 'Developer', colour: '#123456' });
  w.skillFamilies = [{ id: 'f1', name: 'Orvalis' }];
  w.skills = [{ id: 's1', name: 'Orvalis Lager', familyId: 'f1' }];
  w.companies = [{ id: 'co1', name: 'Velmora AG' }];
  w.lineUnits = [
    { id: 'g1', name: 'Fachgruppe Handel', skillFamilyId: 'f1' },
    { id: 'l1', name: 'Orvalis Ware', parentId: 'g1' },
  ];
  w.people.push({
    id: 'p2',
    name: 'Atlas Ware',
    lineUnitId: 'l1',
    contractFte: 0.8,
    skillIds: ['s1'],
    companyId: 'co1',
  });
  w.teams[0]!.demands = [{ id: 'd1', skillId: 's1', fte: 0.5, roleId: 'dev' }];
  return w;
}

const run = (
  ws: Workspace,
  rows: (string | number | null)[][],
  choices: Record<number, Choice> = {},
) => reviewStaff(ws, staffTable([HEAD, ...rows]), choices, names);

const keys = (w: unknown): string[] => {
  const r = validate(w);
  return r.ok ? [] : r.errors.map((e) => `${e.path} ${e.key}`);
};

describe('CSV', () => {
  it('reads ; with decimal comma, quotes and a byte order mark', () => {
    expect(parseCsv('\uFEFFName;FTE\r\n"Hartwig; Lina";0,8\r\n"Say ""hi""";1\n')).toEqual([
      ['Name', 'FTE'],
      ['Hartwig; Lina', '0,8'],
      ['Say "hi"', '1'],
    ]);
  });

  it('reads , with a quoted decimal comma and line breaks in quotes', () => {
    expect(parseCsv('Name,FTE,Skills\nLina,"0,8","A\nB"')).toEqual([
      ['Name', 'FTE', 'Skills'],
      ['Lina', '0,8', 'A\nB'],
    ]);
  });

  it('reads tabs', () => {
    expect(parseCsv('Name\tFTE\nLina\t1')).toEqual([
      ['Name', 'FTE'],
      ['Lina', '1'],
    ]);
  });

  it('parses FTE numbers', () => {
    expect([0.8, '0,8', '0.5', ' 1 ', '80 %', 'x', '', null, '1,2,3'].map(parseFte)).toEqual([
      0.8,
      0.8,
      0.5,
      1,
      0.8,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe('template table', () => {
  it('accepts German and English headers and the file’s own level names', () => {
    const t = staffTable(
      [['name', 'Line Team', 'Contract FTE', 'skills', 'Specialist group', 'Company']],
      {},
    );
    expect(t.missing).toEqual([]);
    const own = staffTable([['Name', 'Squad', 'Vertrag FTE', 'Skills', 'Gilde']], {
      team: ['Squad'],
      group: ['Gilde'],
    });
    expect(own).toMatchObject({ missing: [], ignored: [] });
  });

  it('names missing required columns', () => {
    expect(staffTable([['Name', 'Skills']]).missing).toEqual(['team', 'fte']);
    expect(staffTable([]).missing).toEqual(['name', 'team', 'fte', 'skills']);
  });

  it('lists unknown columns and never reads their values', () => {
    const t = staffTable([
      ['Personalnummer', ...HEAD, 'Geburtsdatum', ''],
      ['4711', 'Lina Hartwig', 'Orvalis Ware', '1', 'A; a; B', '', '', '1990-01-01', 'secret'],
    ]);
    expect(t.ignored).toEqual(['Personalnummer', 'Geburtsdatum', '#9']);
    expect(t.rows).toEqual([
      {
        line: 2,
        name: 'Lina Hartwig',
        team: 'Orvalis Ware',
        fteText: '1',
        fte: 1,
        skills: ['A', 'B'],
        group: '',
        company: '',
      },
    ]);
    expect(JSON.stringify(t.rows)).not.toMatch(/4711|1990|secret/);
  });

  it('skips empty rows and starts at the first non-empty row', () => {
    const t = staffTable([[], [null, ''], HEAD, ['', '', '', ''], ['Lina', 'X', 1, '']]);
    expect(t.rows.map((r) => r.line)).toEqual([5]);
  });
});

describe('staff import', () => {
  it('creates people, skills, companies and line teams under a group', () => {
    const ws = lined();
    const r = run(ws, [
      ['Lina Hartwig', 'Orvalis Ware', 1, 'Orvalis Lager; Orvalis Skript', '', 'Velmora AG'],
      ['Ronja Pfeil', 'Netze', '0,5', 'Netzbau', 'Fachgruppe Technik', 'Velmora Digital GmbH'],
      ['Mehmet Sander', 'Orvalis Geld', 0.8, 'Orvalis Konten', 'Fachgruppe Handel', 'Velmora AG'],
    ]);
    expect(r.counts).toMatchObject({ new: 3, error: 0, choose: 0 });
    expect(r.created).toEqual({
      skills: ['Orvalis Skript', 'Netzbau', 'Orvalis Konten'],
      companies: ['Velmora Digital GmbH'],
      units: ['Fachgruppe Technik', 'Netze', 'Orvalis Geld'],
    });
    expect(keys(r.ws)).toEqual([]);
    const ronja = r.ws.people.find((p) => p.name === 'Ronja Pfeil')!;
    const netze = r.ws.lineUnits!.find((u) => u.id === ronja.lineUnitId)!;
    const technik = r.ws.lineUnits!.find((u) => u.id === netze.parentId)!;
    expect(technik.name).toBe('Fachgruppe Technik');
    // A group without a family gets one of its own; Handel keeps Orvalis.
    const fam = r.ws.skillFamilies!.find((f) => f.id === technik.skillFamilyId)!;
    expect(fam.name).toBe('Skills Fachgruppe Technik');
    const konten = r.ws.skills!.find((s) => s.name === 'Orvalis Konten')!;
    expect(konten.familyId).toBe('f1');
    expect(ronja.contractFte).toBe(0.5);
    // The input stays as it was.
    expect(ws).toEqual(lined());
  });

  it('errors: missing name, unknown or ambiguous team without group, bad FTE', () => {
    const ws = lined();
    ws.lineUnits!.push({ id: 'g2', name: 'Fachgruppe Technik' });
    ws.lineUnits!.push({ id: 'l2', name: 'Orvalis Ware', parentId: 'g2' });
    const r = run(ws, [
      ['', 'Orvalis Ware', 1, ''],
      ['Tilo Brand', 'Orvalis Kasse', 1, 'Orvalis Konten'],
      ['Ben Hoffmann', 'Orvalis Ware', 1, ''],
      ['Lina Hartwig', 'Orvalis Ware', 1.5, '', 'Fachgruppe Handel'],
      ['Ina Roth', 'Orvalis Ware', '0,05', '', 'Fachgruppe Handel'],
    ]);
    expect(r.rows.map((x) => x.error)).toEqual([
      'name',
      'teamUnknown',
      'teamAmbiguous',
      'fte',
      'fte',
    ]);
    expect(r.ws).toEqual(ws);
    expect(r.created).toEqual({ skills: [], companies: [], units: [] });
  });

  it('a repeated import updates contract and skills and keeps assignments', () => {
    let ws = lined();
    const staffed = assign(ws, {
      personId: 'p2',
      teamId: ws.teams[0]!.id,
      demandId: 'd1',
      fte: 0.5,
    });
    if (!staffed.ok) throw new Error('assign');
    ws = staffed.value[0];
    const row = ['Atlas Ware', 'Orvalis Ware', 0.8, 'Orvalis Lager', '', 'Velmora AG'];
    expect(run(ws, [row]).counts).toMatchObject({ unchanged: 1 });
    const r = run(ws, [['atlas  ware', 'Orvalis Ware', 1, 'Orvalis Lager; Neu', '', 'velmora ag']]);
    expect(r.counts).toMatchObject({ updated: 1, new: 0 });
    const atlas = r.ws.people.find((p) => p.id === 'p2')!;
    expect(atlas.contractFte).toBe(1);
    expect(atlas.skillIds).toHaveLength(2);
    expect(atlas.name).toBe('Atlas Ware');
    expect(r.ws.assignments).toEqual(ws.assignments);
    expect(r.ws.teams).toEqual(ws.teams);
    expect(keys(r.ws)).toEqual([]);
  });

  it('matches by company + name: the same name in another company is another person', () => {
    const ws = lined();
    const r = run(ws, [['Atlas Ware', 'Orvalis Ware', 1, '', '', 'Velmora Digital GmbH']]);
    expect(r.counts).toMatchObject({ new: 1 });
    expect(r.ws.people.filter((p) => p.name === 'Atlas Ware')).toHaveLength(2);
  });

  it('never removes people of another company', () => {
    const ws = lined();
    const r = run(ws, [['Lina Hartwig', 'Orvalis Ware', 1, '', '', 'Velmora Digital GmbH']]);
    expect(r.ws.people.map((p) => p.id)).toEqual([...ws.people.map((p) => p.id), 'p3']);
  });

  it('two rows with the same company + name wait for a choice; nothing is merged', () => {
    const ws = lined();
    const rows = [
      ['Atlas Ware', 'Orvalis Ware', 1, '', '', 'Velmora AG'],
      ['Atlas Ware', 'Orvalis Ware', 0.5, '', '', 'Velmora AG'],
    ];
    const open = run(ws, rows);
    expect(open.counts).toMatchObject({ choose: 2 });
    expect(open.rows[0]!.candidates.map((p) => p.id)).toEqual(['p2']);
    expect(open.ws).toEqual(ws);
    const picked = run(ws, rows, {
      2: { kind: 'person', personId: 'p2' },
      3: { kind: 'new' },
    });
    expect(picked.counts).toMatchObject({ updated: 1, new: 1 });
    expect(picked.ws.people.filter((p) => p.name === 'Atlas Ware')).toHaveLength(2);
    const twice = run(ws, rows, {
      2: { kind: 'person', personId: 'p2' },
      3: { kind: 'person', personId: 'p2' },
    });
    expect(twice.rows[1]!.error).toBe('taken');
    expect(run(ws, rows, { 2: { kind: 'skip' }, 3: { kind: 'skip' } }).counts).toMatchObject({
      skipped: 2,
    });
  });

  it('two people with the same company + name in the file wait for a choice', () => {
    const ws = lined();
    ws.people.push({ id: 'p9', name: 'Atlas Ware', companyId: 'co1', lineUnitId: 'l1' });
    const row = ['Atlas Ware', 'Orvalis Ware', 1, '', '', 'Velmora AG'];
    expect(run(ws, [row]).rows[0]).toMatchObject({ status: 'choose' });
    const r = run(ws, [row], { 2: { kind: 'person', personId: 'p9' } });
    expect(r.rows[0]).toMatchObject({ status: 'unchanged', personId: 'p9' });
  });

  it('refuses an import beyond the file limits', () => {
    const ws = lined();
    const rows = Array.from({ length: 21 }, (_, i) => [
      'P',
      'Orvalis Ware',
      1,
      '',
      '',
      `Firma ${i}`,
    ]);
    expect(run(ws, rows).limits).toEqual(['companies']);
  });

  it('a group name only matches groups, and must be unique', () => {
    const ws = lined();
    // "Tief" is a line team (no sub-units), so it is not taken as the group: a new group is made.
    ws.lineUnits!.push({ id: 'l3', name: 'Tief', parentId: 'g1' });
    const r = run(ws, [['Lina', 'Neu', 1, '', 'Tief']]);
    const lina = r.ws.people.find((p) => p.name === 'Lina')!;
    const team = r.ws.lineUnits!.find((u) => u.id === lina.lineUnitId)!;
    expect(r.ws.lineUnits!.find((u) => u.id === team.parentId)).toMatchObject({ name: 'Tief' });
    expect(team.parentId).not.toBe('l3');
    ws.lineUnits!.push({ id: 'g2', name: 'Fachgruppe Handel' });
    expect(run(ws, [['Lina', 'Neu', 1, '', 'Fachgruppe Handel']]).rows[0]!.error).toBe(
      'groupAmbiguous',
    );
  });

  it('the same name without company on one side waits for a choice', () => {
    const ws = lined();
    ws.people.push({ id: 'p7', name: 'Ina Roth', lineUnitId: 'l1' });
    // Earlier import without company, now with one.
    const r = run(ws, [['Ina Roth', 'Orvalis Ware', 1, '', '', 'Velmora AG']]);
    expect(r.rows[0]).toMatchObject({ status: 'choose' });
    expect(r.rows[0]!.candidates.map((p) => p.id)).toEqual(['p7']);
    const picked = run(ws, [['Ina Roth', 'Orvalis Ware', 1, '', '', 'Velmora AG']], {
      2: { kind: 'person', personId: 'p7' },
    });
    expect(picked.rows[0]).toMatchObject({ status: 'updated' });
    expect(picked.ws.people.find((p) => p.id === 'p7')!.companyId).toBe('co1');
    // A file per company that leaves the column out.
    expect(run(ws, [['Atlas Ware', 'Orvalis Ware', 0.8, 'Orvalis Lager']]).rows[0]).toMatchObject({
      status: 'choose',
    });
  });

  it('new skills share one family per top unit, also when the name exists', () => {
    const ws = lined();
    ws.skillFamilies!.push({ id: 'f2', name: 'Skills Technik' });
    const r = run(ws, [
      ['A', 'Netze', 1, 'Netzbau', 'Technik'],
      ['B', 'Funk', 1, 'Funkplanung', 'Technik'],
    ]);
    expect(keys(r.ws)).toEqual([]);
    expect(r.ws.skills!.filter((s) => s.familyId === 'f2').map((s) => s.name)).toEqual([
      'Netzbau',
      'Funkplanung',
    ]);
  });

  it('a too long company is a row error', () => {
    const r = run(lined(), [['A', 'Orvalis Ware', 1, '', '', 'x'.repeat(201)]]);
    expect(r.rows[0]!.error).toBe('company');
  });

  it('stops reading CSV after the row limit', () => {
    expect(parseCsv('a\nb\nc\nd', 2)).toEqual([['a'], ['b']]);
  });

  it('a file without line data stays without empty lists', () => {
    const ws = structuredClone(fixture) as unknown as Workspace;
    const r = run(ws, [['Lina', 'X', 1, '']]);
    expect(r.ws.lineUnits).toBeUndefined();
    expect(r.ws.skills).toBeUndefined();
    expect(r.ws).toEqual(ws);
  });
});

/** A zip whose parts are deflated, as Excel writes them. */
function deflatedZip(files: Record<string, string>): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = enc.encode(name);
    const raw = enc.encode(text);
    const data = deflateRawSync(raw);
    const local = new Uint8Array(30 + n.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(14, crc32(raw), true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, n.length, true);
    local.set(n, 30);
    const c = new Uint8Array(46 + n.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc32(raw), true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, offset, true);
    c.set(n, 46);
    parts.push(local, data);
    central.push(c);
    offset += local.length + data.length;
  }
  const dirSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, dirSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe('xlsx reader', () => {
  it('reads back the workbook our writer makes (inline strings, stored)', async () => {
    const bytes = xlsx(
      [
        { name: 'Andere', columns: ['X'], rows: [['nein']] },
        {
          name: 'Personal',
          columns: HEAD,
          rows: [['Lina & Co <1>', 'Netze', 0.8, 'A; B', null, '']],
        },
      ],
      new Date(2026, 0, 1),
    );
    const read = await readXlsx(bytes, ['Personal'], 100);
    expect(read?.rows[0]).toEqual(HEAD);
    expect(read?.rows[1]?.slice(0, 4)).toEqual(['Lina & Co <1>', 'Netze', 0.8, 'A; B']);
    expect((await readXlsx(bytes, ['Staff'], 100))?.rows).toEqual([['X'], ['nein']]);
  });

  it('reads a deflated workbook with shared strings, gaps and rich text', async () => {
    const bytes = deflatedZip({
      'xl/workbook.xml':
        '<workbook xmlns:r="r"><sheets><sheet name="Tabelle1" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId1" Type="ws" Target="/xl/worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml':
        '<sst><si><t>Name</t></si><si><r><t>Lin</t></r><r><t xml:space="preserve">a H&amp;</t></r><rPh><t>x</t></rPh></si><si><t>Zeile_x000D_2</t></si></sst>',
      'xl/worksheets/sheet1.xml':
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>2</v></c></row>' +
        '<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3"><v>0.75</v></c><c r="C3" t="str"><f>A1</f><v>x</v></c><c r="D3" s="1"/></row></sheetData></worksheet>',
    });
    const read = await readXlsx(bytes, [], 100);
    expect(read).toEqual({
      rows: [['Name', null, 'Zeile\r2'], [], ['Lina H&', 0.75, 'x', null]],
      tooMany: false,
    });
    expect((await readXlsx(bytes, [], 2))?.tooMany).toBe(true);
  });

  it('reads self-closing shared strings without shifting the rest', async () => {
    const bytes = deflatedZip({
      'xl/workbook.xml': '<workbook><sheets><sheet name="S" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst><si/><si><t>a</t></si><si><t>b</t></si></sst>',
      'xl/worksheets/sheet1.xml':
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>1</v></c><c r="B1" t="s"><v>2</v></c></row></sheetData></worksheet>',
    });
    expect((await readXlsx(bytes, [], 10))?.rows).toEqual([['a', 'b']]);
  });

  it('stays fast on a hostile sheet of unclosed tags', async () => {
    const bytes = deflatedZip({
      'xl/workbook.xml': '<workbook><sheets><sheet name="S" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst>' + '<si>'.repeat(200_000),
      'xl/worksheets/sheet1.xml': '<row r="1"><c><v>'.repeat(200_000),
    });
    const start = performance.now();
    expect((await readXlsx(bytes, [], 10))?.rows).toEqual([]);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('returns null for bytes that are not a workbook', async () => {
    expect(await readXlsx(new TextEncoder().encode('Name;FTE'), [], 10)).toBeNull();
  });
});

describe('template', () => {
  const t: TemplateText = {
    headers: {
      name: 'Name',
      team: 'Linienteam',
      fte: 'Vertrag FTE',
      skills: 'Skills',
      group: 'Fachgruppe',
      company: 'Gesellschaft',
    },
    sheet: 'Personal',
    exampleSheet: 'Beispiel',
  };

  it('has an empty staff sheet and an example the import reads', () => {
    const [staff, example] = staffTemplateSheets(t);
    expect(staff).toMatchObject({ name: 'Personal', columns: HEAD, rows: [] });
    const table = staffTable([example!.columns, ...example!.rows]);
    expect(table.missing).toEqual([]);
    const r = reviewStaff(lined(), table, {}, names);
    expect(r.counts).toMatchObject({ new: 3, error: 0 });
    expect(keys(r.ws)).toEqual([]);
  });

  it('CSV template is the header line', () => {
    expect(staffTemplateCsv(t, ';')).toBe(HEAD.join(';') + '\r\n');
    expect(staffTable(parseCsv(staffTemplateCsv(t, ','))).missing).toEqual([]);
  });
});
