# Phase 2 Core App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the phase 1 shell into a usable app. Users manage roles, people, teams, settings and meetings, see calendar, weeks and load views, and open, save and autosave workspace files. This covers issues #9–#14.

**Architecture:**
- **Core logic.** All editing and view calculations are pure functions in `src/core` (`edit.ts`, `views.ts`), driven by unit tests.
- **App state.** One Svelte store in `src/ui/state/workspace.ts` holds the open workspace, with undo, a dirty flag and the file name. Every UI change goes through that store as a core edit function.
- **Views.** Each view is a Svelte component in `src/ui/views/`. Small shared controls live in `src/ui/components/`.
- **Testing.** Views are covered by Playwright flows with axe.

**Tech Stack:** As phase 1: Svelte 5, TypeScript strict, Vite, Vitest, Playwright with @axe-core/playwright. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-07-caldence-design.md` (§4 data model, §7 calculation, §8 views, §9 files, §10 quality)

## Global Constraints

All phase 1 constraints still apply (`docs/superpowers/plans/2026-11-07-phase-1-foundation.md`):
- Static files only, with no server-side logic.
- Dates and times cross module boundaries only as `YYYY-MM-DD` and `HH:MM` strings.
- `src/core` has no DOM.
- No external requests at runtime.
- No user-visible string outside `src/i18n/*.json`.
- WCAG 2.2 AA, with zero axe violations on every view.
- Versions are never bumped by hand.

New for phase 2:
- **Mutation.** Every change to the workspace is a pure function `(ws, …) => Workspace` or `=> Result<Workspace>` from `src/core/edit.ts`. Components never mutate workspace objects.
- **Validity.** After every edit the workspace still passes `validate()`. Deleting something that is referenced either requires a replacement or is refused with `error.ref.inuse`.
- **Forms.**
  - Every control has a visible label.
  - An error is shown inline, linked via `aria-describedby`, with `aria-invalid="true"`.
  - Nothing relies on colour alone.
  - Everything works by keyboard alone.
- **Dialogs.** Prompts use native `<dialog>` with `showModal()`, never `window.confirm`/`alert`.
- **Preparation.** `preparation` is a fraction from 0 to 1 (0.25 = 25 %). The UI shows and edits it as a percent.
- **Layout.** Layouts work from 375 px wide (no horizontal page scroll) up to large monitors.
- **Browsers.** E2E runs in Chromium locally. CI runs the file and autosave flows in Chromium, Firefox and WebKit.
- **Release.** The PR label is `release:minor`, so the result ships as 0.2.0.

## Review Focus

1. **Deleting a role, category, person, cycle or assumption that is still used.** The user is asked for a replacement or told why it cannot be deleted. The file never ends up with dangling references. Tests are in Task 1.
2. **Opening a broken, foreign or newer-schema file.** A translated error is shown. The open workspace, its history and its dirty flag stay untouched. Tests are in Task 4.
3. **Reload or crash with unsaved changes.** Autosave restores exactly what was there, including the dirty flag and file name. If storage is unavailable (private mode, quota), the app still works and says autosave is off. Tests are in Task 4.
4. **One person in two teams with meetings at the same time.** This is shown as a conflict in the person view. Times are wall-clock times and never shift by time zone. Tests are in Task 2.
5. **Empty or odd workspaces.** These are: no teams, a team without members, a horizon that ends before the cadence starts, and a region id the app does not know. Every view renders an explanatory empty state instead of crashing. Tests are in Tasks 2, 8 and 9.

---

### Task 1: Core edit operations (#9, #10, #11, #12)

**Files:**
- Create: `src/core/edit.ts`, `tests/unit/edit.test.ts`
- Modify: `src/core/validate.ts` (cap `preparation` at 1), `tests/fixtures/valid-workspace.json` (`preparation: 15` → `0.25`), `src/i18n/de.json`, `src/i18n/en.json` (new key `error.ref.inuse`)

**Interfaces:**
- Consumes: `Workspace`, `Role`, `Person`, `Category`, `Team`, `CalEvent`, `Cycle`, `Settings` (model.ts); `Result`, `validate` (validate.ts).
- Produces:
  - `newId(prefix: string, taken: Iterable<string>): string` returns `prefix + n` for the smallest n ≥ 1 that is not taken.
  - `type ListKind = 'roles' | 'people' | 'categories'`.
  - `addItem(ws, kind, data: Omit<Role|Person|Category,'id'>): [Workspace, string]`, with id prefixes `r`, `p`, `c`.
  - `updateItem(ws, kind, id, patch): Workspace`.
  - `moveItem(ws, kind, id, delta: -1 | 1): Workspace`. Moving past either end is a no-op.
  - `removeItem(ws, kind, id, replacementId?: string): Result<Workspace>`. The rules per kind:
    - **Roles:** the replacement takes over members and participants. Duplicate members (same person and role) are merged. Duplicate participants are merged, with shares summed and capped at 1.
    - **Categories:** the replacement takes over the events.
    - **People:** memberships are dropped, or moved to the replacement if one is given.
    - **Errors:** a role or category in use without a replacement gives `error.ref.inuse` at path `<kind>.<index>`. A replacement equal to the id, or one that does not exist, gives `error.ref.unknown`.
  - `addTeam(ws, name: string, today: ISODate): [Workspace, string]`. The new team has a sprint cadence of 2 weeks starting at `mondayOf(today)`, and is otherwise empty.
  - `updateTeam(ws, teamId, patch: Partial<Pick<Team,'name'|'cadence'|'members'|'assumptions'>>): Result<Workspace>`. Removing an assumption still used by a scaling rule gives `error.ref.inuse`.
  - `duplicateTeam(ws, teamId, name): [Workspace, string]`. It is a deep copy with a new team id. Inner ids are kept, because they are scoped per team.
  - `removeTeam(ws, teamId): Workspace`.
  - `upsertCycle(ws, teamId, cycle: Cycle): Workspace`. An empty `cycle.id` creates a new id with prefix `cy`.
  - `removeCycle(ws, teamId, cycleId): Result<Workspace>`. It gives `error.ref.inuse` while an event references the cycle.
  - `upsertEvent(ws, teamId, event: CalEvent): [Workspace, string]`. An empty `event.id` creates a new id with prefix `e`.
  - `duplicateEvent(ws, teamId, eventId): [Workspace, string]`.
  - `removeEvent(ws, teamId, eventId): Workspace`.
  - `updateSettings(ws, patch: Partial<Settings>): Workspace`.

- [ ] **Step 1: Write failing tests.**
  - **No mutation.** Every function leaves its input deep-equal to a `structuredClone` taken before the call.
  - **Still valid.** `validate()` passes on every successful result built from `tests/fixtures/valid-workspace.json`.
  - **`newId`.** `newId('r', ['r1','r3']) === 'r2'`.
  - **Roles.**
    - Removing a role that has members, without a replacement, gives `error.ref.inuse` (Review Focus 1).
    - Removing role A with replacement B, where an event has participants A 0.5 and B 0.75, leaves one participant B with share 1.
  - **Categories.** Removing a category in use moves its events to the replacement.
  - **People.** Removing a person drops their memberships.
  - **Cycles and assumptions.**
    - `removeCycle` gives `error.ref.inuse` while an event uses the cycle.
    - Removing the assumption `stories` from the fixture team gives `error.ref.inuse`.
  - **Teams.**
    - `duplicateTeam` makes a team with a new id and equal events.
    - Changing the copy leaves the original unchanged.
  - **Order.** `moveItem` up on the first item is a no-op.
  - **Validation.** `validate` rejects `preparation: 1.5` with `error.number.invalid`.
- [ ] **Step 2: Run** `npm test -- edit`. It is expected to FAIL.
- [ ] **Step 3: Implement** `edit.ts`. Change the validator to `{ min: 0, max: 1 }` for `preparation`. Fix the fixture. Add `error.ref.inuse` to both catalogues: de "Wird noch verwendet: {path}", en "Still in use: {path}".
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check`. They are expected to PASS.
- [ ] **Step 5: Commit** `feat(core): edit operations`.

### Task 2: Core view data (#10, #13)

**Files:**
- Create: `src/data/regions/index.ts`, `src/core/views.ts`, `tests/unit/views.test.ts`

**Interfaces:**
- Consumes: `occurrences`, `effectiveDuration` (recurrence.ts); `holidayIndex`, `validateRegion`, `HolidayIndex`, `HolidayName` (regions.ts); `loadPerWeek`, `weeklyBaseLoad`, `fte`, `warnings` (load.ts); `mondayOf`, `isoWeek`, `addDays`, `diffDays`, `toMinutes` (date.ts).
- Produces:
  - `REGIONS: Record<string, Region>` and `regionIds(): string[]` in `src/data/regions/index.ts`. Each JSON file is validated with `validateRegion` at import, and the import throws on invalid data.
  - `workspaceIndex(ws): HolidayIndex`. It covers the settings horizon. An unknown region gives empty maps with `beyondKnown: true`.
  - `type Filter = { teamId?: string; roleId?: string; personId?: string }`.
  - `filteredOccurrences(ws, index, filter): (Occurrence & { hours: number })[]`. It covers all teams, or only `teamId`. `hours` depends on the filter:
    - **personId:** the person-hours from the participants whose role the person holds in that team. Occurrences the person does not attend are dropped.
    - **roleId:** that role's hours. Occurrences without that role are dropped.
    - **Otherwise:** the sum of role-hours over all participants.
    - **Skipped holidays:** occurrences with `skippedHoliday` are kept with `hours: 0`.
  - `dayLoad(ws, index, filter): Map<ISODate, number>`.
  - `cadenceNumber(team, date): number | undefined`. It is the 1-based sprint/PI number counted from `cadence.start`, and `undefined` before the start.
  - `weekRows(ws, index, filter): WeekRow[]`, where `WeekRow = { monday, week: number /* ISO */, cadence: { teamId: string; number: number }[], milestones: { teamId: string; name: string; date: ISODate }[], holidays: { date: ISODate; name: HolidayName }[], schoolHoliday?: HolidayName, byRole: Record<string, number>, total: number }`. There is one row per Monday of the horizon.
  - `loadSummary(ws, filter): { byCategory: { categoryId: string; hours: number }[]; byRole: { roleId: string; hours: number; percent: number; fte: number }[] }`. It is built from `weeklyBaseLoad` summed over the teams. `percent = hours / settings.hoursPerWeek × 100`, and `fte` is computed against `settings.hoursPerWeek`.
  - `conflicts(ws, index, personId): { date: ISODate; a: Occurrence; b: Occurrence }[]`. It lists pairs of attended occurrences on the same day whose `[start, start + duration)` overlap, across all teams. A pair that only touches at its edges does not count.

- [ ] **Step 1: Write failing tests.**
  - `workspaceIndex` marks 2026-12-25 as a holiday for `de-sn`. An unknown region `xx` gives no holidays and does not crash (Review Focus 5).
  - The person filter in a team where the person is PO and the event has PO 0.5 gives hours × 0.5.
  - The role filter drops events that role does not attend.
  - `cadenceNumber` gives 1 on the start date and 2 at start + 14 for a 2-week sprint, and `undefined` the day before the start.
  - `weekRows` has one row per Monday. Every row in a horizon that ends before the cadence starts has an empty `cadence` (Review Focus 5).
  - `dayLoad` for 2026-12-25, with `skipHolidays` on, is 0.
  - **Conflicts (Review Focus 4):**
    - A person in two teams with events 09:00–10:00 and 09:30–10:00 on the same day gives one conflict.
    - 09:00–10:00 followed by 10:00–11:00 gives none.
    - An occurrence on 2027-03-28 (DST start) keeps start `09:00`.
  - `loadSummary` gives FTE 0.5 for a role with 20 h at 40 h/week.
- [ ] **Step 2: Run** `npm test -- views`. It is expected to FAIL.
- [ ] **Step 3: Implement.** Use `loadPerWeek` semantics for hours. Do not re-derive the formula.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check`. They are expected to PASS.
- [ ] **Step 5: Commit** `feat(core): view data and region registry`.

### Task 3: App state store

**Files:**
- Create: `src/ui/state/workspace.ts`, `src/ui/state/form.ts`, `tests/unit/state.test.ts`
- Modify: `src/ui/App.svelte` (the locale follows the workspace), `src/ui/LanguageSwitch.svelte`, `src/i18n/index.ts` (remove `LOCALE_STORAGE_KEY` and its use)

**Interfaces:**
- Consumes: Task 1 edit functions, `workspaceIndex` (Task 2), `emptyWorkspace`, `validate`, the i18n `locale` and `detectLocale`.
- Produces:
  - `createWorkspaceStore(initial: Workspace)` returns an object with these members:
    - `subscribe`: a readable `Workspace`.
    - `apply(change: (ws: Workspace) => Workspace | Result<Workspace>): Result<Workspace>`. It commits only ok results that pass `validate`, pushes the history (max 50) and sets dirty.
    - `undo(): boolean`.
    - `canUndo`: a readable `boolean`.
    - `dirty`: a readable `boolean`.
    - `fileName`: a readable `string | null`.
    - `replace(ws: Workspace, opts: { fileName: string | null; dirty: boolean }): void`. It clears the history.
    - `markSaved(fileName: string): void`.
  - The app singletons `workspace`, `index` (derived via `workspaceIndex`), `activeTeamId` (writable `string | null`, kept valid when teams change) and `filter` (writable `Filter`).
  - `fieldErrors(errors: ValidationError[], prefix: string): Record<string, string>` in `form.ts`. It maps the path relative to the prefix to an i18n key.
  - **Locale.** The UI locale is `workspace.settings.locale`. `LanguageSwitch` changes it through `apply(ws => updateSettings(ws, { locale }))`. On first start, the empty workspace gets `locale: detectLocale()`.

- [ ] **Step 1: Write failing tests.**
  - `apply` with a change that returns `{ ok: false }` leaves the state, history and dirty flag unchanged.
  - An ok change sets dirty and `canUndo`.
  - `undo` restores the exact previous workspace.
  - After 51 changes, 50 undos are possible.
  - `replace` clears the history and sets dirty as given.
  - `markSaved` clears dirty.
  - `activeTeamId` falls back to the first team when its team is removed, and to `null` when there are none.
  - `fieldErrors([{ path: 'teams.0.events.2.time', key: 'error.time.invalid' }], 'teams.0.events.2')` gives `{ time: 'error.time.invalid' }`.
- [ ] **Step 2: Run** `npm test -- state`. It is expected to FAIL.
- [ ] **Step 3: Implement.** Update the shell e2e so that switching the language still changes `<html lang>`.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check && npm run e2e`. They are expected to PASS.
- [ ] **Step 5: Commit** `feat(ui): workspace store with undo`.

### Task 4: Files, autosave and workspace bar (#14)

**Files:**
- Create:
  - `src/ui/state/files.ts`, `src/ui/state/autosave.ts`
  - `src/ui/components/ConfirmDialog.svelte`, `src/ui/WorkspaceBar.svelte`
  - `src/data/examples/example.caldence.json`
  - `tests/unit/files.test.ts`, `tests/unit/autosave.test.ts`, `tests/e2e/files.spec.ts`
- Modify: `src/ui/Shell.svelte` (bar above the tabs, shortcuts), `playwright.config.ts`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the Task 3 store, `loadWorkspace` (validate.ts), `emptyWorkspace`.
- Produces:
  - `serialize(ws): string`: JSON with 2-space indent and a trailing newline.
  - `createFileService(env: FileEnv)`, where `FileEnv = { showOpenFilePicker?, showSaveFilePicker?, download(name: string, text: string): void, pickFile(): Promise<File | null> }`. It returns `{ open(): Promise<Result<{ ws: Workspace; name: string }> | null>, save(ws, name: string | null): Promise<string | null>, saveAs(ws, name: string | null): Promise<string | null> }`.
    - When the picker APIs exist it uses them and keeps the last handle for `save`. Otherwise it falls back to `download` and `pickFile`.
    - `null` means the user cancelled.
    - The default file name is `workspace.caldence.json`, and the picker filter is `.json`.
  - `createAutosave(kv: { get(k: string): Promise<unknown>; set(k: string, v: unknown): Promise<void> }, debounceMs = 500)`. It returns `{ restore(): Promise<{ ws: Workspace; fileName: string | null; dirty: boolean } | null>, schedule(state): void, available: boolean }`.
    - It also exports `idbStore(dbName = 'caldence', storeName = 'autosave')`. If IndexedDB is unavailable, it returns a store whose calls reject, and autosave then reports `available: false`.
  - `ConfirmDialog.svelte`, with props `open`, `title`, `message` and events. It returns `'save' | 'discard' | 'cancel'`, and Escape means cancel.
  - `WorkspaceBar.svelte` contains:
    - the buttons New, Open, Save and Save as;
    - the file name, or the translated "Untitled";
    - an unsaved marker that is text plus a symbol, not colour only;
    - a notice when autosave is off.
  - **Start screen.** When the workspace has no teams, the Calendar panel offers "Open example".
  - **Shortcuts.** Ctrl/Cmd+S saves, Ctrl/Cmd+Shift+S saves as, Ctrl/Cmd+O opens, and Ctrl/Cmd+Z undoes. Ctrl/Cmd+Z is ignored while focus is in an input, textarea or select.
  - **Leaving the page.** `beforeunload` warns while dirty.
  - **Example file.** It has two teams that share one person, with events of every rule type. It must pass `validate`.

- [ ] **Step 1: Write failing tests.**
  - **Unit tests.**
    - `serialize` → `loadWorkspace` round-trips to a deep-equal workspace.
    - With fake pickers, `save` after `open` writes to the same handle without a picker.
    - Without pickers, `saveAs` calls `download` with the name.
    - `open` of text with `schemaVersion: 99` gives `error.schema.newer`.
    - Autosave with an in-memory kv restores `{ ws, fileName, dirty }`. A kv whose `get` rejects gives `restore() === null` and `available === false` (Review Focus 3).
  - **E2E (fallback path, forced with `addInitScript` deleting `showOpenFilePicker`/`showSaveFilePicker`).**
    - Open the example, make a change, and check that the unsaved marker shows.
    - Reload. The same data is there and the marker still shows (Review Focus 3).
    - Save as. A download named `workspace.caldence.json` arrives and the marker clears.
    - Open an invalid JSON file through `setInputFiles`. A translated error shows, and the previous workspace is unchanged (Review Focus 2).
    - New while dirty opens the dialog. Cancel keeps the data.
    - axe passes with the dialog open.
- [ ] **Step 2: Run** `npm test -- files autosave && npm run e2e -- files`. They are expected to FAIL.
- [ ] **Step 3: Implement.**
  - In `playwright.config.ts`, add projects `chromium` (always), and `firefox` and `webkit` only when `process.env.CI`. The non-Chromium projects run only `files.spec.ts`.
  - In CI, change the install step to `npx playwright install --with-deps chromium firefox webkit`.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check && npm run e2e`. They are expected to PASS.
- [ ] **Step 5: Commit** `feat(ui): open, save and autosave workspaces`.

### Task 5: Workspace settings view with roles and people (#9, #11)

**Files:**
- Create:
  - `src/ui/views/SettingsView.svelte`
  - `src/ui/components/ListEditor.svelte`, `src/ui/components/ColourField.svelte`, `src/ui/components/ReplaceDialog.svelte`
  - `tests/e2e/settings.spec.ts`
- Modify: `src/ui/Shell.svelte` (render the view in the `settings` panel), the catalogues

**Interfaces:**
- Consumes: the Task 3 store; Task 1 `addItem`, `updateItem`, `moveItem`, `removeItem`, `updateSettings`; `regionIds`; `contrastOk`.
- Produces:
  - `ListEditor`: a generic list with add, inline rename, move up/down buttons (labelled with the item name) and delete. Delete opens `ReplaceDialog` when `removeItem` returns `error.ref.inuse`. Task 7 reuses it for categories.
  - `ColourField` has props `value` and `label`. It offers a palette of 8 tokens-safe colours plus `<input type="color">`, and shows a text warning when `!contrastOk(value)`.
  - The settings fields are:
    - language;
    - region (from `regionIds()`, with localized names);
    - timezone (`Intl.supportedValuesOf('timeZone')` where available, otherwise a text field);
    - workdays (7 checkboxes);
    - default hours per week;
    - horizon from/to;
    - skip holidays;
    - thresholds;
    - roles (name, colour);
    - people (name, hours per week).
  - Team assumptions do **not** appear here. A help text points to the Team view (#11).

- [ ] **Step 1: Write failing e2e tests.**
  - Add the roles "Product Owner" and "Scrum Master" by keyboard only.
  - Reorder them.
  - Delete a role in use from the example. The replace dialog appears, and after picking a replacement the members show the replacement.
  - Set the horizon end before the start. An inline error shows and the value is not committed.
  - Pick `#ffff00`. The contrast warning text shows.
  - Change the language to English. The labels change.
  - axe passes in de and en.
- [ ] **Step 2: Run** `npm run e2e -- settings`. It is expected to FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check && npm run e2e`. They are expected to PASS.
- [ ] **Step 5: Commit** `feat(ui): workspace settings, roles and people`.

### Task 6: Teams and team view (#10, #11)

**Files:**
- Create: `src/ui/views/TeamView.svelte`, `src/ui/TeamSwitcher.svelte`, `src/ui/FilterBar.svelte`, `tests/e2e/team.spec.ts`
- Modify: `src/ui/WorkspaceBar.svelte` (holds the switcher and filter), the catalogues

**Interfaces:**
- Consumes: Task 1 `addTeam`, `updateTeam`, `duplicateTeam`, `removeTeam`, `upsertCycle`, `removeCycle`; the store's `activeTeamId` and `filter`; `ListEditor`, `ConfirmDialog`.
- Produces:
  - **`TeamSwitcher`.** A labelled `<select>` of teams plus Add, Rename, Duplicate and Delete. Delete asks for confirmation.
  - **`FilterBar`.** Labelled selects for role and person. "All" is the default. It writes `filter` and keeps `filter.teamId = activeTeamId` except when a person is selected: the person view spans all teams.
  - **Team view sections.**
    - Members: person × role rows, with add and remove.
    - Cadence: kind, length in weeks, start date.
    - Cycles: name and milestones (name, date).
    - Assumptions: key and number, with add, rename and remove. Removing one that is in use shows the `error.ref.inuse` message inline.

- [ ] **Step 1: Write failing e2e tests.**
  - Add team "Team B" and switch to it. The Team view shows an empty members list with a hint.
  - Duplicate "Team A". The copy has the same cadence.
  - Add a person to two teams and select that person in the filter. The bar states "all teams".
  - Removing the assumption used by scaling shows an inline error.
  - Delete a team after confirming.
  - axe passes in de and en.
- [ ] **Step 2: Run** `npm run e2e -- team`. It is expected to FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check && npm run e2e`. They are expected to PASS.
- [ ] **Step 5: Commit** `feat(ui): teams, members, cadence, cycles and assumptions`.

### Task 7: Meetings editor with categories (#12)

**Files:**
- Create: `src/ui/views/MeetingsView.svelte`, `src/ui/components/EventForm.svelte`, `src/ui/components/RuleFields.svelte`, `tests/e2e/meetings.spec.ts`
- Modify: the catalogues

**Interfaces:**
- Consumes: `upsertEvent`, `duplicateEvent`, `removeEvent`, and the category variants of `addItem`, `updateItem`, `moveItem` and `removeItem`; `effectiveDuration`; `fieldErrors`; `ListEditor`, `ColourField`, `ReplaceDialog`.
- Produces:
  - **Event table.** It lists the active team's events with name, category, a rule summary (translated, e.g. "Every 2 weeks on Tuesday"), time, effective duration and roles. Each row has Edit, Duplicate and Delete.
  - **`EventForm`.** It edits a draft copy. On save it builds the candidate workspace via `upsertEvent`, runs `validate`, and either commits through `apply` or shows `fieldErrors` inline. Its fields are:
    - name;
    - category;
    - rule type with `RuleFields`;
    - time;
    - duration in minutes;
    - optional scaling (base, per unit, assumption select, grid);
    - participants (role select and share 0–1 in steps of 0.05, add and remove);
    - preparation in %.
  - **`RuleFields`.** It shows only the inputs of the chosen rule type:
    - weekly: weekday;
    - every-n-weeks: weekday, n and anchor;
    - monthly-nth-weekday: weekday and nth (1–5 or "last");
    - cadence-day: day 0 to lengthWeeks × 7 − 1, shown as "Day 1 = sprint start";
    - cycle-milestone: cycle, milestone and offset days;
    - once: date.
  - **Categories.** A side section with `ListEditor` and colour.
  - **Undo.** An Undo button is bound to `workspace.undo`.

- [ ] **Step 1: Write failing e2e tests.**
  - Create one event of each of the six rule types by keyboard. Each appears in the table with the expected rule summary.
  - Enter time `25:00`. An inline error appears and focus moves to the first invalid field.
  - Delete a category in use. The replace dialog appears.
  - Undo restores the deleted event.
  - Preparation 25 % is stored as 0.25. Check this by Save as and reading the download.
  - axe passes with the form open in de and en.
- [ ] **Step 2: Run** `npm run e2e -- meetings`. It is expected to FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check && npm run e2e`. They are expected to PASS.
- [ ] **Step 5: Commit** `feat(ui): meetings editor and categories`.

### Task 8: Calendar view (#13)

**Files:**
- Create: `src/ui/views/CalendarView.svelte`, `src/ui/components/DayDetails.svelte`, `tests/e2e/calendar.spec.ts`

**Interfaces:**
- Consumes: `filteredOccurrences`, `dayLoad`, `cadenceNumber`, `conflicts`, `workspaceIndex` (Task 2); `filter`; `formatDisplayDate`, `formatNumber`.
- Produces:
  - **Month view.** A `<table>` grid with one row per week, a week-number column and a column header per weekday. Each day cell shows:
    - the date;
    - a holiday name, or a school-holiday marker as text;
    - the cadence number on the cadence start day;
    - milestones;
    - hours for the day;
    - the number of meetings.
    - Non-workdays are muted, with a text hint for screen readers.
  - **Week view.** A list of days with their meetings (time, name, category, hours).
  - **Navigation.** Previous, Today and Next buttons, a month/week toggle, and keyboard arrows within the grid (roving focus as in the APG grid pattern).
  - **Day details.** Selecting a day opens `DayDetails`, which lists its meetings and any conflicts for the person filter, marked with text and an icon.
  - **Empty state.** With no teams or events, a hint links to the Meetings view.

- [ ] **Step 1: Write failing e2e tests.**
  - Open the example. December 2026 shows "1. Weihnachtsfeiertag" (de) on the 25th, with 0 h.
  - The day hours equal `dayLoad` for 3 sample days. The test computes them from the example file using the core functions.
  - Selecting the shared person shows the conflict in day details.
  - Arrow keys move the focus between days.
  - The empty workspace shows the empty-state hint (Review Focus 5).
  - At 375 px wide there is no horizontal page scroll.
  - axe passes in month and week view, de and en, light and dark.
- [ ] **Step 2: Run** `npm run e2e -- calendar`. It is expected to FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check && npm run e2e`. They are expected to PASS.
- [ ] **Step 5: Commit** `feat(ui): calendar view`.

### Task 9: Weeks and load views (#13)

**Files:**
- Create: `src/ui/views/WeeksView.svelte`, `src/ui/views/LoadView.svelte`, `tests/e2e/weeks-load.spec.ts`

**Interfaces:**
- Consumes: `weekRows`, `loadSummary`, `loadPerWeek`, `warnings`, `fte` (Tasks 2 and phase 1); `filter`; `formatNumber`.
- Produces:
  - **Weeks view.** A table with a caption and column headers: ISO week, Monday date, cadence numbers per team, milestones, holidays, school holiday, hours per role (one column per role) and total. The current week is marked with `aria-current="date"` and a text label.
  - **Load view.** Two tables:
    - base load per category × role;
    - per role: hours, percent and FTE.
    - Below them, a list of warnings (`above-average`, `above-fte`) with week and person. Each warning is text with an icon and is never colour-only.
    - Numbers are formatted with the locale (`12,06` in de).
  - **Empty state.** Both views show an explanatory empty state for an empty workspace.

- [ ] **Step 1: Write failing e2e tests.**
  - With the example, the Weeks table row for the cadence start week shows sprint 1.
  - The Load table values equal `loadSummary`, computed in the test from the example file.
  - Switching to English formats `12.06`.
  - A horizon ending before the cadence start gives rows without cadence numbers and no crash (Review Focus 5).
  - axe passes in de and en.
- [ ] **Step 2: Run** `npm run e2e -- weeks-load`. It is expected to FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check && npm run e2e`. They are expected to PASS.
- [ ] **Step 5: Commit** `feat(ui): weeks and load views`.

### Task 10: Help, combined flow and docs (#10, #11, #14)

**Files:**
- Create: `src/ui/views/HelpView.svelte`, `tests/e2e/flow.spec.ts`
- Modify: the catalogues (help texts), `README.md` (status), `CHANGELOG.md`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - **Help view.** Short sections: first steps, settings vs. assumptions (which field lives where, #11), files and autosave, and keyboard shortcuts. The text is in both languages, from the catalogues.
  - **README status.** "phase 2 – usable core app (editing, calendar, weeks, load, files)".

- [ ] **Step 1: Write the failing e2e flow.**
  - Start empty and add two roles and one person.
  - Create two teams, both with that person, and add one meeting per team at the same time.
  - The Load view for that person shows the combined hours of both teams.
  - The calendar shows the conflict.
  - Save as, reload, and Open of the downloaded file restores everything (#10 and #14 done-criteria).
  - The Help view passes axe in de and en.
- [ ] **Step 2: Run** `npm run e2e -- flow`. It is expected to FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check && npm run build && npm run e2e`. They are expected to PASS.
- [ ] **Step 5: Commit** `feat(ui): help view and end-to-end flow`.
