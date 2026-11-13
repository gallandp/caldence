# Navigation and team people Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People and roles are managed in the Team view, weekly hours are per person per team, Takt and cycles live with the meetings, and the Weeks view becomes the calendar's "Zeitraum" level.

**Architecture:** Three PRs in order. The sidebar keeps its slim look (divider lines, no group headings, Philipp 2026-11-13); only its entries change. PR 1 changes the data model (schema 4: `Person` loses `hoursPerWeek`, `Team` gains `memberHours`), load/FTE and the Team/Settings views. PR 2 moves the cadence and cycles cards from TeamView to MeetingsView. PR 3 folds WeeksView into CalendarView as a third level and trims the sidebar to 8 entries.

**Tech Stack:** Svelte 5, TypeScript, Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-13-navigation-and-team-people-design.md`

## Global Constraints

- Static app, no server logic. Older files must open through `migrate()`.
- Every new string in `src/i18n/de.json` and `src/i18n/en.json` (i18n test checks parity).
- Repo text in English; UI German and English.
- Help pages (`src/ui/help/*`) and `docs/workspace-format.md` match the behaviour (docs test).
- Branch names `feature/…`; labels `release:minor`; no Claude session links in commits or PRs.
- PR 3 starts only after the calendar-layout PR from the other thread is merged; rebase on it.

## Review Focus

1. Old file with a person in two teams: hours split evenly, sum unchanged (migration test).
2. Old file with a person in no team: kept, hours dropped (migration test).
3. Deleting a person who has hours in a team: `memberHours` entry removed, file still validates (edit test).
4. Replacing a person by another (remove with replacement): target keeps its own hours if it already had some in that team, else takes the removed person's (edit test).
5. Team filter vs person filter: FTE and the above-FTE warning use team hours vs summed hours (load test).

---

## PR 1: `feature/team-people-hours`

### Task 1: Schema 4 model, migration, validation

**Files:** Modify `src/core/model.ts`, `src/core/migrate.ts`, `src/core/validate.ts`, `src/core/template.ts`, `tests/fixtures/*.json` (schemaVersion and fields), `docs/workspace-format.md`. Test: `tests/unit/migrate.test.ts`, `tests/unit/validate.test.ts`.

**Interfaces — Produces:**
- `CURRENT_SCHEMA = 4`
- `interface Person { id: string; name: string }`
- `interface Team { …; memberHours: Record<string /* personId */, number> }` (missing key = `settings.hoursPerWeek`)
- `MIGRATIONS[3]`: drops `people[].hoursPerWeek`; for each team and each distinct member person sets `memberHours[pid] = round2(oldHours / teamCountOfPerson)`.

- [ ] Tests: `migrate 3→4 splits hours evenly over teams` (40 h, two teams → 20 + 20; three teams → 13.33 each); `migrate 3→4 keeps people without a team`; `validate rejects memberHours for an unknown person` (`error.ref.unknown`); `validate rejects memberHours above 168` (`error.number.range` as the existing num check yields); `templates drop memberHours`.
- [ ] Implement; `validate` checks `memberHours` is an object, keys reference people, values `0 ≤ h ≤ LIMITS.hoursPerWeek`. Templates: `team: Omit<Team, 'id' | 'members' | 'templateId' | 'memberHours'>`, imported team gets `memberHours: {}`.
- [ ] `npm test` green; commit.

### Task 2: Editing keeps `memberHours` consistent

**Files:** Modify `src/core/edit.ts`, `src/core/setup.ts`. Test: `tests/unit/edit.test.ts`, `tests/unit/setup.test.ts`.

**Interfaces — Produces:** `setMemberHours(ws: Workspace, teamId: string, personId: string, hours: number): Result<Workspace>`; `addTeam` creates `memberHours: {}`; `removeItem('people', id, replacement?)` deletes/moves entries (Review Focus 3, 4); `createTeamFromSetup` sets `memberHours[pid] = settings.hoursPerWeek` for each new member.

- [ ] Tests for Review Focus 3 and 4, `setMemberHours` range error, setup hours default.
- [ ] Implement; commit.

### Task 3: Load and FTE per scope

**Files:** Modify `src/core/load.ts`, `src/ui/views/LoadView.svelte`, `src/ui/views/WeeksView.svelte`. Test: `tests/unit/load.test.ts`, `tests/unit/weeks-load-expected.test.ts`.

**Interfaces — Produces:**
- `WeekLoad.byTeamPerson: Record<teamId, Record<personId, number>>`
- `capacity(ws: Workspace, personId: string, teamId?: string): number` — with `teamId`: that team's entry or the default; without: sum over the person's teams, default if none.
- `warnings(weeks: WeekLoad[], ws: Workspace, filter: Filter = {}): LoadWarning[]` — above-usual unchanged; above-fte: with `filter.teamId` and no `personId`, team hours vs `capacity(ws, p, teamId)` for that team's members; otherwise total vs `capacity(ws, p)`.

- [ ] Tests: Review Focus 5 (Alex 20 h Alpha / 18 h Beta, 12 h of meetings in Alpha only: team filter Alpha → FTE 0.6; person filter → 12/38).
- [ ] LoadView person table uses team hours under a team filter (`byTeamPerson`) and `capacity`; both views pass `$filter` to `warnings`. Commit.

### Task 4: Team view with people, roles and hours; Settings trimmed

**Files:** Modify `src/ui/views/TeamView.svelte`, `src/ui/views/SettingsView.svelte`, `src/ui/Shell.svelte` (view label key `view.team` → "Team"), `src/ui/views/MeetingsView.svelte` / `src/ui/components/EventForm.svelte` (new meeting preselects all roles of the team's members), `src/ui/help/*`, `src/i18n/*.json`. Test: `tests/e2e/*.spec.ts` that touch people, members or settings.

- Members card: one row per person (avatar, name, role chips each removable, hours input `aria-label="Wochenstunden von {name} in {team}"`), add row = person text field with `<datalist>` of all people not yet in the team (typing a new name creates the person), role select, hours (default `settings.hoursPerWeek`), "Zuordnen".
- "Personen & Rollen · gelten für alle Teams" card: the two `ListEditor`s moved from Settings; people extra shows "Alpha 20 h · Beta 18 h · Σ 38 h" or "noch in keinem Team"; roles keep their colour field.
- Settings: lists removed; `settings.help.team` text updated.
- [ ] Update e2e (`flow.spec.ts` creates people/roles in Team view), help (`Views`, `Where`, `LoadCalc`, `steps.ts`) and i18n; `npm run check`, `npm test`, `npm run e2e`, `npm run lint` green; commit; PR `release:minor`.

## PR 2: `feature/meetings-and-cadence`

### Task 5: Move Takt and cycles to "Termine & Takt"

**Files:** Modify `src/ui/views/TeamView.svelte` (remove cadence + cycles sections), `src/ui/views/MeetingsView.svelte` (compact Takt line with "Ändern" expanding the existing fields above the table; cycles card below the table, above categories), i18n (`view.meetings` → "Termine & Takt" / "Meetings & cadence", `view.team` → "Team"), help, e2e selectors.

- Move the cadence/cycle code as a new component `src/ui/components/CadenceCard.svelte` and `CyclesCard.svelte` (TeamView is ~1000 lines; moving into MeetingsView as-is would make that file as large).
- [ ] e2e: cadence edit and cycle add work from the Meetings view; all checks green; PR `release:minor`.

## PR 3: `feature/calendar-range-level`

### Task 6: Calendar levels Woche · Monat · Zeitraum

**Files:** Modify `src/ui/views/CalendarView.svelte` (mode `'week' | 'month' | 'range'`, order Woche, Monat, Zeitraum; in range mode render `WeeksView` content and hide prev/next/today/period title), `src/ui/Shell.svelte` (remove `weeks` from `views`, icons, FILTERED; `onOpenMeetings` passes through), i18n `cal.mode.range` "Zeitraum"/"Range", help views text, e2e (weeks specs open Kalender › Zeitraum).

- [ ] All checks green; PR `release:minor`.
