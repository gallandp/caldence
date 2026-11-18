import { describe, expect, it } from 'vitest';
import { emptyWorkspace, type CalEvent, type Workspace } from '../../src/core/model';
import { structureSheets } from '../../src/core/structureSheets';
import { columnName, sheetNames, xlsx } from '../../src/core/xlsx';
import { t as translate } from '../../src/i18n';
import { levelParams, levelWords } from '../../src/i18n/levels';

/** The files of a stored ZIP, by name, as text. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const out = new Map<string, string>();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = dec.decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const start = at + 30 + nameLength;
    out.set(name, dec.decode(bytes.subarray(start, start + size)));
    at = start + size;
  }
  return out;
}

describe('xlsx writer', () => {
  it('names columns like Excel', () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual([
      'A',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });

  it('makes sheet names Excel accepts', () => {
    expect(sheetNames(['A/B: [x]?', '', 'Termine', 'termine', 'x'.repeat(40)])).toEqual([
      'A B   x',
      'Sheet2',
      'Termine',
      'termine (2)',
      'x'.repeat(31),
    ]);
  });

  it('writes a workbook with a bold frozen header, filters and inline text', () => {
    const files = unzip(
      xlsx(
        [
          {
            name: 'People',
            columns: ['Name', 'Hours'],
            rows: [
              ['=1+1 & <b>', 40],
              ['Bob\u0007', null],
            ],
          },
        ],
        new Date(2026, 10, 18),
      ),
    );
    expect([...files.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    const sheet = files.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<autoFilter ref="A1:B3"/>');
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Name</t>');
    // A leading "=" stays text; markup is escaped; control characters are dropped.
    expect(sheet).toContain('<t xml:space="preserve">=1+1 &amp; &lt;b&gt;</t>');
    expect(sheet).not.toContain('<f>');
    expect(sheet).toContain('<c r="B2"><v>40</v></c>');
    expect(sheet).toContain('<t xml:space="preserve">Bob</t>');
    expect(files.get('xl/workbook.xml')).toContain(
      '<sheet name="People" sheetId="1" r:id="rId1"/>',
    );
    expect(files.get('xl/workbook.xml')).toContain("'People'!$A$1:$B$3");
  });
});

function plan(): Workspace {
  const ws = emptyWorkspace('2026-11-02');
  ws.settings.hoursPerWeek = 40;
  ws.roles = [
    { id: 'po', name: 'Product Owner', colour: '#000000' },
    { id: 'dev', name: 'Developer', colour: '#000000' },
    { id: 'head', name: 'Head', colour: '#000000' },
  ];
  ws.people = [
    { id: 'ana', name: 'Ana' },
    { id: 'ben', name: 'Ben' },
    { id: 'cem', name: 'Cem' },
  ];
  ws.categories = [{ id: 'c1', name: 'Scrum', colour: '#000000' }];
  const team = (id: string, name: string) => ({
    id,
    name,
    cadence: { kind: 'sprint' as const, lengthWeeks: 2, start: '2026-11-02' },
    members: [] as { personId: string; roleId: string }[],
    memberHours: {} as Record<string, number>,
    assumptions: {},
    cycles: [],
    events: [] as CalEvent[],
  });
  const alpha = team('alpha', 'Alpha');
  alpha.members = [
    { personId: 'ana', roleId: 'po' },
    { personId: 'ana', roleId: 'dev' },
    { personId: 'ben', roleId: 'dev' },
  ];
  alpha.memberHours = { ben: 20 };
  alpha.events = [
    {
      id: 'e1',
      name: 'Daily',
      categoryId: 'c1',
      rule: { type: 'weekdays', weekdays: [1, 2, 3, 4, 5] },
      time: '09:00',
      duration: 15,
      participants: [
        { roleId: 'dev', share: 1 },
        { personId: 'cem', share: 0.5 },
      ],
      preparation: 0,
    },
  ];
  ws.teams = [alpha, team('beta', 'Beta'), team('solo', 'Solo')];
  ws.areas = [
    {
      id: 'pay',
      name: 'Payments',
      teamIds: ['alpha', 'beta'],
      members: [{ personId: 'cem', roleId: 'head' }],
      memberHours: {},
      cycles: [],
      events: [
        {
          id: 'e2',
          name: 'PO sync',
          categoryId: 'c1',
          rule: { type: 'weekly', weekday: 3 },
          time: '14:00',
          duration: 60,
          participants: [{ roleId: 'po', share: 1, fromTeams: true }],
          preparation: 0.1,
        },
      ],
    },
  ];
  return ws;
}

function sheetsOf(ws: Workspace, locale: 'de' | 'en' = 'en') {
  const defaults = levelParams(levelWords(ws.settings.levelNames, locale));
  return structureSheets(ws, {
    t: (key, params) => translate(locale, key, params, defaults),
    repeats: (e) => e.rule.type,
    percent: (share) => `${share * 100}%`,
  });
}

describe('structure sheets', () => {
  it('lists people per unit with roles and hours, areas before their teams', () => {
    const [structure] = sheetsOf(plan());
    expect(structure!.name).toBe('Structure');
    expect(structure!.columns).toEqual(['Area', 'Team', 'Person', 'Roles', 'Hours per week']);
    expect(structure!.rows).toEqual([
      ['Payments', null, 'Cem', 'Head', 0],
      ['Payments', 'Alpha', 'Ana', 'Product Owner, Developer', 40],
      ['Payments', 'Alpha', 'Ben', 'Developer', 20],
      ['Payments', 'Beta', null, null, null],
      [null, 'Solo', null, null, null],
    ]);
  });

  it('lists the units with cadence, people and meetings', () => {
    const [, units] = sheetsOf(plan());
    expect(units!.name).toBe('Areas and teams');
    expect(units!.rows).toEqual([
      [null, 'Payments', 'Area', null, null, null, 1, 1],
      ['Payments', 'Alpha', 'Team', 'Sprint', 2, '2026-11-02', 2, 1],
      ['Payments', 'Beta', 'Team', 'Sprint', 2, '2026-11-02', 0, 0],
      [null, 'Solo', 'Team', 'Sprint', 2, '2026-11-02', 0, 0],
    ]);
  });

  it('lists the meetings with their participants', () => {
    const [, , meetings] = sheetsOf(plan());
    expect(meetings!.rows).toEqual([
      [
        'Payments',
        null,
        'PO sync',
        'Scrum',
        'weekly',
        '14:00',
        60,
        10,
        'Product Owner · every team',
      ],
      ['Payments', 'Alpha', 'Daily', 'Scrum', 'weekdays', '09:00', 15, 0, 'Developer, Cem (50%)'],
    ]);
  });

  it('uses the level names in German', () => {
    const ws = plan();
    ws.settings.levelNames = { preset: 'platform' };
    const [structure, units, meetings] = sheetsOf(ws, 'de');
    expect(structure!.columns.slice(0, 2)).toEqual(['Plattform', 'Produkt']);
    expect(units!.name).toBe('Plattformen und Produkte');
    expect(units!.rows[1]![2]).toBe('Produkt');
    expect(meetings!.name).toBe('Termine');
  });

  it('opens an empty file without rows', () => {
    const sheets = sheetsOf(emptyWorkspace('2026-11-02'));
    expect(sheets.map((s) => s.rows.length)).toEqual([0, 0, 0]);
  });
});
