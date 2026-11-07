# Region file format

A region file is a JSON document describing public holidays and school holidays for one region. Bundled regions live in `src/data/regions/` and are imported at build time (no network access). The code is in `src/core/regions.ts` (`validateRegion` checks the shape).

```json
{
  "id": "de-sn",
  "name": { "de": "Sachsen", "en": "Saxony" },
  "holidays": [ ...rules... ],
  "schoolHolidays": [ { "name": { "de": "...", "en": "..." }, "from": "2026-10-12", "to": "2026-10-24" } ],
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

## Saxony (`de-sn`) sources

Public holidays follow the Saxon holiday law (Sächsisches Feiertagsgesetz).

School holidays (school years 2026/27 and 2027/28) come from the Sächsisches Staatsministerium für Kultus: https://www.schule.sachsen.de/ferien-in-sachsen-4119.html

**To be verified against the official source.** The school-holiday values in `de-sn.json` were entered without online verification. They must be re-checked against the source above before each release.
