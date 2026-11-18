import { zip } from './zip';

/**
 * A minimal Excel workbook (.xlsx) writer: plain tables with a bold, frozen header row and filter
 * buttons. Text goes in as inline strings, so a value like "=1+1" stays text and never becomes a
 * formula. Built on the stored ZIP writer; no dependency.
 */

export type Cell = string | number | null;

export interface Sheet {
  name: string;
  columns: string[];
  rows: Cell[][];
}

/** Characters XML 1.0 does not allow, even escaped. */
// eslint-disable-next-line no-control-regex
const INVALID = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;

function esc(text: string): string {
  return text
    .replace(INVALID, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Column letters: 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/**
 * Sheet names as Excel accepts them: without []:*?/\, at most 31 characters, not empty, and
 * unique ignoring case.
 */
export function sheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw, i) => {
    const base =
      raw
        .replace(/[[\]:*?/\\]/g, ' ')
        .trim()
        .replace(/^'+|'+$/g, '') || `Sheet${i + 1}`;
    let name = base.slice(0, 31);
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

function cellXml(ref: string, value: Cell, style: number): string {
  const s = style ? ` s="${style}"` : '';
  if (value === null || value === '') return '';
  if (typeof value === 'number')
    return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : '';
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

function worksheet(sheet: Sheet): string {
  const all: Cell[][] = [sheet.columns, ...sheet.rows];
  const widths = sheet.columns.map((_, c) =>
    Math.min(60, Math.max(8, ...all.map((row) => String(row[c] ?? '').length + 2))),
  );
  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  const rows = all
    .map((row, r) => {
      const cells = sheet.columns
        .map((_, c) => cellXml(`${columnName(c)}${r + 1}`, row[c] ?? null, r === 0 ? 1 : 0))
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const last = `${columnName(Math.max(0, sheet.columns.length - 1))}${all.length}`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    `<cols>${cols}</cols>` +
    `<sheetData>${rows}</sheetData>` +
    `<autoFilter ref="A1:${last}"/>` +
    '</worksheet>'
  );
}

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

/** The bytes of a workbook with one worksheet per sheet, in order. */
export function xlsx(sheets: Sheet[], now: Date): Uint8Array<ArrayBuffer> {
  const names = sheetNames(sheets.map((s) => s.name));
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const types =
    head +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('') +
    '</Types>';
  const rootRels =
    head +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/>` +
    '</Relationships>';
  const workbook =
    head +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${rel}">` +
    '<sheets>' +
    names
      .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('') +
    '</sheets>' +
    // The filter buttons of each sheet need this hidden name in Excel.
    '<definedNames>' +
    sheets
      .map((s, i) => {
        const last = `$${columnName(Math.max(0, s.columns.length - 1))}$${s.rows.length + 1}`;
        const quoted = `'${esc(names[i]!.replace(/'/g, "''"))}'`;
        return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${quoted}!$A$1:${last}</definedName>`;
      })
      .join('') +
    '</definedNames>' +
    '</workbook>';
  const workbookRels =
    head +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join('') +
    `<Relationship Id="rId${sheets.length + 1}" Type="${rel}/styles" Target="styles.xml"/>` +
    '</Relationships>';
  return zip(
    [
      { name: '[Content_Types].xml', text: types },
      { name: '_rels/.rels', text: rootRels },
      { name: 'xl/workbook.xml', text: workbook },
      { name: 'xl/_rels/workbook.xml.rels', text: workbookRels },
      { name: 'xl/styles.xml', text: STYLES },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: worksheet(s) })),
    ],
    now,
  );
}
