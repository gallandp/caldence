# Phase 3 Exchange Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can start a team from a template (Scrum, Kanban, SAFe or their own file), export a team, role or person as an `.ics` file for Outlook and other calendars, and import existing meetings from an `.ics` file. This covers issues #15, #16 and #17.

**Architecture:**
- **Core logic.** Templates, the iCalendar writer and the iCalendar reader are pure functions in `src/core` (`template.ts`, `zone.ts`, `ics.ts`, `icsImport.ts`), driven by unit tests.
- **Built-in templates.** They are JSON files in `src/data/templates/`, one file per template and language, validated at import like the regions.
- **Views.** Two new views fill the existing tabs `templates` and `exchange`. All file picking goes through one shared picker in `src/ui/state/picker.ts`.
- **Schema.** Schema 2 adds a workspace id (for stable UIDs) and a `weekdays` rule (for daily meetings).

**Tech Stack:** As phase 2. One new **dev** dependency, `ical.js` `2.2.1` (MPL-2.0), used only in tests as an independent RFC 5545 parser. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-07-caldence-design.md` (§4 data model, §5 templates, §8 views 7 and 8, §9 .ics export and import, §10 quality)

## Global Constraints

All phase 1 and phase 2 constraints still apply (see `docs/superpowers/plans/2026-11-07-phase-2-core-app.md`):
- Static files only, no server-side logic, no external requests at runtime.
- `src/core` has no DOM. Dates and times cross module boundaries as `YYYY-MM-DD` and `HH:MM` strings.
- No user-visible string outside `src/i18n/*.json`. Both catalogues have identical keys.
- WCAG 2.2 AA, zero axe violations on every view in de and en. Every control has a visible label. Errors are inline with `aria-describedby` and `aria-invalid` (inputs only). Focus moves only after a successful action.
- Every workspace change goes through the store as one `apply()` call, so it is one undo step.
- Versions are never bumped by hand.

New for phase 3:
- **Wall-clock times.** A meeting at 09:00 stays at 09:00 local time in every export and import, on both sides of a DST change.
- **Privacy.** Template files never contain people, members or settings. Imported and exported files are read and written only on the device.
- **Stable UIDs.** A recurring series exports as `UID:<eventId>.<teamId>.<workspaceId>@caldence`. All-day entries use `UID:<kind>-<date>.<workspaceId>@caldence` with kind `holiday`, `school` or `milestone-<cycleId>-<milestoneId>`.
- **iCalendar output.** Lines end in CRLF and are folded at 75 octets without splitting a UTF-8 character. Text values escape `\`, `;`, `,` and newlines. `PRODID:-//Caldence//Caldence <APP_VERSION>//EN`, `VERSION:2.0`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`.
- **File names.**
  - Templates: `<slug>.caldence-template.json`.
  - Exports: `caldence-<slug>.ics`. The slug is lowercase ASCII with `-`, and falls back to `caldence` when empty.
- **Release.** The PR label is `release:minor`, so the result ships as 0.3.0.

## Review Focus

1. **A real Outlook export.** The input has Windows time zone names (`TZID:W. Europe Standard Time`) with a VTIMEZONE, UTC times, all-day items, changed single instances (`RECURRENCE-ID`), cancelled items and thousands of past single appointments.
   - Expected: the import neither crashes nor freezes.
   - Wall-clock times are kept.
   - The review list shows only recurring series and future single events.
   - The report lists everything that was left out and why.
   - Tests are in Task 6 and Task 7.
2. **A series that crosses a DST change.** An exported weekly 09:00 meeting expands to 09:00 local on 2027-03-22 and on 2027-03-29 in an independent parser (ical.js), and the VTIMEZONE has the Berlin transitions of 2027-03-28 and 2027-10-31. Tests are in Task 5.
3. **Meetings that fall on a public holiday.** They appear as `EXDATE`, so the calendar app does not show them. When `skipHolidays` is off, there is no EXDATE. Tests are in Task 5.
4. **Applying a template twice, or into a workspace that already has roles with the same names.**
   - Expected: roles and categories with the same name (ignoring case) are reused, not duplicated.
   - The new team id is unique.
   - The result passes `validate()`.
   - One undo removes the whole team again.
   - Tests are in Task 2 and Task 4.
5. **Opening the wrong file.**
   - The cases are:
     - a workspace file opened as a template;
     - a template opened as a workspace;
     - an `.ics` without any VEVENT;
     - a text file that is not iCalendar;
     - a template from a newer schema.
   - Expected: a translated error each time, and the workspace stays untouched.
   - Tests are in Tasks 2, 6, 4 and 7.

---

### Task 1: Schema 2 — workspace id and the `weekdays` rule (#15, #16, #17)

**Files:**
- Create: `src/core/id.ts`
- Modify:
  - `src/core/model.ts`, `src/core/migrate.ts`, `src/core/validate.ts`, `src/core/recurrence.ts`, `src/core/load.ts`
  - `src/data/examples/index.ts`, `src/data/examples/example.caldence.json`, `tests/fixtures/valid-workspace.json`
  - `src/ui/meetings/rules.ts`, `src/ui/components/RuleFields.svelte`
  - `src/i18n/de.json`, `src/i18n/en.json`
- Test: `tests/unit/migrate.test.ts`, `tests/unit/validate.test.ts`, `tests/unit/recurrence.test.ts`, `tests/unit/load.test.ts`, `tests/unit/meeting-rules.test.ts`, `tests/e2e/meetings.spec.ts`

**Interfaces:**
- Produces:
  - `CURRENT_SCHEMA = 2`.
  - `Workspace.id: string`, a UUID v4 string.
  - `randomId(): string` in `id.ts`: a UUID v4 built from `crypto.getRandomValues`. Do not use `crypto.randomUUID`, which needs a secure context.
  - `emptyWorkspace(today)` sets `id: randomId()`.
  - `exampleWorkspace()` returns a fresh `randomId()` on every call.
  - `MIGRATIONS[1]` adds `id: randomId()` and changes nothing else.
  - New rule `{ type: 'weekdays'; weekdays: Weekday[] }`. The list is non-empty, unique and in the range 1–7. Validation errors are `error.required` for an empty list and `error.enum.invalid` for a duplicate or out-of-range day.
  - `occurrencesPerWeek` for `weekdays` is `weekdays.length`.
  - `RULE_TYPES` gains `'weekdays'` after `'weekly'`.
  - `RuleDraft.weekdays: number[]`, defaulting to `[1,2,3,4,5]`.
- Decisions:
  - `validate` requires `id` to be a non-empty string.
  - The example file and the fixture are written in schema 2 with a fixed id.

- [ ] **Step 1: Write failing tests.**
  - **Migration.** `migrate` of a schema 1 workspace gives `schemaVersion: 2` and an `id` matching `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`. Everything else is deep-equal.
  - **Schema too new.** A schema 3 file gives `error.schema.newer`.
  - **Validation.** `validate` rejects a missing `id` (`error.required` at `id`), `weekdays: []` and `weekdays: [1,1]`.
  - **Recurrence.** A `weekdays` rule `[1,2,3,4,5]` over 2027-01-04..2027-01-10 gives 5 occurrences, Monday to Friday.
  - **Load.** `weeklyBaseLoad` of a 15-minute `weekdays` `[1..5]` event, with one role at share 1, gives 1.25 h.
  - **Rule helpers.** `toRule(ruleDraft(rule))` round-trips a `weekdays` rule.
  - **Meetings e2e.**
    - Choosing "Selected weekdays", ticking Monday and Thursday, and saving shows the meeting on Mondays and Thursdays in the calendar.
    - Unticking every day shows an inline error, and the meeting is not saved.
- [ ] **Step 2: Run** `npm test -- migrate validate recurrence load meeting-rules`. It is expected to FAIL.
- [ ] **Step 3: Implement.** Use a fieldset with a legend and one checkbox per weekday, labelled with `weekdayName`.
  - New i18n keys (de / en):
    - `rule.type.weekdays`: "Ausgewählte Wochentage" / "Selected weekdays"
    - `rule.weekdays`: "Wochentage" / "Weekdays"
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check && npm run e2e`. They are expected to PASS.
- [ ] **Step 5: Commit** `feat(core): schema 2 with workspace id and weekdays rule`.

### Task 2: Core templates and the built-in Scrum, Kanban and SAFe templates (#15)

**Files:**
- Create:
  - `src/core/template.ts`, `src/data/templates/index.ts`
  - `src/data/templates/{scrum,kanban,safe}.{de,en}.json`
  - `docs/template-format.md`
  - `tests/unit/template.test.ts`
- Modify: `src/i18n/de.json`, `src/i18n/en.json`

**Interfaces:**
- Consumes: `validate`, `Result`, `ValidationError` (validate.ts); `migrate` (migrate.ts); `newId` (edit.ts); `addDays`, `diffDays`, `weekday` (date.ts).
- Produces:
  - **Type.**
    ```ts
    interface Template {
      kind: 'caldence-template';
      schemaVersion: number;
      id: string;
      name: string;
      description: string;
      roles: Role[];
      categories: Category[];
      team: Omit<Team, 'id' | 'members' | 'templateId'>;
    }
    ```
  - **Validating.** `validateTemplate(input: unknown): Result<Template>`. It runs `migrate`, then builds a temporary workspace (`emptyWorkspace` settings, `people: []`, the one team with `members: []`), runs `validate` and maps the paths `teams.0.` to `team.`. The extra errors are:
    - `template.error.notTemplate` when `kind` is missing or `settings` is present;
    - `template.error.personal` when `people` or `team.members` is present at all.
  - **Loading.** `loadTemplate(text: string): Result<Template>`. Invalid JSON gives `error.json.invalid`, the same key as `loadWorkspace`.
  - **Applying.** `applyTemplate(ws, template, opts: { name: string; today: ISODate }): Result<[Workspace, string]>`.
    - Roles and categories whose name matches an existing one (trimmed, ignoring case) are reused. All others are added with new ids (prefixes `r` and `c`), and every reference is remapped.
    - The team gets `newId('t', …)` and `templateId: template.id`.
    - **Date shift.** `shift = diffDays(newStart, template.team.cadence.start)`. `newStart` is the first date on or after `opts.today` with the same weekday as the template's cadence start. Every date in the team moves by `shift`: the cadence start, the milestone dates, `every-n-weeks` anchors and `once` dates. The shift is a whole number of weeks, so weekdays stay the same.
    - The result is checked with `validate`.
  - **Exporting.** `teamToTemplate(ws, teamId, opts: { id: string; name: string; description: string }): Template`.
    - It contains only the roles used by the team's participants or members, and only the categories used by its events.
    - It drops members and the team id.
  - **Registry.** `BUILTIN_TEMPLATES: Record<'scrum' | 'kanban' | 'safe', Record<Locale, Template>>` and `builtinTemplate(id, locale): Template` in `src/data/templates/index.ts`. Every file is validated at import, and the import throws on invalid data.
- **Built-in content.**
  - The cadence start is `2027-01-04` (a Monday) in every file. Times are local times. Durations are in minutes.
  - The German and English files differ only in `name`, `description` and the names of roles, categories, cycles and events.
  - Event names are the common English terms in both languages; only categories, roles and descriptions are translated.

  | Template | Cadence | Roles (en) | Categories (en) | Events (rule, time, duration) |
  | --- | --- | --- | --- | --- |
  | `scrum` | sprint, 2 weeks | Product Owner, Scrum Master, Developers | Scrum events, Refinement | Sprint Planning (cadence-day 0, 09:30, 120); Daily Scrum (weekdays Mon–Fri, 09:15, 15); Backlog Refinement (weekly Wed, 14:00, 60); Sprint Review (cadence-day 11, 10:00, 60); Sprint Retrospective (cadence-day 11, 13:00, 90) |
  | `kanban` | flow, 2 weeks | Service Delivery Manager, Service Request Manager, Team | Kanban cadences | Team Kanban Meeting (weekdays Mon–Fri, 09:15, 15); Replenishment (weekly Mon, 10:00, 60); Delivery Planning (every-n-weeks 2 Thu, 14:00, 60); Service Delivery Review (every-n-weeks 2 Wed, 13:00, 60); Risk Review (monthly 3rd Tue, 14:00, 60); Operations Review (monthly 1st Thu, 10:00, 90) |
  | `safe` | pi, 10 weeks | Product Owner, Scrum Master/Team Coach, Agile Team, Product Management, Release Train Engineer | PI events, Iteration events | PI Planning day 1 and day 2 (cadence-day 0 and 1, 09:00, 480); Iteration Planning (every-n-weeks 2 Mon, 09:30, 120); Team Sync (weekdays Mon–Fri, 09:15, 15); Iteration Review (every-n-weeks 2 Fri, 10:00, 60); Iteration Retrospective (every-n-weeks 2 Fri, 13:00, 60); System Demo (every-n-weeks 2 Fri, 14:00, 60); Inspect & Adapt (cadence-day 66, 09:00, 240); PI Planning preparation (cycle-milestone "PI 1"/"Next PI Planning", offset −7, 10:00, 120). One cycle "PI 1" has the milestones Inspect & Adapt 2027-03-11 and Next PI Planning 2027-03-15. |

  - The anchor of every `every-n-weeks` rule is the cadence start.
  - Participants have share 1, except Developers / Agile Team / Team in Refinement, Replenishment and Iteration Planning, who have share 0.5.
  - `preparation` is 0.25 for planning events and 0 everywhere else.

- [ ] **Step 1: Write failing tests.**
  - **Valid content.**
    - Every built-in, in de and en, passes `validateTemplate`.
    - The de and en versions of a template are equal after removing all `name` and `description` fields.
  - **Applying.**
    - `applyTemplate(scrum)` on `emptyWorkspace('2027-02-10')` gives one team, 3 roles, 2 categories and 5 events. The cadence start is `2027-02-15`, because the next Monday after 2027-02-10 is 2027-02-15.
    - Applying Scrum twice gives two teams that share the 3 roles and 2 categories (Review Focus 4).
    - The SAFe milestone dates move by the same shift as the cadence start.
  - **Exporting.** `teamToTemplate` of the example team contains no person name: `JSON.stringify` of the result contains none of the example people's names. Applying that template again gives the same events as the original team, apart from ids.
  - **Wrong files (Review Focus 5).**
    - `loadTemplate` of the example workspace JSON gives `template.error.notTemplate`.
    - A template with `people: []` gives `template.error.personal`.
    - `schemaVersion: 99` gives `error.schema.newer`.
    - `{nope` gives `error.json.invalid`.
- [ ] **Step 2: Run** `npm test -- template`. It is expected to FAIL.
- [ ] **Step 3: Implement.** Write `docs/template-format.md` (English) with the fields, an example and the rule that templates hold no personal data.
  - New i18n keys (de / en):
    - `template.error.notTemplate`: "Das ist keine Vorlagendatei. Eine Arbeitsbereich-Datei öffnest du über „Öffnen“." / "This is not a template file. Open workspace files with Open."
    - `template.error.personal`: "Vorlagen dürfen keine Personen oder Mitglieder enthalten." / "Templates must not contain people or members."
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check`. They are expected to PASS.
- [ ] **Step 5: Commit** `feat(core): templates with built-in Scrum, Kanban and SAFe`.

### Task 3: Shared file picker and text export (#15, #16, #17)

**Files:**
- Create: `src/ui/state/picker.ts`
- Modify: `src/ui/state/files.ts`, `src/ui/WorkspaceBar.svelte`, `src/ui/Shell.svelte`
- Test: `tests/unit/files.test.ts`, `tests/e2e/files.spec.ts` (must stay green unchanged)

**Interfaces:**
- Consumes: `pickWithInput`, `isActivationError`, `browserFileEnv` (files.ts).
- Produces:
  - **Picker.** `picker.ts` exports:
    - `registerFileInput(el: HTMLInputElement): () => void`;
    - `pickFile(accept: string): Promise<File | null>`. It sets `el.accept`, then calls `pickWithInput`.
    - Shell owns the one hidden labelled `<input type="file">`, which moves out of WorkspaceBar.
  - **Text files.** `openTextFile(env, types: FilePickerType[]): Promise<{ name: string; text: string } | null>` and `exportTextFile(env, name: string, text: string, types: FilePickerType[]): Promise<string | null>` in files.ts.
    - They use the picker APIs when present, otherwise the input or a download.
    - `null` means cancelled. `AbortError` maps to `null`.
    - They never touch the workspace file handle.
  - **Type.** `FilePickerType = { description: string; accept: Record<string, string[]> }`.
    - Workspace: `{ 'application/json': ['.json'] }`.
    - Template: `{ 'application/json': ['.json'] }`.
    - iCalendar: `{ 'text/calendar': ['.ics'] }`.

- [ ] **Step 1: Write failing unit tests.**
  - `exportTextFile` with a fake `showSaveFilePicker` writes the text and returns the chosen name.
  - Without the picker API, it calls `download(name, text)`.
  - `openTextFile` returns `null` on `AbortError`.
  - After `exportTextFile`, `save()` of the workspace still writes to the workspace handle and not to the exported file.
- [ ] **Step 2: Run** `npm test -- files`. It is expected to FAIL.
- [ ] **Step 3: Implement.** WorkspaceBar uses `pickFile('.json,application/json')`.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check && npm run e2e`. They are expected to PASS, including the Firefox and WebKit file flows in CI.
- [ ] **Step 5: Commit** `refactor(ui): shared file picker and text export`.

### Task 4: Templates view (#15)

**Files:**
- Create: `src/ui/views/TemplatesView.svelte`, `tests/e2e/templates.spec.ts`
- Modify: `src/ui/Shell.svelte`, `src/ui/state/workspace.ts`, `src/i18n/de.json`, `src/i18n/en.json`, `tests/e2e/a11y.spec.ts`, `tests/unit/state.test.ts`

**Interfaces:**
- Produces: the store's `Change` type also accepts `Result<[Workspace, string]>`. On success `apply` returns `{ ok: true, value, id }`, as it does for the tuple form. A unit test pins this.
- Consumes:
  - From Task 2: `builtinTemplate`, `applyTemplate`, `loadTemplate`, `teamToTemplate`.
  - From Task 3: `openTextFile`, `exportTextFile`.
  - From the store: `workspace.apply`, `activeTeamId`.
- Decisions:
  - **Apply section.** There is one card per built-in template, showing its name, its description and an "Apply" button.
    - Apply opens a `<dialog>` with a "Team name" field, prefilled with the template name, and the buttons "Create team" and "Cancel".
    - Creating the team takes two clicks in total. It makes the new team active and shows a status message with a button "Open team", which switches to the Team view.
  - **Import section.** "Import template file…" reads a file and shows a preview: name, description, the number of roles, categories and events, and the cadence. Below the preview are the same team-name field and a "Create team" button.
    - An invalid file shows the translated error in `role="alert"`.
    - Imported templates are not stored. The file is the library.
  - **Export section.** A team select (default: active team), a "Template name" field (default: team name) and an "Export template…" button. They save `<slug>.caldence-template.json` with `id` = the slug.
  - **Empty state.** Export is disabled when there are no teams, with an explanation.

- [ ] **Step 1: Write failing e2e tests.**
  - **Scrum.** Applying Scrum on an empty workspace takes 2 clicks plus confirming the name. Afterwards the Team view shows the team "Scrum" with cadence sprint 2 weeks, and the calendar shows a Daily Scrum on the next Monday.
  - **Undo.** Ctrl+Z after applying removes the team (Review Focus 4).
  - **Import.** Importing `tests/fixtures/templates/custom.caldence-template.json`, a small valid file, shows its preview and creates a team.
  - **Wrong file.** Importing the example workspace file shows "This is not a template file…", and the workspace stays unchanged (Review Focus 5).
  - **Export.** Exporting the example team downloads `<slug>.caldence-template.json`. The JSON contains none of the people's names.
  - **Accessibility.** axe passes with the view open, and with the dialog open, in de and en.
- [ ] **Step 2: Run** `npm run e2e -- templates`. It is expected to FAIL.
- [ ] **Step 3: Implement.** Shell mounts TemplatesView only while active, inside the existing boundary.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check && npm run e2e`. They are expected to PASS.
- [ ] **Step 5: Commit** `feat(ui): templates view`.

### Task 5: Core iCalendar export (#16)

**Files:**
- Create: `src/core/zone.ts`, `src/core/ics.ts`, `tests/unit/zone.test.ts`, `tests/unit/ics-export.test.ts`
- Modify: `package.json` (devDependency `ical.js` `2.2.1`, exact), `package-lock.json`

**Interfaces:**
- Consumes: `occurrences`, `effectiveDuration` (recurrence.ts); `scopeTeams`, `Filter` (views.ts); `HolidayIndex` (regions.ts); `APP_VERSION` (`src/version.ts`).
- Produces:
  - **Zones.** In `zone.ts`:
    - `offsetMinutes(tz: string, utcMs: number): number` uses `Intl.DateTimeFormat` with `timeZone`, `hourCycle: 'h23'` and `formatToParts`.
    - `transitions(tz, fromYear, toYear): { utcMs: number; from: number; to: number }[]` probes daily at 00:00 UTC, then binary-searches each change to the minute.
    - `utcToLocal(utcMs, tz): { date: ISODate; time: Time }`.
  - **Text helpers.** In `ics.ts`:
    - `escapeText(s): string`
    - `foldLine(line): string`, which folds by UTF-8 octets
    - `vtimezone(tz, fromYear, toYear): string[]` gives one `STANDARD` or `DAYLIGHT` sub-component per transition, with `DTSTART` in the local time before the change, `TZOFFSETFROM`, `TZOFFSETTO` and `TZNAME` (the offset as `+01:00`). A zone without transitions gives one `STANDARD` with `DTSTART:19700101T000000`.
  - **Options.**
    ```ts
    interface IcsExportOptions {
      scope: Filter;
      from: ISODate;
      to: ISODate;
      reminderMinutes: number | null;
      allDay: { holidays: boolean; schoolHolidays: boolean; milestones: boolean };
      now: Date;
      locale: 'de' | 'en';
    }
    ```
  - **Export.** `exportIcs(ws, index: HolidayIndex, opts): string`. The index must cover `from..to`; the caller builds it with `workspaceIndex` on a copy whose horizon is `from..to`.
    - **Which events.** The events come from `scopeTeams(ws, scope)`. With `roleId`, only events with that role as a participant are included. With `personId`, only events with a role that the person holds in that team.
    - **Occurrences.** For each event, take its occurrences inside `from..to`, including those skipped for holidays. An event without occurrences is left out.
    - **Single events.** A `once` or `cycle-milestone` rule gives one VEVENT per occurrence, without RRULE. The UID gets a suffix `-<date>`.
    - **Recurring events.** Every other rule gives one VEVENT:
      - `DTSTART;TZID=<settings.timezone>` is the first occurrence.
      - `DTEND` is the wall-clock start plus `effectiveDuration`.
      - `RRULE` comes from the mapping below, with `COUNT` = the number of occurrences.
      - There is one `EXDATE;TZID=…` per occurrence with `skippedHoliday`.
    - **Rule mapping.**
      - `weekly`: `FREQ=WEEKLY;BYDAY=<d>`
      - `weekdays`: `FREQ=WEEKLY;BYDAY=<d,…>`
      - `every-n-weeks`: `FREQ=WEEKLY;INTERVAL=n;BYDAY=<d>`
      - `monthly-nth-weekday`: `FREQ=MONTHLY;BYDAY=<nth><d>`, with `-1` for the last one
      - `cadence-day`: `FREQ=WEEKLY;INTERVAL=<lengthWeeks>;BYDAY=<weekday of first occurrence>`
      - Every RRULE has `WKST=MO`.
    - **Other properties on every VEVENT.**
      - `SUMMARY` = the event name
      - `CATEGORIES` = the category name
      - `DESCRIPTION` = the team name and the participating role names
      - `DTSTAMP` = `opts.now` in UTC
      - `TRANSP:OPAQUE`
      - a `VALARM` (`ACTION:DISPLAY`, `TRIGGER:-PT<n>M`) when `reminderMinutes` is set
    - **All-day entries.** Holidays, school holidays and milestones in range are written with `DTSTART;VALUE=DATE` and an exclusive `DTEND` and `TRANSP:TRANSPARENT`. A school holiday is one entry for the whole period. Holiday names use `opts.locale`.
    - **VTIMEZONE.** One VTIMEZONE for `settings.timezone`, covering the years from `from` to `to`.

- [ ] **Step 1: Write failing tests.**
  - **Zones.** `transitions('Europe/Berlin', 2027, 2027)` gives exactly two transitions: 2027-03-28 01:00 UTC (+60 → +120) and 2027-10-31 01:00 UTC (+120 → +60). `transitions('Asia/Tokyo', 2027, 2027)` gives `[]`. `utcToLocal` of 2027-07-01T07:00Z in Berlin gives `2027-07-01` / `09:00`.
  - **Folding and escaping.** No unfolded line is longer than 75 octets. A summary with 40 × "ä" unfolds back to the original. `escapeText('a,b;c\\d\ne')` gives `a\,b\;c\\d\ne`.
  - **Independent parse.** Parse the export of the example workspace with `ical.js`.
    - **Rule types.** For every rule type, the ical.js expansion of each VEVENT, as local `YYYY-MM-DD HH:MM` in Europe/Berlin, equals the core `occurrences()` dates minus the skipped ones.
    - **DST (Review Focus 2).** This holds across the DST change: a weekly Monday 09:00 meeting expands to 09:00 on both 2027-03-22 and 2027-03-29.
  - **Holidays (Review Focus 3).** A weekly Friday event spanning 2027-03-26 (Good Friday in Saxony) has `EXDATE;TZID=Europe/Berlin:20270326T…`. With `skipHolidays: false` there is no EXDATE.
  - **Stable UIDs.** Two exports with different `now` have identical UIDs. Two workspaces with different `id` but equal team and event ids have different UIDs.
  - **Scope.** A role scope leaves out events without that role. A person scope over two teams contains the events of both teams.
  - **Reminder.** `reminderMinutes: 15` gives `TRIGGER:-PT15M` on every timed VEVENT and on no all-day entry.
  - **Structure.** Every line ends in `\r\n`, `BEGIN` and `END` are balanced, and every VEVENT has `UID`, `DTSTAMP` and `DTSTART`.
- [ ] **Step 2: Run** `npm test -- zone ics-export`. It is expected to FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check && npm run build`. They are expected to PASS. Check that `ical.js` does not appear in `dist/`: `grep -r "ical.js" dist` finds nothing.
- [ ] **Step 5: Commit** `feat(core): iCalendar export`.

### Task 6: Core iCalendar import (#17)

**Files:**
- Create:
  - `src/core/icsImport.ts`
  - `tests/unit/ics-import.test.ts`
  - `tests/fixtures/ics/outlook-sample.ics`, `tests/fixtures/ics/google-sample.ics`
- Modify: `src/core/edit.ts` (new `importEvents`), `src/i18n/de.json`, `src/i18n/en.json`

**Interfaces:**
- Consumes: `utcToLocal` (zone.ts); `upsertEvent`, `addItem`, `newId` (edit.ts); `validate` (validate.ts).
- Produces:
  - **Parsing.** `parseIcs(text: string): Result<IcsEvent[]>`. It unfolds lines and reads parameters. Quoted parameter values are allowed.
    - A file without `BEGIN:VCALENDAR` gives `ics.error.notIcs`.
    - A calendar without any VEVENT gives `ics.error.empty`.
    - **Type.**
      ```ts
      interface IcsEvent {
        uid: string;
        summary: string;
        categories: string[];
        allDay: boolean;
        start: { date: ISODate; time: Time | null; tzid: string | null; utc: boolean };
        durationMinutes: number | null;
        rrule: Record<string, string> | null;
        exdates: number;
        recurrenceId: boolean;
        cancelled: boolean;
      }
      ```
  - **Review list.** `reviewImport(events, ctx: { ws: Workspace; teamId: string; today: ISODate }): ImportReview`.
    - **Type.**
      ```ts
      type ImportReview = {
        candidates: ImportCandidate[];
        skipped: { summary: string; reason: SkipReason }[];
        hiddenPast: number;
      };
      type ImportCandidate = {
        key: string;
        name: string;
        rule: Rule;
        time: Time;
        duration: number;
        categoryHint: string | null;
        notes: NoteKey[];
        duplicateOf: string | null;
        selected: boolean;
      };
      ```
    - **Mapping.**
      - No RRULE gives `once`.
      - `WEEKLY` with an interval of 1 and one BYDAY gives `weekly`. With several BYDAY values it gives `weekdays`.
      - `WEEKLY` with INTERVAL n > 1 and one BYDAY gives `every-n-weeks` (`anchor` = start date).
      - `DAILY` with an interval of 1 gives `weekdays` (BYDAY, or all 7 days).
      - `MONTHLY` with `BYDAY=2WE`, or with `BYDAY=WE;BYSETPOS=2` (as Outlook writes it), gives `monthly-nth-weekday`.
      - Everything else (`YEARLY`, `BYMONTHDAY`, `INTERVAL` > 1 with several days, `DAILY;INTERVAL>1`) gives `once` at the series start, with the note `import.note.unmapped`, and `selected: false`.
    - **Notes.**
      - `import.note.ends` when UNTIL or COUNT end the series inside the horizon. Caldence repeats a rule until the horizon ends.
      - `import.note.exceptions` when EXDATEs or changed instances are dropped.
      - `import.note.zone` when the TZID is neither `settings.timezone` nor an alias in the table `{ 'W. Europe Standard Time': 'Europe/Berlin', 'Romance Standard Time': 'Europe/Paris', 'GMT Standard Time': 'Europe/London', 'Central Europe Standard Time': 'Europe/Budapest' }`.
    - **Times.**
      - A wall-clock time in its own TZID is kept as it is.
      - A UTC time is converted with `utcToLocal` into `settings.timezone`.
      - A floating time is kept.
    - **Skipped with a reason** (`SkipReason` = `allDay` | `cancelled` | `override` | `noDuration` | `ended`):
      - all-day items;
      - `STATUS:CANCELLED`;
      - VEVENTs with `RECURRENCE-ID` (only counted against their series);
      - items without a positive duration;
      - series whose last date is before `today`. With COUNT, the last date is estimated as start + (COUNT − 1) × interval periods.
    - **Past single events.** They are not listed and not reported one by one. They are only counted in `hiddenPast` (Review Focus 1).
    - **Duplicates.** `duplicateOf` is set to an existing event id when either:
      - the UID matches `<eventId>.<teamId>.<ws.id>@caldence`, with or without a `-<date>` suffix; or
      - the trimmed name (ignoring case), the rule and the time all match an event of the team.

      Duplicates start with `selected: false`.
    - **Category hint.** It is the id of the category whose name matches the first CATEGORIES value.
  - **Importing.** `importEvents(ws, teamId, items: { candidate: ImportCandidate; categoryId: string }[], opts: { roleIds: string[]; newCategoryName: string }): Result<Workspace>`.
    - Each item is added with `upsertEvent`, with participants = `roleIds` at share 1 and `preparation: 0`.
    - If the workspace has no category, one named `newCategoryName` is added first and used.
- **Fixtures.** Write them by hand to mimic real exports:
  - **Outlook.** A Windows `TZID` with a VTIMEZONE and these items:
    - weekly Tuesday 13:00;
    - bi-weekly Thursday 09:30 with one EXDATE and one RECURRENCE-ID override;
    - monthly `BYDAY=WE;BYSETPOS=2`;
    - daily on weekdays;
    - one all-day item;
    - one cancelled item;
    - one yearly series;
    - 2,000 past single appointments, generated in the test helper rather than stored in the file;
    - one future single appointment.
  - **Google.** UTC times (`…Z`) and quoted parameters.

- [ ] **Step 1: Write failing tests.**
  - **Outlook mapping.** The Outlook sample gives these candidates: `weekly` weekday 2 at 13:00; `every-n-weeks` n 2 weekday 4 at 09:30 with `import.note.exceptions`; `monthly-nth-weekday` weekday 3 nth 2; `weekdays` `[1,2,3,4,5]`; the future single event as `once`; and the yearly series as `once`, unselected, with `import.note.unmapped`.
  - **Outlook skips.** All-day, cancelled and override items are in `skipped` with their reasons. `hiddenPast` is 2000, and `reviewImport` finishes in under 500 ms (Review Focus 1).
  - **Google.** A Google event at 2027-07-01T07:00:00Z gives time `09:00` with `settings.timezone` Europe/Berlin.
  - **Round trip.** Export the example workspace with Task 5's `exportIcs` and read it back with `parseIcs` and `reviewImport`. Every recurring candidate has the same rule (`cadence-day` comes back as `every-n-weeks`), the same time and the same duration as its source. Every candidate has `duplicateOf` set to its source event.
  - **Wrong files (Review Focus 5).** `parseIcs('hello')` gives `ics.error.notIcs`. A VCALENDAR without VEVENT gives `ics.error.empty`.
  - **Importing.** `importEvents` into a workspace without categories adds the category and passes `validate`.
- [ ] **Step 2: Run** `npm test -- ics-import`. It is expected to FAIL.
- [ ] **Step 3: Implement.**
  - New i18n keys (de / en):
    - `ics.error.notIcs`: "Die Datei ist keine iCalendar-Datei (.ics)." / "The file is not an iCalendar file (.ics)."
    - `ics.error.empty`: "Die Datei enthält keine Termine." / "The file contains no events."
    - `import.note.unmapped`: "Diese Wiederholung kennt Caldence nicht; wird als einzelner Termin übernommen." / "Caldence has no matching repeat rule; imported as a single date."
    - `import.note.ends`: "Die Serie endet am {date}; Caldence wiederholt sie bis zum Ende des Planungszeitraums." / "The series ends on {date}; Caldence repeats it until the end of the planning horizon."
    - `import.note.exceptions`: "Ausnahmen der Serie ({count}) werden nicht übernommen." / "Exceptions of the series ({count}) are not imported."
    - `import.note.zone`: "Zeitzone {zone} wird als Ortszeit übernommen." / "Time zone {zone} is taken as local time."
    - `import.skip.allDay`, `import.skip.cancelled`, `import.skip.override`, `import.skip.noDuration`, `import.skip.ended`, worded in the same style.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check`. They are expected to PASS.
- [ ] **Step 5: Commit** `feat(core): iCalendar import with review and mapping`.

### Task 7: Import / Export view (#16, #17)

**Files:**
- Create: `src/ui/views/ExchangeView.svelte`, `tests/e2e/exchange.spec.ts`
- Modify: `src/ui/Shell.svelte`, `src/i18n/de.json`, `src/i18n/en.json`, `tests/e2e/a11y.spec.ts`

**Interfaces:**
- Consumes:
  - From Task 5: `exportIcs`.
  - From Task 6: `parseIcs`, `reviewImport`, `importEvents`.
  - From Task 3: `openTextFile`, `exportTextFile`.
  - From the store: `workspaceIndex`, `localToday`, `workspace.apply`, `activeTeamId`.
- Decisions:
  - **Export section.** It is a form with these fields:
    - the scope (radio buttons: team / role / person) plus a select for the chosen scope;
    - "From" and "To" dates, defaulting to the horizon. `from > to` shows an inline error;
    - a reminder select: none, 5, 10, 15 or 30 minutes; the default is none;
    - checkboxes "Public holidays", "School holidays" and "Milestones", all off by default.

    The button "Export .ics…" saves `caldence-<slug of the scope name>.ics`. A status message names the number of series and single events. A scope with no events disables the button and shows a hint.
  - **Import section.** "Choose .ics file…" reads the file, then shows:
    - a team select (default: active team) and a fieldset "Roles taking part" with one checkbox per role;
    - a table with one row per candidate. The columns are "Import" (checkbox), "Name", "Repeats" (summary text built from `rules.ts`), "Time", "Duration", "Category" (select, default `categoryHint` or the first category) and "Notes" (note texts, plus "Already in Caldence" for duplicates);
    - each row's controls are labelled with `aria-labelledby` = column header id + row name id;
    - a summary line: "{n} selected · {skipped} left out · {hiddenPast} past single events ignored", and a disclosure (`<details>`) listing every skipped item with its reason;
    - a button "Import {n} meetings", disabled at 0. It makes one `apply()` and shows a status message with "Open Meetings";
    - a parse error shows in `role="alert"` and changes nothing.

- [ ] **Step 1: Write failing e2e tests.**
  - **Export.** Exporting the example team gives a download `caldence-<team slug>.ics`. Its text has as many `BEGIN:VEVENT` as series plus single events stated in the status message.
  - **Import.** Importing `tests/fixtures/ics/outlook-sample.ics` shows 6 rows. The yearly series is unticked. The details list the all-day, cancelled and override items.
  - **Importing selected rows.** Ticking role "Product Owner" and importing adds 5 meetings to the Meetings view in one undo step: Ctrl+Z removes all 5.
  - **Round trip.** Importing the file that Caldence just exported marks every row "Already in Caldence", unticked.
  - **Wrong file (Review Focus 5).** Choosing a `.ics` that contains only `hello` shows "The file is not an iCalendar file (.ics).", and the workspace stays unchanged.
  - **Accessibility.** axe passes with the import table filled, in de and en, and at 375 px width without horizontal page scroll. The table scrolls inside its own container.
- [ ] **Step 2: Run** `npm run e2e -- exchange`. It is expected to FAIL.
- [ ] **Step 3: Implement.** Shell mounts ExchangeView only while active.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check && npm run e2e`. They are expected to PASS.
- [ ] **Step 5: Commit** `feat(ui): import and export view for .ics`.

### Task 8: Help, import guide, end-to-end flow and docs (#15, #16, #17)

**Files:**
- Create: `docs/manual-checks/ics-import.md`, `tests/e2e/exchange-flow.spec.ts`
- Modify: `src/ui/views/HelpView.svelte`, `src/i18n/de.json`, `src/i18n/en.json`, `README.md`, `CHANGELOG.md`

**Decisions:**
- **Help view.** It gains two sections.
  - "Templates" explains: apply, import, export, and that templates hold no people.
  - "Import into your calendar" has numbered steps each for classic Outlook (File → Open & Export → Import/Export → iCalendar), new Outlook and Outlook on the web (Calendar → Add calendar → Upload from file), Google Calendar (Settings → Import & export → Import) and Apple Calendar (File → Import). A note follows: importing the same file again updates nothing yet; delete the old entries first. This is because updates come later (#21).
- **Manual check.** `docs/manual-checks/ics-import.md` (English) is the manual check that #16 asks for. It is a checklist for Philipp to fill in with date and result, per calendar app:
  - the series appears with the right times on both sides of the DST change;
  - holidays are left out;
  - categories and reminders are kept;
  - an all-day holiday appears as all-day.
- **Docs.** `README.md` gets the status line "Status: phase 3 – templates and calendar exchange (.ics)". `CHANGELOG.md` gets an `## Unreleased` entry per issue.

- [ ] **Step 1: Write a failing e2e flow.** On an empty workspace:
  1. Apply Scrum.
  2. Add a person as Product Owner.
  3. Export that person as .ics.
  4. Start a new workspace (discard).
  5. Add a role "Product Owner", a category and an empty team in the Team view, then import the exported file with role Product Owner.

  Expected: the Meetings view lists Daily Scrum, Backlog Refinement, Sprint Planning, Sprint Review and Sprint Retrospective once each. The new workspace has a new id and the team has no events, so no row is marked as a duplicate. Sprint Planning appears as "every 2 weeks".
- [ ] **Step 2: Run** `npm run e2e -- exchange-flow`. It is expected to FAIL until the help keys and the flow work.
- [ ] **Step 3: Implement** the help sections, the docs, the README and the CHANGELOG. The help e2e checks that both new headings exist in de and en.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check && npm run build && npm run e2e`. They are expected to PASS.
- [ ] **Step 5: Commit** `docs: templates and calendar import guide, phase 3 flow`.
