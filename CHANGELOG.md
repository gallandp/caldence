# Changelog

## Unreleased

- Project setup: Vite, Svelte 5, TypeScript (strict), Vitest, Playwright, ESLint and Prettier.
- Minimal app shell showing the app name and version.
- Core date helpers (UTC-only): parsing, weekday, ISO week, nth weekday of month, Easter, time conversion.
- Workspace model, hand-written validation with i18n error keys, and schema migrations.
- GitHub Actions: CI on pull requests and `main`; automatic versioning and release (ZIP of `dist/`) driven by PR labels.
- Contributor documents: CONTRIBUTING, code of conduct, issue and pull request templates.
- Region files with Saxony public and school holidays (core module, JSON data, format docs).
- Recurrence engine: occurrences of events within the horizon (weekly, every n weeks, monthly nth weekday, cadence day, cycle milestone, once), holiday flagging and scaled durations.
- Project license changed to AGPL-3.0-or-later.
