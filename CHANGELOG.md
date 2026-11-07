# Changelog

## Unreleased

### Added

- Open, save and autosave workspace files (#10, #14): workspace bar (New, Open, Save, Save as), File System Access API with download/upload fallback, unsaved-changes dialog, keyboard shortcuts (Ctrl/Cmd+S, Shift+S, O, Z), IndexedDB autosave with restore after reload, and an example workspace.
- Editing (#9): core edit operations for roles, people, categories, teams, cycles and events with reference checks (`error.ref.inuse`); workspace store with undo (50 steps), dirty flag and file name; form error mapping.
- Workspace settings view: language, region, time zone, workdays, hours, horizon, holidays, thresholds, and editable roles (with colour) and people; deleting a role that is in use asks for a replacement.
- Teams and team view: team switcher (add, rename, duplicate, delete), role and person filter, and per-team members, cadence, cycles with milestones and assumptions.
- Meetings view (#11): event table (rule summary, time, effective duration, roles), inline event form for all six rule types with scaling, participants and preparation in %, categories with colour and replace-on-delete, and undo.
- Calendar view (#12): month grid (APG grid keyboard pattern) with holidays, school holidays, cadence starts, milestones, hours and meeting count per day, week view, navigation, inline day details with person-overlap warnings, and empty-state hints.
- Weeks and load views (#13): weekly table (ISO week, cadence, milestones, holidays, school holidays, hours per role, current week marked) and load tables per category and role, per role and per person with warnings.
- Core view data: region registry, workspace holiday index, filtered occurrences, day load, week rows, load summary and per-person conflicts.
- Help view (#14) in German and English: first steps, where each setting lives (workspace settings or team view), files and autosave, keyboard shortcuts for the platform, and calendar keys; a combined end-to-end test covers the flow from an empty workspace to Save as, reload and Open.

### Changed

- The UI language is now a workspace setting.
- `preparation` is capped at 1 (a fraction); the UI shows and edits it as a percent.
- The person filter scopes cadence and milestones to the teams of the person (shared `scopeTeams`), and `loadSummary` returns a category by role matrix.
- The example team now has a scaled meeting.
- README status updated to phase 2.

### Fixed

- Deleting a role, category, person, cycle or assumption that is still used asks for a replacement or is refused; a used assumption or milestone cannot be removed, and renaming an assumption updates scaling rules.
- Localized percent, peak and warning texts in the load view; shared day item list, scoped markers and details focus in the calendar.

## 0.1.0 – 2026-11-07

- Project setup: Vite, Svelte 5, TypeScript (strict), Vitest, Playwright, ESLint and Prettier.
- Minimal app shell showing the app name and version.
- Core date helpers (UTC-only): parsing, weekday, ISO week, nth weekday of month, Easter, time conversion.
- Workspace model, hand-written validation with i18n error keys, and schema migrations.
- GitHub Actions: CI on pull requests and `main`; automatic versioning and release (ZIP of `dist/`) driven by PR labels.
- Contributor documents: CONTRIBUTING, code of conduct, issue and pull request templates.
- Region files with Saxony public and school holidays (core module, JSON data, format docs).
- Recurrence engine: occurrences of events within the horizon (weekly, every n weeks, monthly nth weekday, cadence day, cycle milestone, once), holiday flagging and scaled durations.
- Project license changed to AGPL-3.0-or-later.
- Load calculation: weekly base load per role and category, load per week and person, FTE and threshold warnings.
- Internationalisation: German and English catalogues, `t`, locale detection, date and number formatting, Svelte locale store; app shell text moved to catalogues.
- Accessible app shell: skip link, nine view tabs (WAI-ARIA), language switch, light/dark tokens, reduced-motion support, WCAG contrast helpers, axe checks in e2e, accessibility checklist.
- Fixed: cadence-day validation is 0-based (day 0 is the cadence start) and rejects days beyond the cadence length.
- Fixed: region validation error paths use dot style (`holidays.0.name`).
- Fixed: release workflow has `pull-requests: read` and no longer releases a hotfix for commits without a PR.
- First released version will be 0.1.0 (package version starts at 0.0.0).
