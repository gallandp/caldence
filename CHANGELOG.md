# Changelog

## Unreleased

- Core view data: region registry, workspace holiday index, filtered occurrences, day load, week rows, load summary and per-person conflicts.
- Core edit operations: add, update, move and remove roles, people, categories, teams, cycles and events with reference checks (`error.ref.inuse`); `preparation` is now capped at 1 (fraction).

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
