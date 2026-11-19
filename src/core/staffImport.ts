import type { Cell, Sheet } from './xlsx';
import type { LineUnit, Person, Workspace } from './model';
import { LIMITS } from './limits';

/**
 * Staff import for the line organisation (#330): people with line team, contract FTE, skills and,
 * optionally, specialist group and company, from a spreadsheet template (.xlsx or .csv). Everything
 * happens in the browser. Only the template's columns are read; any other column (personnel
 * number, birth date …) is listed as not taken and never reaches the workspace.
 *
 * People are matched by company + name. When that is not unique (two rows, or two people in the
 * file, with the same company + name) the user picks; nothing is merged silently. An import never
 * removes anyone and never touches team memberships, so assignments to products stay.
 */

export type Column = 'name' | 'team' | 'fte' | 'skills' | 'group' | 'company';
export const REQUIRED: Column[] = ['name', 'team', 'fte', 'skills'];
export const COLUMNS: Column[] = [...REQUIRED, 'group', 'company'];

/** Accepted header names (compared after `headerKey`), German and English. */
const ALIASES: Record<Column, string[]> = {
  name: ['name', 'person', 'mitarbeiter', 'mitarbeiterin', 'employee'],
  team: ['linienteam', 'line team', 'lineteam', 'team'],
  fte: ['vertrag fte', 'contract fte', 'fte', 'vertrag', 'contract'],
  skills: ['skills', 'skill', 'fähigkeiten', 'kompetenzen'],
  group: ['fachgruppe', 'specialist group', 'gruppe', 'group'],
  company: ['gesellschaft', 'company', 'firma', 'unternehmen'],
};

const headerKey = (s: string): string =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[_\-.:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Text of a cell with whitespace collapsed; numbers as written. */
const text = (c: Cell | undefined): string =>
  c === null || c === undefined ? '' : String(c).normalize('NFC').replace(/\s+/g, ' ').trim();

/** Comparison key of a name: case and spacing do not matter. */
export const nameKey = (s: string): string => text(s).toLowerCase();

// ---------- CSV ----------

/**
 * Rows of a CSV file. The separator is guessed from the header line: `;` (Excel in German), `,`
 * or tab. Quotes follow RFC 4180. A byte order mark is dropped. Reading stops after `maxRows` rows.
 */
export function parseCsv(input: string, maxRows = Infinity): string[][] {
  const s = input.replace(/^\uFEFF/, '');
  const firstLine = s.slice(0, s.search(/\r?\n|$/));
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const sep = [';', ',', '\t'].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ';');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (rows.length >= maxRows) return rows;
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------- table ----------

export interface StaffRow {
  /** Row number in the spreadsheet, counting the header row as 1. */
  line: number;
  name: string;
  team: string;
  /** The FTE cell as written, for the preview. */
  fteText: string;
  fte: number | null;
  skills: string[];
  group: string;
  company: string;
}

export interface StaffTable {
  rows: StaffRow[];
  /** Headers of columns the template does not know; their values are never read. */
  ignored: string[];
  /** Required columns that are missing. */
  missing: Column[];
}

/** FTE from a cell: 0.8, "0,8", "0.8" or "80 %"; null when it is not a number. */
export function parseFte(c: Cell | undefined): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null;
  const s = text(c).replace(/\s/g, '');
  const m = /^(\d+(?:[.,]\d+)?)(%?)$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]!.replace(',', '.'));
  return m[2] ? n / 100 : n;
}

/**
 * Reads the rows under the first non-empty row (the header). `extra` adds header names, e.g. the
 * file's own names for the line levels.
 */
export function staffTable(
  cells: Cell[][],
  extra: Partial<Record<Column, string[]>> = {},
): StaffTable {
  const headerAt = cells.findIndex((r) => r.some((c) => text(c) !== ''));
  if (headerAt < 0) return { rows: [], ignored: [], missing: [...REQUIRED] };
  const header = cells[headerAt]!;
  const lookup = new Map<string, Column>();
  for (const col of COLUMNS)
    for (const alias of [...ALIASES[col], ...(extra[col] ?? [])])
      if (!lookup.has(headerKey(alias))) lookup.set(headerKey(alias), col);
  const at: Partial<Record<Column, number>> = {};
  const ignored: string[] = [];
  header.forEach((h, i) => {
    const label = text(h);
    const col = lookup.get(headerKey(label));
    if (col !== undefined && at[col] === undefined) at[col] = i;
    else if (label !== '') ignored.push(label);
  });
  // A column without header but with values is not read either; name it by its letter position.
  let width = header.length;
  for (const r of cells) width = Math.max(width, r.length);
  for (let i = header.length; i < width; i++)
    if (cells.slice(headerAt + 1).some((r) => text(r[i]) !== '')) ignored.push(`#${i + 1}`);
  for (let i = 0; i < header.length; i++)
    if (text(header[i]) === '' && cells.slice(headerAt + 1).some((r) => text(r[i]) !== ''))
      ignored.push(`#${i + 1}`);
  const missing = REQUIRED.filter((c) => at[c] === undefined);
  const get = (r: Cell[], col: Column): Cell | undefined =>
    at[col] === undefined ? undefined : r[at[col]];
  const rows: StaffRow[] = [];
  cells.forEach((r, i) => {
    if (i <= headerAt) return;
    if (!COLUMNS.some((col) => text(get(r, col)) !== '')) return;
    const seen = new Set<string>();
    const skills = text(get(r, 'skills'))
      .split(/[;\n]/)
      .map(text)
      .filter((s) => s !== '' && !seen.has(nameKey(s)) && seen.add(nameKey(s)));
    rows.push({
      line: i + 1,
      name: text(get(r, 'name')),
      team: text(get(r, 'team')),
      fteText: text(get(r, 'fte')),
      fte: parseFte(get(r, 'fte')),
      skills,
      group: text(get(r, 'group')),
      company: text(get(r, 'company')),
    });
  });
  return { rows, ignored, missing };
}

// ---------- review and import ----------

/** What the user picked for a row whose company + name is not unique. */
export type Choice = { kind: 'person'; personId: string } | { kind: 'new' } | { kind: 'skip' };

export type RowError =
  | 'name'
  | 'nameLong'
  | 'team'
  | 'teamUnknown'
  | 'teamAmbiguous'
  | 'groupAmbiguous'
  | 'company'
  | 'tooDeep'
  | 'fte'
  | 'tooManySkills'
  | 'taken';

export type Note =
  | { key: 'newSkill'; name: string }
  | { key: 'newTeam'; name: string }
  | { key: 'newGroup'; name: string }
  | { key: 'newCompany'; name: string }
  | { key: 'moved'; name: string }
  | { key: 'company'; name: string }
  | { key: 'fte'; from: number }
  | { key: 'skills' };

export interface RowResult {
  row: StaffRow;
  status: 'new' | 'unchanged' | 'updated' | 'error' | 'choose' | 'skipped';
  error?: RowError;
  notes: Note[];
  /** People in the file with the same company + name, when the user has to pick. */
  candidates: Person[];
  /** Key of the group of rows/people that share company + name (only when the user picks). */
  conflict?: string;
  personId?: string;
}

export interface StaffReview {
  rows: RowResult[];
  /** The workspace with the import done; only rows with a result new/updated changed it. */
  ws: Workspace;
  counts: Record<'new' | 'unchanged' | 'updated' | 'error' | 'choose' | 'skipped', number>;
  created: { skills: string[]; companies: string[]; units: string[] };
  /** Limits of the file the import would exceed; the import is refused then. */
  limits: ('people' | 'skills' | 'skillFamilies' | 'companies' | 'lineUnits')[];
}

export interface ImportNames {
  /** Name of a skill family made for new skills when the line unit has none. */
  family: (unitName: string) => string;
}

/** `prefix + n`, counting up from the highest number in use, so 500 new ids stay cheap. */
function idMaker(prefix: string, taken: { id: string }[]): () => string {
  const set = new Set(taken.map((x) => x.id));
  let n = 0;
  return () => {
    do n++;
    while (set.has(prefix + n));
    set.add(prefix + n);
    return prefix + n;
  };
}

const sameSet = (a: string[] = [], b: string[] = []): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

/**
 * Runs the import on a copy of `ws` and reports each row's result. With the current choices this is
 * both the preview and the import: the caller applies `ws` when the user confirms. Rows with an
 * error, a pending choice or "skip" do not change anything.
 */
export function reviewStaff(
  ws: Workspace,
  table: StaffTable,
  choices: Record<number, Choice>,
  names: ImportNames,
): StaffReview {
  const out = structuredClone(ws);
  out.lineUnits ??= [];
  out.skills ??= [];
  out.skillFamilies ??= [];
  out.companies ??= [];
  const created = { skills: [] as string[], companies: [] as string[], units: [] as string[] };
  const newPerson = idMaker('p', out.people);
  const newUnit = idMaker('lu', out.lineUnits);
  const newSkill = idMaker('sk', out.skills);
  const newFamily = idMaker('sf', out.skillFamilies);
  const newCompany = idMaker('co', out.companies);

  const units = out.lineUnits;
  const unitById = new Map(units.map((u) => [u.id, u] as const));
  const depth = (u: LineUnit): number => {
    let d = 1;
    for (
      let p = u.parentId;
      p !== undefined && d <= LIMITS.lineLevels;
      p = unitById.get(p)?.parentId
    )
      d++;
    return d;
  };
  const top = (u: LineUnit): LineUnit => {
    let at = u;
    for (let i = 0; at.parentId !== undefined && i < LIMITS.lineLevels; i++)
      at = unitById.get(at.parentId) ?? at;
    return at;
  };
  // A specialist group is a unit with sub-units or at the top; a team of the same name is not one.
  const parents = new Set(units.flatMap((u) => (u.parentId === undefined ? [] : [u.parentId])));
  const groupsByName = (name: string): LineUnit[] =>
    units.filter(
      (u) =>
        nameKey(u.name) === nameKey(name) &&
        // A unit chosen as line team takes no units below it (#399).
        u.kind !== 'team' &&
        (u.parentId === undefined || parents.has(u.id)),
    );
  const familiesByName = new Map(out.skillFamilies.map((f) => [nameKey(f.name), f] as const));
  /** Units of that name; `parentId` null means anywhere in the tree. */
  const byName = (name: string, parentId: string | null): LineUnit[] =>
    units.filter(
      (u) => nameKey(u.name) === nameKey(name) && (parentId === null || u.parentId === parentId),
    );
  const skillsByName = new Map(out.skills.map((s) => [nameKey(s.name), s] as const));
  const companiesByName = new Map(out.companies.map((c) => [nameKey(c.name), c] as const));

  // People in the file by company + name, and rows by the same key.
  const companyKeyOf = (companyId: string | undefined): string =>
    companyId === undefined
      ? ''
      : nameKey(out.companies!.find((c) => c.id === companyId)?.name ?? companyId);
  const peopleByKey = new Map<string, Person[]>();
  const peopleByName = new Map<string, Person[]>();
  for (const p of out.people) {
    const k = `${companyKeyOf(p.companyId)}\u0000${nameKey(p.name)}`;
    peopleByKey.set(k, [...(peopleByKey.get(k) ?? []), p]);
    peopleByName.set(nameKey(p.name), [...(peopleByName.get(nameKey(p.name)) ?? []), p]);
  }
  const rowKey = (r: StaffRow) => `${nameKey(r.company)}\u0000${nameKey(r.name)}`;
  const rowsByKey = new Map<string, number>();
  for (const r of table.rows)
    if (r.name !== '') rowsByKey.set(rowKey(r), (rowsByKey.get(rowKey(r)) ?? 0) + 1);

  const claimed = new Set<string>();
  const results: RowResult[] = [];

  for (const row of table.rows) {
    const res: RowResult = { row, status: 'error', notes: [], candidates: [] };
    results.push(res);
    const error = (e: RowError) => {
      res.status = 'error';
      res.error = e;
    };
    if (row.name === '') {
      error('name');
      continue;
    }
    if (row.name.length > LIMITS.textChars) {
      error('nameLong');
      continue;
    }
    if (
      row.team === '' ||
      row.team.length > LIMITS.textChars ||
      row.group.length > LIMITS.textChars
    ) {
      error('team');
      continue;
    }
    if (row.fte === null || row.fte < 0.1 || row.fte > 1) {
      error('fte');
      continue;
    }
    if (row.company.length > LIMITS.textChars) {
      error('company');
      continue;
    }
    if (row.skills.length > LIMITS.skills || row.skills.some((s) => s.length > LIMITS.textChars)) {
      error('tooManySkills');
      continue;
    }

    // Who the row is.
    const key = rowKey(row);
    const exact = peopleByKey.get(key) ?? [];
    // Without a company on one side, the same name may be the same person (say, a first import
    // without the company column, or one file per company that leaves it out): the user decides.
    // Two different companies mean two people.
    const candidates =
      exact.length > 0
        ? exact
        : (peopleByName.get(nameKey(row.name)) ?? []).filter(
            (p) => row.company === '' || p.companyId === undefined,
          );
    let target: Person | null = null;
    if (candidates.length === 0 && (rowsByKey.get(key) ?? 0) <= 1) {
      target = null;
    } else if (exact.length === 1 && (rowsByKey.get(key) ?? 0) <= 1) {
      target = exact[0]!;
    } else {
      res.candidates = candidates;
      res.conflict = key;
      const choice = choices[row.line];
      if (!choice) {
        res.status = 'choose';
        continue;
      }
      if (choice.kind === 'skip') {
        res.status = 'skipped';
        continue;
      }
      if (choice.kind === 'person') {
        target = candidates.find((p) => p.id === choice.personId) ?? null;
        if (!target) {
          res.status = 'choose';
          continue;
        }
      }
    }
    if (target && claimed.has(target.id)) {
      error('taken');
      continue;
    }

    // The line unit: the team under the given group, or the one team of that name.
    let unit: LineUnit | undefined;
    if (row.group !== '') {
      const groups = groupsByName(row.group);
      if (groups.length > 1) {
        error('groupAmbiguous');
        continue;
      }
      let group = groups[0];
      unit = group ? byName(row.team, group.id)[0] : undefined;
      if (!unit && group && depth(group) >= LIMITS.lineLevels) {
        error('tooDeep');
        continue;
      }
      if (!unit) {
        if (!group) {
          group = { id: newUnit(), name: row.group };
          units.push(group);
          unitById.set(group.id, group);
          created.units.push(group.name);
          res.notes.push({ key: 'newGroup', name: group.name });
        }
        unit = { id: newUnit(), name: row.team, parentId: group.id };
        parents.add(group.id);
        units.push(unit);
        unitById.set(unit.id, unit);
        created.units.push(unit.name);
        res.notes.push({ key: 'newTeam', name: unit.name });
      }
    } else {
      const found = byName(row.team, null);
      if (found.length === 0) {
        error('teamUnknown');
        continue;
      }
      if (found.length > 1) {
        error('teamAmbiguous');
        continue;
      }
      unit = found[0]!;
    }

    // Company, skills.
    let companyId: string | undefined;
    if (row.company !== '') {
      let company = companiesByName.get(nameKey(row.company));
      if (!company) {
        company = { id: newCompany(), name: row.company };
        out.companies.push(company);
        companiesByName.set(nameKey(company.name), company);
        created.companies.push(company.name);
        res.notes.push({ key: 'newCompany', name: company.name });
      }
      companyId = company.id;
    }
    const skillIds = row.skills.map((name) => {
      const known = skillsByName.get(nameKey(name));
      if (known) return known.id;
      // A new skill joins the family of the line unit (or of a unit above it); without one, the
      // top unit gets a family of its own name.
      let familyId: string | undefined;
      for (
        let u: LineUnit | undefined = unit;
        u && !familyId;
        u = u.parentId ? unitById.get(u.parentId) : undefined
      )
        familyId = u.skillFamilyId;
      if (!familyId) {
        const root = top(unit!);
        const familyName = names.family(root.name);
        let family = familiesByName.get(nameKey(familyName));
        if (!family) {
          family = { id: newFamily(), name: familyName };
          out.skillFamilies!.push(family);
          familiesByName.set(nameKey(familyName), family);
        }
        familyId = family.id;
        root.skillFamilyId = familyId;
      }
      const skill = { id: newSkill(), name, familyId };
      out.skills!.push(skill);
      skillsByName.set(nameKey(name), skill);
      created.skills.push(name);
      res.notes.push({ key: 'newSkill', name });
      return skill.id;
    });

    if (!target) {
      const p: Person = {
        id: newPerson(),
        name: row.name,
        lineUnitId: unit.id,
        contractFte: row.fte,
      };
      if (skillIds.length > 0) p.skillIds = skillIds;
      if (companyId !== undefined) p.companyId = companyId;
      out.people.push(p);
      claimed.add(p.id);
      res.status = 'new';
      res.personId = p.id;
      continue;
    }
    claimed.add(target.id);
    res.personId = target.id;
    let changed = false;
    // A row without company keeps the person's company; a row with one sets it.
    if (companyId !== undefined && target.companyId !== companyId) {
      res.notes.push({ key: 'company', name: row.company });
      target.companyId = companyId;
      changed = true;
    }
    if (target.lineUnitId !== unit.id) {
      res.notes.push({ key: 'moved', name: unit.name });
      target.lineUnitId = unit.id;
      changed = true;
    }
    if ((target.contractFte ?? 1) !== row.fte) {
      res.notes.push({ key: 'fte', from: target.contractFte ?? 1 });
      target.contractFte = row.fte;
      changed = true;
    }
    if (!sameSet(target.skillIds, skillIds)) {
      res.notes.push({ key: 'skills' });
      if (skillIds.length > 0) target.skillIds = skillIds;
      else delete target.skillIds;
      changed = true;
    }
    res.status = changed ? 'updated' : 'unchanged';
  }

  const counts = { new: 0, unchanged: 0, updated: 0, error: 0, choose: 0, skipped: 0 };
  for (const r of results) counts[r.status]++;
  const limits: StaffReview['limits'] = [];
  if (out.people.length > LIMITS.people) limits.push('people');
  if (out.skills.length > LIMITS.skills) limits.push('skills');
  if (out.skillFamilies.length > LIMITS.skillFamilies) limits.push('skillFamilies');
  if (out.companies.length > LIMITS.companies) limits.push('companies');
  if (out.lineUnits.length > LIMITS.lineUnits) limits.push('lineUnits');
  // Keep the file as it was where nothing was added.
  if (ws.lineUnits === undefined && out.lineUnits.length === 0) delete out.lineUnits;
  if (ws.skills === undefined && out.skills.length === 0) delete out.skills;
  if (ws.skillFamilies === undefined && out.skillFamilies.length === 0) delete out.skillFamilies;
  if (ws.companies === undefined && out.companies.length === 0) delete out.companies;
  return { rows: results, ws: out, counts, created, limits };
}

// ---------- template ----------

export interface TemplateText {
  /** Header names in the UI language, by column. */
  headers: Record<Column, string>;
  sheet: string;
  exampleSheet: string;
}

/** Invented example rows for the template's example sheet. */
const EXAMPLE: [string, string, number, string, string, string][] = [
  [
    'Lina Hartwig',
    'Orvalis Ware',
    1,
    'Orvalis Lager; Orvalis Skript',
    'Fachgruppe Handel',
    'Velmora AG',
  ],
  ['Mehmet Sander', 'Orvalis Geld', 0.8, 'Orvalis Konten', 'Fachgruppe Handel', 'Velmora AG'],
  [
    'Ronja Pfeil',
    'Netze',
    0.5,
    'Netzbau; Funkplanung',
    'Fachgruppe Technik',
    'Velmora Digital GmbH',
  ],
];

/** The template workbook: an empty staff sheet and an example sheet with invented people. */
export function staffTemplateSheets(t: TemplateText): Sheet[] {
  const columns = COLUMNS.map((c) => t.headers[c]);
  return [
    { name: t.sheet, columns, rows: [] },
    { name: t.exampleSheet, columns, rows: EXAMPLE.map((r) => [...r]) },
  ];
}

/** The template as CSV: just the header, with `;` (German Excel) or `,`. */
export function staffTemplateCsv(t: TemplateText, sep: ';' | ','): string {
  return COLUMNS.map((c) => t.headers[c]).join(sep) + '\r\n';
}
