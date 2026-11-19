import type { Cell } from './xlsx';

/**
 * A minimal Excel workbook (.xlsx) reader for imports: one sheet as rows of plain values (text or
 * number). Unzips with the browser's own `DecompressionStream`, so there is no dependency. Formulas
 * count with their cached value; styles, dates and formats are ignored. Files are untrusted: the
 * unpacked size is capped, so a small zip cannot unpack into gigabytes.
 */

/** Largest unpacked part of a workbook we read; a sheet of 1000 people is far below 1 MB. */
const MAX_PART = 8 * 1024 * 1024;

interface Entry {
  method: number;
  size: number;
  offset: number;
}

/** The zip's directory by file name, or null when the bytes are not a zip. */
function entries(bytes: Uint8Array): Map<string, Entry> | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-directory record sits in the last 22 + 65535 bytes (its comment is at most 64 KB).
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) return null;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, Entry>();
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) return null;
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    out.set(dec.decode(bytes.subarray(at + 46, at + 46 + nameLength)), {
      method: view.getUint16(at + 10, true),
      size: view.getUint32(at + 20, true),
      offset: view.getUint32(at + 42, true),
    });
    at += 46 + nameLength + extra + comment;
  }
  return out;
}

async function inflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const reader = new Blob([data])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
    .getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_PART) {
      await reader.cancel();
      throw new Error('too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

async function part(
  bytes: Uint8Array<ArrayBuffer>,
  dir: Map<string, Entry>,
  name: string,
): Promise<string | null> {
  const e = dir.get(name);
  if (!e) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (e.offset + 30 > bytes.length || view.getUint32(e.offset, true) !== 0x04034b50) return null;
  const start =
    e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true);
  const raw = bytes.subarray(start, start + e.size);
  if (e.method === 0) return raw.length > MAX_PART ? null : new TextDecoder().decode(raw);
  if (e.method !== 8) return null;
  return new TextDecoder().decode(await inflate(raw));
}

/** Text of XML character data: entities and Excel's `_xHHHH_` escapes decoded. */
export function xmlText(raw: string): string {
  return raw
    .replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(lt|gt|amp|quot|apos));/g, (_, dec, hex, name) => {
      if (dec || hex) {
        const code = dec ? Number(dec) : parseInt(hex, 16);
        return code <= 0x10ffff ? String.fromCodePoint(code) : '';
      }
      return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[name as string]!;
    })
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

const attr = (attrs: string, name: string): string | undefined =>
  new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1];

/**
 * The elements `<tag …>body</tag>` or `<tag …/>` in `xml`, in order, by a forward scan with
 * `indexOf`: linear in the length, so a hostile file cannot make it slow (a lazy regex would rescan
 * to the end from every unclosed tag). Same-name nesting does not occur in the parts we read. An
 * unclosed element ends the scan.
 */
export function* elements(xml: string, tag: string): Generator<{ attrs: string; body: string }> {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let at = 0;
  for (;;) {
    const start = xml.indexOf(open, at);
    if (start < 0) return;
    const next = xml[start + open.length];
    const end = xml.indexOf('>', start);
    if (end < 0) return;
    if (
      next !== '>' &&
      next !== '/' &&
      next !== ' ' &&
      next !== '\t' &&
      next !== '\n' &&
      next !== '\r'
    ) {
      at = start + open.length;
      continue;
    }
    if (xml[end - 1] === '/') {
      yield { attrs: xml.slice(start + open.length, end - 1), body: '' };
      at = end + 1;
      continue;
    }
    const stop = xml.indexOf(close, end + 1);
    if (stop < 0) return;
    yield { attrs: xml.slice(start + open.length, end), body: xml.slice(end + 1, stop) };
    at = stop + close.length;
  }
}

const first = (xml: string, tag: string): string | undefined =>
  elements(xml, tag).next().value?.body;

/** The visible text of a string item: all `<t>` runs, without phonetic hints (`<rPh>`). */
function runs(xml: string): string {
  let visible = '';
  let at = 0;
  for (;;) {
    const start = xml.indexOf('<rPh', at);
    if (start < 0) break;
    const stop = xml.indexOf('</rPh>', start);
    visible += xml.slice(at, start);
    if (stop < 0) {
      at = xml.length;
      break;
    }
    at = stop + 6;
  }
  visible += xml.slice(at);
  let out = '';
  for (const t of elements(visible, 't')) out += xmlText(t.body);
  return out;
}

/** Column index of a cell reference: A1 → 0, AB7 → 27. */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/**
 * The rows of one sheet: the first whose name is in `prefer` (ignoring case), else the first sheet.
 * Null when the bytes are not a readable workbook. At most `maxRows` rows are returned; more come
 * back as `tooMany`.
 */
export async function readXlsx(
  bytes: Uint8Array<ArrayBuffer>,
  prefer: string[],
  maxRows: number,
): Promise<{ rows: Cell[][]; tooMany: boolean } | null> {
  const dir = entries(bytes);
  if (!dir) return null;
  const workbook = await part(bytes, dir, 'xl/workbook.xml');
  const rels = await part(bytes, dir, 'xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) return null;
  const sheets = [...workbook.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => ({
    name: xmlText(attr(m[1]!, 'name') ?? ''),
    rel: attr(m[1]!, 'r:id') ?? '',
  }));
  const wanted = prefer.map((p) => p.toLowerCase());
  const sheet = sheets.find((s) => wanted.includes(s.name.toLowerCase())) ?? sheets[0];
  if (!sheet) return null;
  const rel = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].find(
    (m) => attr(m[1]!, 'Id') === sheet.rel,
  );
  const target = rel && attr(rel[1]!, 'Target');
  if (!target) return null;
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const xml = await part(bytes, dir, path);
  if (xml === null) return null;
  const sharedXml = await part(bytes, dir, 'xl/sharedStrings.xml');
  const shared: string[] = [];
  if (sharedXml) for (const si of elements(sharedXml, 'si')) shared.push(runs(si.body));

  const rows: Cell[][] = [];
  let tooMany = false;
  for (const row of elements(xml, 'row')) {
    const r = Number(attr(row.attrs, 'r') ?? rows.length + 1) - 1;
    if (!Number.isInteger(r) || r < 0) continue;
    if (r >= maxRows) {
      tooMany = true;
      break;
    }
    const cells: Cell[] = [];
    for (const c of elements(row.body, 'c')) {
      const a = c.attrs;
      const ref = attr(a, 'r');
      const col = ref ? columnIndex(ref) : cells.length;
      if (col < 0 || col > 255) continue;
      const body = c.body;
      const type = attr(a, 't');
      const v = first(body, 'v');
      let value: Cell;
      if (type === 'inlineStr') value = runs(first(body, 'is') ?? '');
      else if (v === undefined) value = null;
      else if (type === 's') value = shared[Number(v)] ?? null;
      else if (type === 'str' || type === 'e') value = xmlText(v);
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else {
        const n = Number(v);
        value = Number.isFinite(n) ? n : xmlText(v);
      }
      while (cells.length < col) cells.push(null);
      cells[col] = value;
    }
    while (rows.length < r) rows.push([]);
    rows[r] = cells;
  }
  return { rows, tooMany };
}
