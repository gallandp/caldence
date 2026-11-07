# Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the tested core of Caldence (dates, data model, regions, recurrence, load) plus project tooling, i18n and an accessible app shell, covering issues #3–#8.

**Architecture:** Pure TypeScript domain logic in `src/core` with no DOM access, JSON data in `src/data`, message catalogues in `src/i18n`, and a minimal Svelte 5 shell in `src/ui`. Core is driven by unit tests (Vitest), the shell by Playwright with axe.

**Tech Stack:** Node 22 LTS, Vite, Svelte 5, TypeScript (strict), Vitest, Playwright, @axe-core/playwright, ESLint (flat config) and Prettier, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-07-caldence-design.md`

## Global Constraints

- Static files only. The public site `caldence.de` runs on plain webspace with **no server-side logic** (no PHP, no database, no API). Everything happens in the browser.
- Dates are `YYYY-MM-DD` strings, times `HH:MM`, durations in minutes. No `Date` objects cross module boundaries.
- `src/core` imports nothing from `src/ui`, uses no DOM globals and no network.
- No external requests at runtime, no CDN (spec §10 Privacy).
- Vite `base: './'` so `dist/` runs from any sub-folder of any web server (spec §3).
- No user-visible string outside `src/i18n/*.json` (spec §10).
- WCAG 2.2 AA; axe reports zero violations on every rendered view (spec §10).
- Versioning Major.Minor.Hotfix, starting at `0.1.0`; never bumped by hand, PR labels `release:major|minor|hotfix|none` decide (spec §11).
- Branch names describe the topic, e.g. `feature/core-recurrence`. Every PR updates `CHANGELOG.md` under `## Unreleased`.

## Review Focus

1. A planning horizon spanning a year boundary: holidays must be computed for every year it touches, not only the start year (Task 4).
2. `monthly-nth-weekday` with a 5th weekday that does not exist in a month: the occurrence is skipped, never moved to another week (Task 5).
3. A workspace file with a newer `schemaVersion` than the app knows: loading is refused with a clear error and the input is not modified (Task 3).
4. Horizon end before horizon start: validation error, no occurrences, no crash (Tasks 3 and 5).
5. A user-chosen colour with low contrast against white: `contrastOk` flags it so the UI can warn (Task 8).

---

### Task 1: Project setup, CI and release workflow (#3)

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `svelte.config.js`, `eslint.config.js`, `.prettierrc`, `playwright.config.ts`, `index.html`, `src/main.ts`, `src/ui/App.svelte`, `src/version.ts`, `scripts/version-bump.mjs`, `CHANGELOG.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/bug.yml`, `.github/ISSUE_TEMPLATE/feature.yml`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- Test: `tests/unit/version-bump.test.ts`, `tests/e2e/shell.spec.ts`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `preview`, `lint`, `check` (svelte-check), `test` (vitest run), `e2e` (playwright test --trace off); `bump(version: string, label: 'release:major' | 'release:minor' | 'release:hotfix' | 'release:none' | null): string` in `scripts/version-bump.mjs`; `APP_VERSION: string` exported from `src/version.ts`, read from `package.json` at build time.

- [ ] **Step 1: Write failing tests.** `bump('0.1.0','release:minor') === '0.2.0'`, `bump('0.2.3','release:major') === '1.0.0'`, `bump('1.2.3','release:hotfix') === '1.2.4'`, `bump('1.2.3', null) === '1.2.4'` (no label counts as hotfix), `bump('1.2.3','release:none') === '1.2.3'`. E2E: the page title is `Caldence` and `<html lang>` is set.
- [ ] **Step 2: Run** `npm test` and expect FAIL (module missing).
- [ ] **Step 3: Scaffold** Vite, Svelte 5 and TypeScript strict with `base: './'`; implement `bump`; App shows the app name and `APP_VERSION`.
- [ ] **Step 4: CI.** `ci.yml` on `pull_request` and on push to `main`: `npm ci`, `lint`, `check`, `test`, `build`, Playwright Chromium `e2e`.
- [ ] **Step 5: Release.** `release.yml` on push to `main`: read the merged PR's label, run `bump`, write the version to `package.json`, move `## Unreleased` in `CHANGELOG.md` to `## <version> – <date>`, commit `Version <version>`, tag `v<version>`, create a GitHub release with that changelog section and a ZIP of `dist/`. Do nothing for `release:none`.
- [ ] **Step 6: Run** `npm run lint && npm run check && npm test && npm run build && npm run e2e` and expect all PASS.
- [ ] **Step 7: Commit** on `feature/project-setup`; PR with label `release:minor`.

### Task 2: Date helpers (#5)

**Files:**
- Create: `src/core/date.ts`
- Test: `tests/unit/date.test.ts`

**Interfaces:**
- Produces: `type ISODate = string`, `type Time = string`; `parseDate(d: ISODate): number` (UTC ms), `formatDate(ms: number): ISODate`, `addDays(d, n): ISODate`, `diffDays(a, b): number`, `weekday(d): 1|2|3|4|5|6|7` (Monday = 1), `mondayOf(d): ISODate`, `isoWeek(d): number`, `isValidDate(s: unknown): s is ISODate`, `nthWeekdayOfMonth(year, month /*1–12*/, weekday, n: 1|2|3|4|5|-1): ISODate | null`, `easterSunday(year): ISODate`, `isValidTime(s: unknown): s is Time`, `toMinutes(t: Time): number`, `fromMinutes(m: number): Time`.

- [ ] **Step 1: Write failing tests.** `isoWeek('2026-12-31') === 53`, `isoWeek('2027-01-01') === 53`, `isoWeek('2027-01-04') === 1`; `weekday('2027-01-07') === 4`; `nthWeekdayOfMonth(2027, 5, 1, -1) === '2027-05-31'`; `nthWeekdayOfMonth(2027, 2, 5, 5) === null`; `easterSunday(2027) === '2027-03-28'`, `easterSunday(2026) === '2026-04-05'`; `isValidDate('2027-02-29') === false`; `addDays('2026-12-31', 1) === '2027-01-01'`; `toMinutes('09:30') === 570`; `isValidTime('24:00') === false`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/date.test.ts` and expect FAIL.
- [ ] **Step 3: Implement** with UTC arithmetic only; Easter with the anonymous Gregorian (Gauss) algorithm.
- [ ] **Step 4: Run** and expect PASS.
- [ ] **Step 5: Commit** `feat(core): date helpers`.

### Task 3: Workspace model, validation and migrations (#4)

**Files:**
- Create: `src/core/model.ts`, `src/core/validate.ts`, `src/core/migrate.ts`
- Test: `tests/unit/validate.test.ts`, `tests/unit/migrate.test.ts`, fixtures in `tests/fixtures/`

**Interfaces:**
- Consumes: `isValidDate`, `isValidTime` (Task 2).
- Produces, in `model.ts` (names as in spec §4):
  - `Workspace { schemaVersion: number; settings: Settings; roles: Role[]; people: Person[]; categories: Category[]; teams: Team[] }`
  - `Settings { locale: 'de' | 'en'; region: string; timezone: string; workdays: number[]; hoursPerWeek: number; horizon: { from: ISODate; to: ISODate }; skipHolidays: boolean; thresholds: { warnFactor: number; maxFte: number } }`
  - `Role { id: string; name: string; colour: string }`, `Person { id: string; name: string; hoursPerWeek: number }`, `Category { id: string; name: string; colour: string }`
  - `Team { id: string; name: string; templateId?: string; cadence: Cadence; members: { personId: string; roleId: string }[]; assumptions: Record<string, number>; cycles: Cycle[]; events: CalEvent[] }`
  - `Cadence { kind: 'sprint' | 'flow' | 'pi'; lengthWeeks: number; start: ISODate }`
  - `Cycle { id: string; name: string; milestones: { id: string; name: string; date: ISODate }[] }`
  - `CalEvent { id: string; name: string; categoryId: string; rule: Rule; time: Time; duration: number; scaling?: { base: number; perUnit: number; assumption: string; grid: number }; participants: { roleId: string; share: number }[]; preparation: number }`
  - `Rule = { type: 'weekly'; weekday } | { type: 'every-n-weeks'; weekday; n; anchor: ISODate } | { type: 'monthly-nth-weekday'; weekday; nth: 1|2|3|4|5|-1 } | { type: 'cadence-day'; day: number } | { type: 'cycle-milestone'; cycleId; milestoneId; offsetDays: number } | { type: 'once'; date: ISODate }`
  - `CURRENT_SCHEMA = 1`; `emptyWorkspace(today: ISODate): Workspace`
- Produces, in `validate.ts`: `type Result<T> = { ok: true; value: T } | { ok: false; errors: { path: string; key: string }[] }` (`key` is an i18n key such as `error.date.invalid`); `validate(input: unknown): Result<Workspace>`; `loadWorkspace(text: string): Result<Workspace>` (parse JSON, migrate, validate).
- Produces, in `migrate.ts`: `MIGRATIONS: Record<number, (w: unknown) => unknown>`; `migrate(input: unknown): { ok: true; value: unknown } | { ok: false; key: 'error.schema.newer' | 'error.schema.unknown' }`.

- [ ] **Step 1: Write failing tests.** `emptyWorkspace('2026-11-07')` validates; missing `teams` gives an error at path `teams`; a share of 1.5 gives `error.share.range`; `horizon.to` before `horizon.from` gives `error.horizon.order` (Review Focus 4); an unknown `categoryId` on an event gives an error; duplicate role ids give an error; `schemaVersion: CURRENT_SCHEMA + 1` gives `error.schema.newer` and the input stays deep-equal to a copy taken before (Review Focus 3); invalid JSON text gives `error.file.json`; all errors are returned, not only the first.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement** a hand-written validator without a schema library.
- [ ] **Step 4: Run** and expect PASS.
- [ ] **Step 5: Commit** `feat(core): workspace model and validation`.

### Task 4: Region files with Saxony (#6)

**Files:**
- Create: `src/data/regions/de-sn.json`, `src/core/regions.ts`, `docs/region-format.md`
- Test: `tests/unit/regions.test.ts`

**Interfaces:**
- Consumes: `easterSunday`, `addDays`, `weekday` (Task 2); `Result` (Task 3).
- Produces: `type HolidayName = Record<'de' | 'en', string>`; `Region { id: string; name: HolidayName; holidays: HolidayRule[]; schoolHolidays: { name: HolidayName; from: ISODate; to: ISODate }[]; schoolHolidaysKnownUntil: ISODate }`; `HolidayRule = { type: 'fixed'; month: number; day: number; name: HolidayName } | { type: 'easter'; offset: number; name: HolidayName } | { type: 'special'; id: 'repentance-day'; name: HolidayName }`; `holidaysFor(region, year): { date: ISODate; name: HolidayName }[]`; `holidayIndex(region, from: ISODate, to: ISODate): { holidays: Map<ISODate, HolidayName>; schoolHolidays: Map<ISODate, HolidayName>; beyondKnown: boolean }`; `validateRegion(input: unknown): Result<Region>`.

- [ ] **Step 1: Write failing tests.** `holidaysFor(deSn, 2027)` dates equal `['2027-01-01','2027-03-26','2027-03-29','2027-05-01','2027-05-06','2027-05-17','2027-10-03','2027-10-31','2027-11-17','2027-12-25','2027-12-26']`; Repentance Day 2026 is `2026-11-18`; `holidayIndex(deSn, '2026-12-01', '2027-01-31').holidays` contains both `2026-12-25` and `2027-01-01` (Review Focus 1); `beyondKnown` is true when `to` lies after `schoolHolidaysKnownUntil`; `de-sn.json` passes `validateRegion`.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement** and fill `de-sn.json` with the public holiday rules and the official Saxony school holidays for 2026/27 and 2027/28; cite the source URL of the Saxon Ministry of Education in `docs/region-format.md`, which also documents the format.
- [ ] **Step 4: Run** and expect PASS.
- [ ] **Step 5: Commit** `feat(core): region files with Saxony`.

### Task 5: Recurrence engine (#5)

**Files:**
- Create: `src/core/recurrence.ts`
- Test: `tests/unit/recurrence.test.ts`

**Interfaces:**
- Consumes: model types (Task 3); `holidayIndex` result (Task 4); date helpers (Task 2).
- Produces: `Occurrence { eventId: string; teamId: string; date: ISODate; start: Time; duration: number; skippedHoliday?: HolidayName }`; `effectiveDuration(event: CalEvent, team: Team): number`; `occurrences(team: Team, settings: Settings, index: HolidayIndex): Occurrence[]`, sorted by date then time, only inside `settings.horizon` and on or after `team.cadence.start`. With `settings.skipHolidays`, occurrences on a holiday are returned with `skippedHoliday` set (so the UI can show them) and count for no load.

- [ ] **Step 1: Write failing tests** with a sprint cadence of 2 weeks starting `2027-01-07`: `cadence-day` day 0 gives `2027-01-07`, `2027-01-21`, …; day 13 gives first `2027-01-20`; `weekly` Monday includes `2027-03-29` with `skippedHoliday` set; `every-n-weeks` n = 2 with anchor `2027-01-12` gives `2027-01-12`, `2027-01-26`; `monthly-nth-weekday` 5th Friday over February to April 2027 gives only `2027-04-30` (Review Focus 2); `once` outside the horizon gives nothing; `cycle-milestone` with offset −1 gives the day before the milestone; horizon `to` before `from` gives `[]` (Review Focus 4); `effectiveDuration` with base 30, perUnit 10, assumption value 4 and grid 15 gives `75`.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement**; scaling rounds up to the grid.
- [ ] **Step 4: Run** and expect PASS.
- [ ] **Step 5: Commit** `feat(core): recurrence engine`.

### Task 6: Load calculation (#5)

**Files:**
- Create: `src/core/load.ts`
- Test: `tests/unit/load.test.ts`

**Interfaces:**
- Consumes: `occurrences`, `effectiveDuration` (Task 5); model types (Task 3).
- Produces: `weeklyBaseLoad(team: Team): { byRole: Record<string, number>; byCategory: Record<string, Record<string, number>> }` in hours per week, formula from spec §7; `loadPerWeek(ws: Workspace, index: HolidayIndex): { monday: ISODate; byPerson: Record<string, number>; byTeamRole: Record<string, Record<string, number>> }[]`, summed over all teams, holidays excluded; `fte(hours: number, hoursPerWeek: number): number`; `warnings(weeks, ws: Workspace): { monday: ISODate; personId: string; kind: 'above-average' | 'above-fte' }[]` using `thresholds.warnFactor` and `thresholds.maxFte`.

- [ ] **Step 1: Write failing tests.** Weekly 60 min with preparation 0.5 and share 1 gives 1.5 h/week for that role; every 2 weeks 60 min with share 0.5 gives 0.25; a cadence-day event in a 2-week sprint, 120 min, share 1 gives 1.0; a person in two teams gets the sum of both teams in `byPerson`; a skipped holiday occurrence counts 0 in its week; `fte(19, 38) === 0.5`; a week above `warnFactor × average` is flagged `above-average`.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** and expect PASS.
- [ ] **Step 5: Commit** `feat(core): load calculation`.

### Task 7: Internationalisation (#7)

**Files:**
- Create: `src/i18n/de.json`, `src/i18n/en.json`, `src/i18n/index.ts`
- Test: `tests/unit/i18n.test.ts`

**Interfaces:**
- Consumes: error keys from Tasks 3 and 4.
- Produces: `type Locale = 'de' | 'en'`; `detectLocale(settings?: Settings, languages?: readonly string[]): Locale` (settings first, then browser languages, default `en`); `t(locale: Locale, key: string, params?: Record<string, string | number>): string` with `{name}` placeholders; `formatDate(locale, d: ISODate, style: 'short' | 'long'): string` and `formatNumber(locale, n: number, digits: number): string` via `Intl`; a Svelte store `locale` and a derived `$t` for components.

- [ ] **Step 1: Write failing tests.** `de.json` and `en.json` have identical key sets; every `error.*` key used in `src/core` (collected by scanning sources for `'error\.[a-z.]+'`) exists in both; `t('de', 'app.name') === 'Caldence'`; a missing key returns the key itself; `formatDate('de', '2027-01-07', 'short') === '07.01.2027'`; `formatNumber('de', 12.06, 2) === '12,06'`; `detectLocale(undefined, ['de-DE']) === 'de'`.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement**; add a test that fails on literal text in `.svelte` markup outside `$t(...)`.
- [ ] **Step 4: Run** and expect PASS.
- [ ] **Step 5: Commit** `feat: i18n de/en`.

### Task 8: Accessibility baseline and app shell (#8)

**Files:**
- Create: `src/ui/tokens.css`, `src/ui/Shell.svelte` (header, skip link, view tabs, `<main>`), `src/ui/LanguageSwitch.svelte`, `src/core/colour.ts`
- Modify: `src/ui/App.svelte`, `CONTRIBUTING.md` (accessibility checklist)
- Test: `tests/unit/colour.test.ts`, `tests/e2e/a11y.spec.ts`

**Interfaces:**
- Consumes: i18n (Task 7).
- Produces: `contrastRatio(a: string, b: string): number`; `contrastOk(hex: string, background = '#ffffff'): boolean` (at least 3:1, spec §10); CSS tokens for light and dark theme; empty placeholders for the nine views of spec §8, so later phases only fill them.

- [ ] **Step 1: Write failing tests.** `contrastRatio('#000000', '#ffffff')` is about 21; `contrastOk('#ffff00') === false` (Review Focus 5); `contrastOk('#2563eb') === true`. E2E: axe reports 0 violations on the shell in light and dark scheme for both locales; the first Tab reaches the skip link and activating it moves focus to `<main>`; view tabs work with arrow keys; with `prefers-reduced-motion: reduce` no transitions run; switching the language changes `<html lang>` and the visible labels.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement** tokens (all text colour pairs at least 4.5:1), the shell and the tablist following the WAI-ARIA Authoring Practices.
- [ ] **Step 4: Run** `npm test && npm run e2e` and expect PASS.
- [ ] **Step 5: Commit** `feat(ui): accessible app shell`.
