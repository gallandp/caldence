# Caldence – Design Specification

Date: 2026-11-07 · Status: draft for review

## 1. Purpose

Caldence helps agile roles (Product Owner, Scrum Master, team leads, any role a team defines) plan their **recurring meetings and duties**, see the **weekly time load per person and role**, and transfer the result to **Outlook or any calendar app** via iCalendar (.ics).

It is free and open source (AGPL-3.0-or-later) and should be as easy to use as draw.io: open it in the browser, install it as an app, or host it on any web server.

### Success criteria

- A new user picks a template (Scrum, Kanban, SAFe), adjusts roles, people and meetings, and exports an .ics file in under 15 minutes without reading the manual.
- Everything works offline; no data leaves the device unless the user saves or exports a file.
- Every view meets WCAG 2.2 AA and is fully usable with the keyboard.
- The UI is available in German and English.
- `dist/` can be copied to any static web server (Apache, nginx, IIS, GitHub Pages) without configuration.

### Non-goals (for 1.0)

- No server, accounts, sync or multi-user editing.
- No two-way Outlook sync. Export as a one-way file; updating already imported events comes later.
- No print view, desktop app or holiday generator yet (see §12).

## 2. Origin

Caldence is a clean rebuild inspired by a private prototype. It inherits concepts only (recurrence rules, load calculation, .ics export, holiday calculation, file handling), not code or data. No organisation-specific content (for example quarterly business review cycles) is part of this repository; such content can live in a private template file.

## 3. Architecture

A static single-page app built from TypeScript.

| Layer | Content | Rules |
| --- | --- | --- |
| `src/core/` | Pure TypeScript domain logic: dates, recurrence, holidays, load calculation, schema and migrations, .ics export and import | No DOM, no framework, 100 % unit tested |
| `src/data/` | Built-in templates and region files (JSON) | Validated against the schema in tests |
| `src/ui/` | Svelte 5 components and views | Talks to core through a small store API |
| `src/i18n/` | Message catalogues `de.json`, `en.json` | No user-visible string outside a catalogue |

Tooling: Vite (build), Svelte 5, TypeScript strict, Vitest (unit), Playwright with axe-core (end-to-end and accessibility), ESLint and Prettier, `vite-plugin-pwa` (service worker and manifest). Dates are handled as plain `YYYY-MM-DD` strings and minutes, as in the prototype; display formatting uses `Intl`.

The build output uses relative paths only, so it runs from any sub-folder of a web server. Opening `index.html` directly from disk is not a goal, because service workers and ES modules require HTTP; a release ZIP ships with a short guide for local hosting.

## 4. Data model

One **workspace file** (`*.caldence.json`) holds everything a user works on. It carries a `schemaVersion`; core migrates older files on load.

```text
Workspace
├─ settings        locale, region, timezone, workdays, default hours per week, planning horizon
├─ roles[]         id, name, colour            (e.g. Product Owner, Scrum Master)
├─ people[]        id, name, hours per week
├─ categories[]    id, name, colour            (meeting categories, ordered)
└─ teams[]
   ├─ id, name, templateId (origin, informational)
   ├─ cadence      kind: sprint | flow | pi; length in weeks; first start date; weekday
   ├─ members[]    personId, roleId
   ├─ assumptions  team-specific numbers used by scaling rules (e.g. number of stakeholders)
   ├─ cycles[]     named recurring phases with milestones (generic form of PI or quarter planning)
   └─ events[]     id, name, categoryId, rule, time, duration, scaling, participants[], preparation
```

- **rule**: `weekly`, `every-n-weeks`, `monthly-nth-weekday`, `cadence-day` (day n of each sprint or PI), `cycle-milestone` (relative to a cycle date), `once`.
- **participants**: list of `{ roleId, share }`; share is 0–1 (alternating attendance = 0.5).
- **scaling**: optional `base + perUnit × assumption`, rounded to a grid.
- **Settings vs. assumptions**: settings belong to the workspace and the user; assumptions belong to a team. The UI shows them in separate places.

Multiple teams per file solve the "one team per file" limit of the prototype. A person who is a member of several teams gets one combined load view.

## 5. Templates

A template is a workspace file without `people` and `members`. Caldence ships Scrum, Kanban and SAFe. Users can import their own template file (for example an organisation template) and export any team as a template.

Applying a template **copies** its roles, categories, cadence, cycles and events into a new team. After that everything is freely editable; there is no live link to the template.

## 6. Regions (holidays and school holidays)

Holidays are region data files in `src/data/regions/`, e.g. `de-sn.json` for Saxony:

- public holidays as rules: fixed date, offset from Easter Sunday, or a named special rule (Repentance Day = Wednesday before 23 November);
- school holidays as dated periods with a "known until" date, so the app can warn beyond it.

1.0 ships Saxony only. The format is documented so further regions can be added by contributors or imported by users; a generator comes later.

## 7. Calculation

Same logic as the prototype, generalised to roles:

- hours per week per event = occurrences per week × effective duration × (1 + preparation) ÷ 60 × share of the role;
- events falling on a public holiday are skipped (configurable); school holidays are shown, not skipped;
- results per role, per person (summed over teams), per category, as hours, percent and FTE.

## 8. Views

Workspace bar (file name, unsaved indicator, team switcher, person/role filter) and these views:

1. **Calendar** – month and week view with load per day and week.
2. **Weeks** – one row per week with cadence, milestones, holidays and hours per role.
3. **Load** – base load per category and role, FTE, warnings above thresholds.
4. **Meetings** – event editor with categories (create, rename, reorder, colour, delete with replacement).
5. **Team** – members and roles, cadence, cycles, assumptions.
6. **Workspace settings** – language, region, timezone, workdays, roles, people.
7. **Templates** – apply, import, export.
8. **Import / Export** – .ics export and import.
9. **Help** – built-in manual.

## 9. Files, storage and exchange

- **Autosave** of the open workspace to IndexedDB.
- **Open / Save / Save as** with the File System Access API where available, download/upload fallback elsewhere; unsaved-changes prompts as native `<dialog>`.
- **.ics export** for a person, role or team: recurring events with RRULE and EXDATE, TZID from settings, categories, optional reminder, stable UIDs (prepares later updates).
- **.ics import**: read an .ics file exported from Outlook (or any calendar), detect recurring series, show a review list where the user chooses which entries become events and maps them to category, team and roles.

## 10. Quality

- **Accessibility**: WCAG 2.2 AA as definition of done for every view: semantic HTML, focus order, visible focus, labelled controls, colour contrast checked for user-chosen colours, no information by colour only, reduced motion. axe runs on every view in CI.
- **i18n**: German and English from the first view; locale from settings or browser.
- **Privacy**: no telemetry, no external requests at runtime.
- **Tests**: unit tests for core (recurrence, holidays, load, migrations, .ics round trip); end-to-end tests for the main flows.

## 11. Delivery

- GitHub Actions: lint, type check, unit tests, build, Playwright with axe on every PR.
- Versioning Major.Minor.Hotfix, bumped automatically on merge via labels `release:major`, `release:minor`, `release:hotfix`, `release:none`; CHANGELOG with an "Unreleased" section.
- Each release publishes a ZIP of `dist/`. The official site is **caldence.de** on plain webspace: static files only, no server-side logic (no PHP, database or API).
- Installable as PWA from the browser; deployment guide for Apache, nginx and IIS.
- `CONTRIBUTING.md`, code of conduct, issue templates.

## 12. Later

Export as update of already imported events · print and PDF view · holiday generator and more regions · desktop app (e.g. Tauri) · more languages.

## 13. Roadmap

| Phase | Content |
| --- | --- |
| 1 Foundation | Project setup and CI, data model and migrations, core recurrence and calculation, region Saxony, i18n and accessibility baseline |
| 2 Core app | Roles and people, teams, settings vs. assumptions, meetings editor, calendar, weeks and load views, files and autosave |
| 3 Exchange | Templates (Scrum, Kanban, SAFe, import/export), .ics export, .ics import |
| 4 Release 1.0 | PWA and web server deployment, release ZIP, manual, accessibility audit |
