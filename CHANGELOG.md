# Changelog

## Unreleased

## 1.19.0 – 2026-11-13

### Changed

- Load warnings that mean something (#119)

## 1.18.0 – 2026-11-13

### Changed

- Narrow screens: the views, language, appearance and links open from a menu button that shows the current view, instead of a sideways-scrolling row that hid most views
- Calmer sidebar: thin dividers instead of the three group headings, and language and appearance side by side in one row
- Load warnings ignore peaks that come back with the cadence, such as every sprint start, show one line per person with the threshold explained, and sit at full width below the chart; Weeks calls them “Load warning” too. The example's kick-off workshop now takes 4 hours

## 1.17.0 – 2026-11-13

### Changed

- The role and person filters appear only above Calendar, Weeks and Load, where they apply; Load explains that the per-person table covers all teams

## 1.16.0 – 2026-11-13

### Changed

- Consistent cards, widths and spacing (#109)

## 1.15.0 – 2026-11-13

### Added

- Appearance switch below the language: match the system (default), light or dark, remembered in this browser

### Changed

- Calmer cards: no accent line on top, every view uses the full width, no extra space above the first heading or below an empty status line, load tiles line up their values, and the version moved from the sidebar header to its footer
- "+ Add" buttons and colour labels look the same in all lists

## 1.14.0 – 2026-11-12

### Added

- Optional hourly rate in the settings: with it, Meetings shows a cost column and a costs card, and Load shows the costs card with the weekly and horizon totals and the cost per category; without it, no costs are shown

## 1.13.0 – 2026-11-12

### Changed

- Members & cadence: two columns of cards; members show their initials in the role colour with a link to the settings, each cycle shows its milestones on the planning horizon, and add rows use quieter buttons

## 1.12.0 – 2026-11-12

### Changed

- Calendar: icon buttons to page through the months, holidays, school holidays, the cadence and milestones as coloured tags, the day details open next to the day with time, rule and roles and an Edit button that opens the meeting, a legend of the categories, and the week view lists the meetings of each day side by side

## 1.11.0 – 2026-11-12

### Changed

- Load: summary tiles for the total, each role and the peak week, a chart of the hours per week with the average and warning weeks, and one warning line per person and kind of warning

## 1.10.0 – 2026-11-11

### Changed

- Weeks: events are coloured tags in one column, weeks with a high load are named, the total has a bar, and quick filters show only weeks with a warning or a cadence start

## 1.9.0 – 2026-11-11

### Changed

- Meetings: each row shows when it takes place, the next date and the participants as role chips; actions are icons with tooltips, and a filter narrows the list

## 1.8.0 – 2026-11-11

### Changed

- View title and "Show for" filters in one row on wide screens (#88)

## 1.7.0 – 2026-11-11

### Changed

- Sidebar: the team is chosen at the top, its actions sit behind one button; views are grouped and "Team" is now "Members & cadence"
- Save is highlighted only while there are unsaved changes; "Saved" shows in green
- Footer with imprint, privacy and a link to the source code on GitHub
- Start screen: a clearer welcome with one main action, "Plan new", and tiles to open a file or the example
- New logo: a calendar with a heartbeat line
- On wide screens the view title and the "Show for" filters share one row

## 1.6.1 – 2026-11-11

### Changed

- Setup: fix styling and name suggestions in "Plan another team" (#83)

## 1.6.0 – 2026-11-11

### Changed

- Team: plan another team with the wizard (#80)

## 1.5.0 – 2026-11-11

### Fixed

- Deployment: when the SFTP login fails, the log now says why (for example "Host key verification failed" or "Permission denied") instead of only "Connection closed".

## 1.4.0 – 2026-11-11

### Added

- Imprint and privacy page: when the operator puts `imprint.html` or `privacy.html` next to the app, the sidebar shows a link to it. The pages are never part of the release (see `docs/deployment.md`, with a template).
- Deployment: after each release, a separate workflow uploads it to caldence.de by SFTP once the maintainer approves the run. It checks the release's checksum and attestation, uploads the entry points last, keeps the previous release's files for one more deployment and deletes only files an earlier deployment uploaded, never touches the imprint or privacy page, and then runs the smoke test against the live site. It can be started by hand with any published version.

## 1.3.0 – 2026-11-11

### Fixed

- Release: the release workflow approves the held CI runs of its release PR, and the release PR merges itself from that run. Before, the required check only counted after someone clicked "Approve workflows to run".

## 1.2.0 – 2026-11-11

### Changed

- Release: the release PR is merged automatically as soon as CI is green on it, and the release is then published without a click. It is only merged when it holds nothing but the version commit of the release workflow.
- CI: the main check runs in Playwright's container image with the browsers preinstalled, so it no longer spends minutes installing browsers.

## 1.1.1 – 2026-11-10

### Fixed

- Release: when no changelog entry was written since the last release (for example only Dependabot updates), the release PR lists the merged PRs instead of an empty section that made its CI fail.

## 1.1.0 – 2026-11-10

### Security

- Load and weeks (#40): ids such as `__proto__`, `constructor` or `toString` from a workspace or template file no longer change `Object.prototype` or produce wrong numbers. Hours are counted in records without a prototype, an assumption is only read when the team has it, and the calendar import review no longer uses a raw UID as key.
- Large files (#41): a workspace, template or region file can no longer freeze the app. Files above 5 MB are refused before they are read, all dates must be in the years 1900 to 2200, the planning horizon may be at most 5 years long, and there are upper limits for the number of meetings (500 in all), teams, people and other lists, for text lengths and for numbers such as durations and cadence lengths (see `docs/workspace-format.md`). A stored workspace beyond these limits is not restored but kept as a backup. Adding `?reset` to the address starts with an empty workspace in any case.
- Release and CI workflows (#43): actions are pinned to commit SHAs. The release no longer pushes to the protected `main`: merging a PR with a release label opens or updates a release PR with version and changelog, and merging that PR builds the release in a job with a read-only token and publishes it from a separate job without npm. Releases now include a SHA-256 file and a build provenance attestation (see `docs/deployment.md`). Workflow values reach scripts through environment variables, every job has a time limit, and `npm ci` runs without install scripts.
- Security headers (#42): the release sends a Content Security Policy (only the app's own files, no inline scripts or styles, no framing), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy` through `.htaccess`, `web.config` and the nginx example, and `index.html` carries the policy as a `<meta>` tag for hosts without headers. `README.txt` and `web.config` are no longer served. `docs/deployment.md` explains HTTPS redirect, HSTS and a single host name, which are set by the host.
- Security policy (#44): `SECURITY.md` explains how to report a vulnerability privately and what to expect. Dependabot proposes weekly updates for npm packages and GitHub Actions, CodeQL scans the code and the workflows, and CI fails on high or critical `npm audit` advisories.

## 1.0.2 – 2026-11-10

### Security

- Calendar export (#39): ids from a workspace or template file can no longer add lines to an exported .ics file. Ids must now be 1 to 64 characters from `A–Z`, `a–z`, `0–9`, `.`, `_` and `-`; files with other ids are rejected with a message naming the id. The export also removes control characters from every line and quotes the time zone where needed. Ids the app creates itself always had this form.

## 1.0.1 – 2026-11-08

### Changed

- German interface: one term each for FTE (instead of "VZÄ" in the settings) and for the cadence ("Takt" instead of "Taktung").

## 1.0.0 – 2026-11-08

### Added

- Start screen (#19): a workspace without teams shows a welcome page on the Calendar view with the built-in templates, Open a file, the example and links to an empty workspace and the manual.
- Built-in manual (#19): the Help view has a table of contents, guided first steps from the start screen to an .ics export that name the real button and tab labels, a chapter on every view, how the load is calculated, and a section on accessibility. All help texts were brought up to date with the current views.
- Screenshots (#19): `npm run screenshots` generates the README images in English and German (and the calendar in dark mode) from the built app; CI runs it so the script stays working.
- Accessibility audit (#20): an automated audit checks every view at 320 and 640 px width, in forced colours (Windows contrast themes) and with reduced motion, and walks from the start screen to an .ics export with the keyboard only. The results are in `docs/accessibility/audit-2026.md`, and the accessibility statement (`docs/accessibility.md`) describes the target (WCAG 2.2 AA), the tests, known limitations and how to report a problem.

### Fixed

- Accessibility (#20): after opening the example or a file from the start screen, the focus moves to the Calendar tab instead of the page; wide tables (meetings, team members, import review and the manual) can be scrolled with the keyboard; the pressed Month or Week button has a border; today is announced as the current date in the month grid; in forced colours the selected view, the selected day, today and the view mode stay visible; on narrow screens the selected view is underlined.
- Calendar: all seven days of the month stay visible beside the day details on a laptop screen.
- The empty Weeks and Load views use the same label for opening the example as the start screen.

## 0.6.0 – 2026-11-08

### Added

- Installable app (#18): Caldence can be installed from the browser and works offline after the first visit; a prompt offers the new version when an update is available.
- Deployment (#18): the release ZIP includes ready-made server configurations, and a deployment guide (`docs/deployment.md`) explains how to host Caldence yourself.
- Region file import (#6): import a region file with holidays in the workspace settings; it is stored in the workspace file and can be removed again.
- Warning when school holidays are not known for the planning horizon, and a hint when a workspace uses an unknown region (#6).
- Documentation of the workspace file format, with examples that are checked by the tests, and a feature list and quick start in the README.

### Changed

- Workspace files use schema 3 (adds `customRegions`); older files are upgraded when opened.
- The Help view now covers installing the app and importing region files.

## 0.5.0 – 2026-11-08

### Changed

- New look: a dark sidebar with icons for the views, a top bar with Save as the main button, cards for every view, and a refreshed colour scheme in light and dark mode. On narrow screens the sidebar becomes a header.
- The month calendar shows each day's meetings as chips in their category colour, marks today, school holidays and non-working days, and opens the day details next to the grid on wide screens.
- The load view shows category colours and a bar for each role's share of the working week.

## 0.4.0 – 2026-11-08

### Added

- Templates (#15): apply the built-in Scrum, Kanban and SAFe templates in German or English, and import or export your own template files. Templates hold roles, cadence, categories and meetings, but no people.
- Calendar export (#16): export a team, role or person as an .ics file for a chosen period, with optional holidays, school holidays, milestones and reminders. Includes a manual check list for Outlook, Google Calendar and Apple Calendar (`docs/manual-checks/ics-import.md`).
- Calendar import (#17): import meetings from an .ics file (for example from Outlook) after a review that shows what is imported, already present or left out, with a mapping to team, roles and categories.
- Help sections for templates and for importing the .ics file into Outlook, Google Calendar and Apple Calendar.

### Fixed

- German: the hint to add a category before adding meetings now uses the formal "Sie" like the rest of the app.

## 0.3.0 – 2026-11-07

### Added

- Meetings on selected weekdays, for example a Daily Scrum Monday to Friday: new repeat rule "Selected weekdays" with a summary such as "On Monday to Friday" (#15).
- Every workspace has its own id (schema 2), so later calendar exports get stable, collision-free event ids. Older files are upgraded on open.

### Fixed

- Autosave no longer loses the last change when the page is reloaded or closed while that change is still being written.

## 0.2.0 – 2026-11-07

### Added

- Open, save and autosave workspace files (#14): workspace bar (New, Open, Save, Save as), File System Access API with download/upload fallback, unsaved-changes dialog, keyboard shortcuts (Ctrl/Cmd+S, Shift+S, O, Z), IndexedDB autosave with restore after reload, and an example workspace.
- Editing (#9, #10, #11, #12): core edit operations for roles, people, categories, teams, cycles and events with reference checks (`error.ref.inuse`); workspace store with undo (50 steps), dirty flag and file name; form error mapping.
- Workspace settings view (#9, #11): language, region, time zone, workdays, hours, horizon, holidays, thresholds, and editable roles (with colour) and people; deleting a role that is in use asks for a replacement.
- Teams and team view (#10, #11): team switcher (add, rename, duplicate, delete), role and person filter, and per-team members, cadence, cycles with milestones and assumptions.
- Meetings view (#12): event table (rule summary, time, effective duration, roles), inline event form for all six rule types with scaling, participants and preparation in %, categories with colour and replace-on-delete, and undo.
- Calendar view (#13): month grid (APG grid keyboard pattern) with holidays, school holidays, cadence starts, milestones, hours and meeting count per day, week view, navigation, inline day details with person-overlap warnings, and empty-state hints.
- Weeks and load views (#13): weekly table (ISO week, cadence, milestones, holidays, school holidays, hours per role, current week marked) and load tables per category and role, per role and per person with warnings.
- Core view data (#10, #13): region registry, workspace holiday index, filtered occurrences, day load, week rows, load summary and per-person conflicts.
- Help view (#10, #11, #14) in German and English: first steps, where each setting lives (workspace settings or team view), files and autosave, keyboard shortcuts for the platform, and calendar keys; a combined end-to-end test covers the flow from an empty workspace to Save as, reload and Open.

### Changed

- The UI language is now a workspace setting.
- `preparation` is capped at 1 (a fraction); the UI shows and edits it as a percent.
- The person filter scopes cadence and milestones to the teams of the person (shared `scopeTeams`), and `loadSummary` returns a category by role matrix.
- The example team now has a scaled meeting.
- README status updated to phase 2.

### Fixed

- Deleting a role, category, person, cycle or assumption that is still used asks for a replacement or is refused; a used assumption or milestone cannot be removed, and renaming an assumption updates scaling rules.
- Keyed lists no longer crash when milestone names, milestone ids or cadence labels repeat; a workspace file with a duplicate team member (person and role) is rejected; each view has an error fallback so one failing view cannot lock the app.
- After Save in the unsaved-changes dialog, a refused file picker shows a hint instead of a read error; a file dialog that never reports cancel no longer blocks the file buttons.
- Autosave restore migrates the stored workspace before validating it.
- Ctrl/Cmd+S and Ctrl/Cmd+O commit the field being edited first; Ctrl/Cmd+Z is ignored inside forms and while a meeting draft is open.
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
