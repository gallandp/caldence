# Excel export of the structure — design

Issue: see the linked user story. Idea from a real tester, approved for hands-off delivery by the
product owner on 2026-11-18.

## Intent

People design their organisation in Caldence (areas or platforms, teams or products, people with
roles and hours, meetings). They want to take that structure into Excel to filter it, build pivot
tables, merge it with HR or budget lists, or hand it to someone who does not use Caldence.

## Goals

- One click in Import / Export saves one `.xlsx` workbook of the whole file.
- The workbook opens in Excel, LibreOffice Calc, Numbers and Google Sheets without a warning.
- Sheets are flat tables (one header row, frozen, with filter buttons) so a pivot table works at once.
- Column headers follow the app language and the configured level names (e.g. "Plattform",
  "Produkt").

## Non-goals

- No import from Excel.
- No styling beyond a bold header, no charts, no formulas.
- No per-week load figures (the app shows those; the export is about structure).

## Anti-goals

- No server, no network call: the file is built in the browser (static-only rule).
- No heavy dependency: a spreadsheet library would add hundreds of kB to a small PWA.
- Cell text must never turn into a formula (CSV injection): text goes in as inline strings.

## Approaches

1. **Own minimal SpreadsheetML writer on the existing `zip.ts`** (chosen). An `.xlsx` is a ZIP of a
   few XML files; Caldence already writes stored ZIPs for the calendar export. About 150 lines, no
   dependency, no licence question.
2. **A library (SheetJS, ExcelJS, write-excel-file).** More features, but 100–900 kB, and SheetJS's
   current builds are no longer on npm. Not worth it for three plain tables.
3. **CSV.** Smallest, but one table per file, encoding and delimiter trouble in German Excel, and
   formula injection. Rejected.

## Design

`src/core/xlsx.ts` turns sheets (`{ name, columns, rows }`, cells are string, number or empty)
into the bytes of a workbook: content types, relationships, workbook, a style sheet with a bold
header, one worksheet per sheet with a frozen first row, an autofilter and column widths from the
longest value. Strings are inline strings, XML-escaped, with characters XML forbids removed; sheet
names are cut to 31 characters and stripped of `[]:*?/\`.

`src/core/structureSheets.ts` builds the three sheets from a workspace and a translate function:

| Sheet | One row per | Columns |
|---|---|---|
| Structure | person in a unit (unit without people: one empty row) | upper level, lower level, person, roles, hours per week |
| Units (named after the level names) | area and team | upper level, name, level, cadence, cadence weeks, cadence start, people, meetings |
| Meetings | meeting | upper level, lower level, meeting, category, repeats, start, duration (min), preparation (min), participants |

Area members have an empty lower-level cell. A person with two roles in one unit is one row with
both roles, so the hours sum correctly. Hours follow the app: a team member without own hours has
the file's weekly hours; an area member without own hours has 0.

The Import / Export view gets a third section, "Export as Excel", with one sentence on what the
workbook holds and a button "Export Excel file (.xlsx)…". The outcome is announced in the existing
status line. File name: `caldence-<structure word>.xlsx`.

Help (Files and autosave) and the README mention the export.

## Left to the builder

Exact wording, column widths, and sort order (the file's own order is kept).
