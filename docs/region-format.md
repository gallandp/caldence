# Region file format

A region file is a JSON document describing public holidays and school holidays for one region. Bundled regions live in `src/data/regions/` and are imported at build time (no network access). The code is in `src/core/regions.ts` (`validateRegion` checks the shape).

```json
{
  "id": "de-sn",
  "name": { "de": "Sachsen", "en": "Saxony" },
  "holidays": [
    { "type": "fixed", "month": 1, "day": 1, "name": { "de": "Neujahr", "en": "New Year's Day" } },
    { "type": "easter", "offset": -2, "name": { "de": "Karfreitag", "en": "Good Friday" } },
    { "type": "special", "id": "repentance-day", "name": { "de": "Buß- und Bettag", "en": "Day of Repentance and Prayer" } }
  ],
  "schoolHolidays": [
    { "name": { "de": "Herbstferien", "en": "Autumn break" }, "from": "2026-10-12", "to": "2026-10-24" }
  ],
  "schoolHolidaysKnownUntil": "2028-09-01"
}
```

## Fields

- `id`: non-empty string.
- `name`, and every rule/holiday `name`: object with non-empty `de` and `en` strings.
- `holidays`: yearly public-holiday rules, one of:
  - `{ "type": "fixed", "month": 1-12, "day": 1-31, "name": ... }` (must be a real calendar day)
  - `{ "type": "easter", "offset": integer, "name": ... }` (days relative to Easter Sunday)
  - `{ "type": "special", "id": "repentance-day", "name": ... }` (Buß- und Bettag: the last Wednesday strictly before 23 November)
- `schoolHolidays`: inclusive `from`..`to` ISO dates (`to` not before `from`).
- `schoolHolidaysKnownUntil`: last date for which school holidays are published. `holidayIndex` reports `beyondKnown: true` when a requested range ends after it, so the UI can warn that school holidays are incomplete.

Validation errors use the keys `error.required`, `error.type`, `error.date.invalid`, `error.enum.invalid` and `error.number.invalid`.

## Importing a region file

In **Workspace settings**, next to the region select, **Import region file…** opens a `.json` region file. The file is read on this device only; nothing is uploaded or fetched.

- A valid file is added to the workspace and selected in one step, so one undo (Ctrl+Z) removes it again and restores the previous region.
- The imported region is stored in the workspace file itself (`customRegions`, schema 3). Whoever opens the workspace file gets the region with it; nothing else needs to be shared.
- Imported regions show the suffix "(imported)" in the select. An imported region that is not selected can be removed with **Remove imported region …**; the selected region cannot be removed (`error.region.inUse`).
- An imported region must not use the id of a built-in region (`error.region.builtin`), and two imported regions must not share an id (`error.region.duplicate`). Built-in regions always win when ids are looked up (`resolveRegion` in `regions.ts`).
- A file that is not JSON shows `error.file.json`; a file that is not a valid region shows the first validation error. In both cases the workspace is unchanged.
- A workspace whose `settings.region` names no built-in or imported region still opens, like one with an unknown time zone. It then uses no holidays; Settings lists the raw id in the select and says that the region is unknown, so you can choose another one or import its region file.

Templates never contain regions: a template with `customRegions` is refused.

## Coverage warning

When the planning horizon ends after `schoolHolidaysKnownUntil` of the selected region, Settings (below the horizon) and the Weeks view say that school holidays are known only until that date. Public holidays are computed from rules and need no such warning.

## Saxony (`de-sn`) sources

Public holidays follow the Saxon holiday law (Sächsisches Feiertagsgesetz).

School holidays (school years 2026/27 and 2027/28) come from the Sächsisches Staatsministerium für Kultus: https://www.schule.sachsen.de/ferien-in-sachsen-4119.html

**To be verified against the official source.** The school-holiday values in `de-sn.json` were entered without online verification. They must be re-checked against the source above before each release.
