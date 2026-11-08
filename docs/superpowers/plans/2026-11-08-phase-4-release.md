# Phase 4 Release 1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Caldence 1.0. After this phase:
- Caldence installs as an app and runs offline.
- It runs from any folder of any static web server, including plain webspace such as caldence.de.
- A new user is guided from a start screen to an `.ics` export by the built-in manual.
- An accessibility audit is documented.

This covers issues #18, #19 and #20, plus the open part of #6.

**Architecture:**
- **Two parts, two pull requests.** A parallel design thread is restructuring the UI. Its plan adds a sidebar, a detail column, and a `theme.css` that changes `Shell`, `CalendarView`, `LoadView` and `DayItemList`.
  - **Part A (Tasks 1–4)** does not touch those files and ships first as `release:minor`, which makes it 0.5.0.
  - **Part B (Tasks 5–8)** starts only after the redesign is merged into `main`, because it builds the start screen, the manual, the screenshots and the audit on top of the new UI. It ships as `release:major`, which makes it 1.0.0.
- **PWA.** `vite-plugin-pwa` generates the manifest and a Workbox service worker that precaches every built file. An update prompt in `App.svelte` writes the autosave before reloading.
- **Deployment.** Server configuration ships inside `dist/`: `.htaccess` for Apache and `web.config` for IIS. A separate `deploy/nginx.conf` covers nginx. A CI job serves the release ZIP from a sub-folder in Apache and nginx containers and runs a Playwright smoke test against both.

**Tech Stack:** As phase 3. New dev dependencies, pinned exactly as the repo does: `vite-plugin-pwa` `2.0.0` with its peers `workbox-build` and `workbox-window` (`^7.4.1`; pin the newest 7.x). There is no new runtime dependency besides the generated service worker and `workbox-window`, which the plugin bundles.

**Spec:** `docs/superpowers/specs/2026-11-07-caldence-design.md` (§3 architecture, §9 files, §10 quality, §11 delivery, §13 roadmap)

## Global Constraints

All earlier constraints still apply (see the phase 2 and phase 3 plans):
- Static files only, no server-side logic, no external requests at runtime. The service worker caches only the app's own files.
- `src/core` has no DOM. No user-visible string outside `src/i18n/*.json`. Both catalogues have identical keys. German uses "Sie".
- WCAG 2.2 AA, zero axe violations on every view in de and en, light and dark. Every control has a visible label. Errors are inline (`aria-invalid` and `aria-describedby`). Focus moves only after a successful action.
- Every workspace change is one `apply()` call. Versions are never bumped by hand.

New for phase 4:
- **Relative paths only.** `dist/` works under any path such as `/apps/caldence/`, with or without the trailing slash typed by the user. No file in `dist/` contains an absolute `/` URL to an app asset.
- **No hosting credentials** in the repository or its workflows, and no deploy step. The maintainer uploads the release ZIP by hand.
- **Never lose data on update.** An update is applied only after the user chooses "Reload". The autosave is flushed before the reload.
- **Caching.** `index.html`, `sw.js`, `registerSW.js` and `manifest.webmanifest` are served with `Cache-Control: no-cache`. Files in `assets/` (hashed names) get `Cache-Control: public, max-age=31536000, immutable`. `.webmanifest` is served as `application/manifest+json`.
- **Do not touch the redesign's files in Part A:** `src/ui/Shell.svelte`, `src/ui/views/CalendarView.svelte`, `src/ui/views/LoadView.svelte`, any `DayItemList`, `src/ui/tokens.css` and `src/ui/global.css`. New UI in Part A uses existing classes and has no new global styles.
- **Release.** PR A has the label `release:minor` and ships as 0.5.0. PR B has `release:major` and ships as 1.0.0. Each PR body has one `Closes #N` line per issue, because GitHub closes only the first number of a combined line.

## Review Focus

1. **An open tab while a new version is deployed.** Expected: the user sees "A new version is available" with "Reload" and "Later". Nothing reloads by itself. "Reload" writes the autosave first, then activates the new service worker, so unsaved work survives. Tests are in Task 1, as unit tests of `createUpdate`.
2. **The sub-folder URL without a trailing slash**, for example `https://caldence.de/app`. Expected: the server redirects to `/app/`, and the app loads with all assets. Tests are in Task 2, in the deploy smoke test, for both servers.
3. **The first offline start after an install, then "Open example".** Expected: the app, the example workspace, the regions and the templates all work offline, because they are bundled and precached. Tests are in Task 1, as an e2e with `context.setOffline(true)`.
4. **Old webspace that serves `.webmanifest` as `application/octet-stream` and caches `index.html` for a day.** Expected: the shipped `.htaccess` fixes both. The deployment guide says what to do when `.htaccess` is ignored (`AllowOverride`). Tests are in Task 2, as header assertions.
5. **A region file that is not valid, or that reuses the id of a built-in region.** Expected: an inline translated error, and the workspace is unchanged. A valid file is stored in the workspace, so the workspace file stays self-contained on another device. Tests are in Task 3.

---

# Part A — independent of the redesign (PR A, 0.5.0)

### Task 1: Installable offline app (#18)

**Files:**
- Create: `public/icons/icon.svg`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`, `scripts/icons.mjs`, `src/ui/state/update.ts`, `src/ui/UpdateNotice.svelte`, `tests/unit/update.test.ts`, `tests/e2e/pwa.spec.ts`
- Modify: `vite.config.ts`, `index.html`, `src/ui/App.svelte`, `src/env.d.ts`, `package.json`, `src/i18n/de.json`, `src/i18n/en.json`

**Interfaces:**
- Produces:
  - `createUpdate(register: RegisterFn, beforeReload: () => void): UpdateService`, where `RegisterFn` has the shape of `registerSW` from `virtual:pwa-register`;
  - `UpdateService = { needRefresh: Readable<boolean>; offlineReady: Readable<boolean>; reload(): Promise<void>; dismiss(): void }`;
  - the app singleton `update` exported from `src/ui/state/update.ts`, created with `autosave.flushNow` as `beforeReload`.

**Decisions:**
- **Plugin options.**
  - `registerType: 'prompt'`, `injectRegister: false`, because `update.ts` registers through `virtual:pwa-register`.
  - Workbox `globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest}']` and `navigateFallback: 'index.html'`.
  - No runtime caching rules, because there are no external requests.
- **Manifest.**
  - `name: 'Caldence'`, `short_name: 'Caldence'`, `description: 'Plan the recurring meetings of agile roles and export them to your calendar.'`.
  - `start_url: './'`, `scope: './'`, `display: 'standalone'`, `lang: 'en'`.
  - `theme_color` and `background_color` are the light page background and accent from `tokens.css`, copied as literals.
  - Icons: 192 and 512 with purpose `any`, plus `maskable-512.png` with purpose `maskable`.
- **Icons.**
  - `icon.svg` is a simple calendar glyph on the accent colour.
  - `scripts/icons.mjs` renders it to the three PNGs with Playwright (`npm run icons`). The PNGs are committed, and the build does not run the script.
  - Ruling for the design thread: it may replace `icon.svg` and rerun `npm run icons`.
- **`index.html`.** It gets `<link rel="icon" href="./icons/icon.svg" type="image/svg+xml">` and `<meta name="theme-color">`. The plugin injects the manifest link.
- **`UpdateNotice.svelte`.**
  - It is mounted in `App.svelte` before `<Shell />` and uses only existing classes.
  - With `needRefresh`, it is a `role="status"` region with the text `update.available` ("A new version of Caldence is available.") and two buttons:
    - `update.reload` ("Reload") calls `update.reload()`;
    - `update.later` ("Later") calls `dismiss()`.
  - With `offlineReady`, it shows `update.offline` ("Caldence now also works offline.") with an "OK" button (`update.ok`).

- [ ] **Step 1: Write failing unit tests** in `tests/unit/update.test.ts`, with a fake `register` that captures `onNeedRefresh` and `onOfflineReady` and returns a spy `updateSW`:
  - `needRefresh` is false until `onNeedRefresh()` fires, then true;
  - `reload()` calls `beforeReload` before `updateSW(true)`, checked by call order;
  - `reload()` calls `updateSW(true)` even if `beforeReload` throws;
  - `dismiss()` sets both stores to false;
  - `register` throwing (no service worker support) leaves both stores false and does not throw.
- [ ] **Step 2: Write failing e2e tests** in `tests/e2e/pwa.spec.ts`:
  - the page links a manifest whose JSON has `name` `Caldence`, `start_url` `./`, `display` `standalone`, and an icon of 512×512 with purpose `maskable`;
  - after one reload, `navigator.serviceWorker.controller` is not null;
  - after `context.setOffline(true)` and a reload, the view tabs are visible and "Open example" loads the example workspace;
  - the update notice does not show on a normal start.
- [ ] **Step 3: Run** `npm test -- update && npm run e2e -- pwa`. They are expected to FAIL.
- [ ] **Step 4: Implement.** Add the type reference `vite-plugin-pwa/client` to `src/env.d.ts`.
- [ ] **Step 5: Run** `npm test && npm run lint && npm run check && npm run build && npm run e2e`. They are expected to PASS. Then check that `dist/` contains `sw.js` and `manifest.webmanifest`, and that `grep -rn '"/assets' dist` finds nothing.
- [ ] **Step 6: Commit** `feat: installable offline app with update prompt`.

### Task 2: Web server deployment, release ZIP and smoke test (#18)

**Files:**
- Create:
  - server configuration: `public/.htaccess`, `public/web.config`, `deploy/nginx.conf`, `deploy/apache-test.conf`;
  - `public/README.txt`, `scripts/package.mjs`, `docs/deployment.md`;
  - test setup: `playwright.deploy.config.ts`, `tests/deploy/deploy.spec.ts`.
- Modify: `package.json` (script `package`), `.github/workflows/ci.yml` (job `deploy-smoke`), `.github/workflows/release.yml` (use `npm run package`), `README.md` (link to the guide), `eslint.config.js` and `.prettierignore` if they need the new folders.

**Interfaces:**
- Produces:
  - `npm run package` → `caldence-<version>.zip` in the repo root, containing the contents of `dist/` at the ZIP root. That includes `.htaccess`, `web.config` and `README.txt`, and the ZIP has no `dist/` prefix;
  - `DEPLOY_URLS`, a comma-separated list of base URLs ending in `/`, read by `tests/deploy/deploy.spec.ts`.

**Decisions:**
- **`.htaccess`.** It sets these MIME types:
  - `AddType application/manifest+json .webmanifest`;
  - `AddType text/javascript .js .mjs`.

  It sets the caching rules from Global Constraints with `mod_headers` inside `<IfModule>`, so a server without the module still serves the app. It sets no rewrite rules, because the app has a single page.
- **`web.config`.** It sets the same MIME types and caching for IIS (`staticContent` and `httpProtocol`, plus `<location>` for `assets`).
- **`deploy/nginx.conf`.** It is a `server` block that serves `/apps/caldence/`. It has `types` for `.webmanifest`, the same caching through `location` blocks, and `absolute_redirect off`, so the slash redirect keeps the host. `deploy/apache-test.conf` is the CI-only `httpd` config: it enables `mod_headers` and sets `AllowOverride All` for the htdocs folder.
- **`public/README.txt`.** It is a short guide in English and German: upload all files of the ZIP to any folder of a web server with HTTPS, or run locally with `python3 -m http.server`, then open the folder in the browser. It links to `docs/deployment.md` on GitHub.
- **`docs/deployment.md`.** It covers:
  - requirements: any static server, HTTPS to install the app (localhost works without);
  - plain webspace step by step: download the release ZIP, unzip it locally, upload all files including hidden `.htaccess` by SFTP or the provider's file manager, open the URL;
  - updating: overwrite all files, and users get the "new version" prompt;
  - Apache (`AllowOverride FileInfo Headers Indexes`, or the same directives in the vhost);
  - nginx (include `deploy/nginx.conf`);
  - IIS (`web.config` is included);
  - local use;
  - troubleshooting: wrong MIME type, stale cache, no install button without HTTPS.
- **CI job `deploy-smoke`.** It runs on ubuntu-latest:
  1. `npm ci`, `npm run build`, `npm run package`.
  2. Unzip into `srv/apps/caldence/`.
  3. Start `httpd:2.4` on port 8081, with `srv` as htdocs and `deploy/apache-test.conf` as `httpd.conf`.
  4. Start `nginx:1.28-alpine` on port 8082, with `deploy/nginx.conf` and `srv`.
  5. `npx playwright install --with-deps chromium`.
  6. `DEPLOY_URLS=http://localhost:8081/apps/caldence/,http://localhost:8082/apps/caldence/ npx playwright test -c playwright.deploy.config.ts`.
- **`tests/deploy/deploy.spec.ts`.** It checks for each URL:
  - the URL without the trailing slash ends at the URL with it, and the tab list is visible;
  - the content type of `manifest.webmanifest` contains `application/manifest+json`, and that of an `assets/*.js` file contains `javascript`;
  - `Cache-Control` of `index.html` and `sw.js` contains `no-cache`, and that of the asset contains `immutable`;
  - the service worker controls the page after a reload, and an offline reload still shows the app.
- **Local run.** With no Docker locally, the implementer runs the spec once against `python3 -m http.server` serving `srv/` with `DEPLOY_CHECK_HEADERS=0`, which skips only the header and redirect assertions. CI always runs with headers.

- [ ] **Step 1: Write** `tests/deploy/deploy.spec.ts` and `playwright.deploy.config.ts` (no `webServer`, Chromium, `testDir: 'tests/deploy'`). Make sure the main `playwright.config.ts` does not pick up `tests/deploy`.
- [ ] **Step 2: Run** the spec against the python server as above. It is expected to FAIL on the missing `npm run package`.
- [ ] **Step 3: Implement** the configs, `scripts/package.mjs` (uses `zip -r` like the release workflow does today and fails clearly when `dist/` is missing), the docs and the CI job. In `release.yml`, replace the inline zip with `npm run package`.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run check && npm run build && npm run e2e`, plus the local deploy run. They are expected to PASS. Check with `unzip -l` that the ZIP has `index.html` and `.htaccess` at its root.
- [ ] **Step 5: Commit** `feat: web server configs, release ZIP and deploy smoke test`.

### Task 3: Region files in the app (#6)

**Files:**
- Modify:
  - core: `src/core/model.ts`, `src/core/migrate.ts`, `src/core/validate.ts`, `src/core/regions.ts`, `src/core/edit.ts`;
  - UI: `src/ui/views/SettingsView.svelte`, `src/ui/views/WeeksView.svelte`, the store's region lookup (where `REGIONS` is read for the holiday index);
  - i18n: `src/i18n/de.json`, `src/i18n/en.json`;
  - docs: `docs/region-format.md`.
- Test: `tests/unit/migrate.test.ts`, `tests/unit/regions.test.ts`, `tests/unit/edit.test.ts`, `tests/e2e/settings.spec.ts`, plus a new fixture `tests/fixtures/regions/de-by-sample.json`.

**Interfaces:**
- Consumes: `validateRegion(input: unknown): Result<Region>` and `holidayIndex(region, from, to)` with `beyondKnown`, both from `src/core/regions.ts`.
- Produces:
  - schema 3: `Workspace.customRegions: Region[]` (default `[]`);
  - `MIGRATIONS[2]` adds `customRegions: []`;
  - `resolveRegion(ws: Workspace, id: string): Region | null` in `regions.ts`, which looks up built-in regions first, then custom ones;
  - `addCustomRegion(ws, region): Result<Workspace>` and `removeCustomRegion(ws, id): Result<Workspace>` in `edit.ts`.

**Decisions:**
- **Validation.**
  - A custom region id must not equal a built-in id: `error.region.builtin`.
  - Custom ids must be unique: `error.region.duplicate`.
  - `settings.region` must resolve, using the existing reference error.
  - A region that is in use cannot be removed: `error.region.inUse`.
  - Template files keep loading. Check how `template.ts` checks `schemaVersion`: templates with version 2 must still apply, and templates never carry `customRegions`.
- **Settings view.**
  - Next to the region select there is a button `settings.region.import` ("Import region file…"). It uses `openTextFile(env, [{ description, accept: { 'application/json': ['.json'] } }])`.
  - A valid file is added with one `apply()`, and the select switches to it in the same `apply()`.
  - Errors show inline under the select.
  - Custom regions appear in the select with the suffix `settings.region.custom` (" (imported)"). A "Remove imported region" button appears while a custom region is selected and not in use; in practice that means after switching to another region.
- **Coverage warning.**
  - When the holiday index for the planning horizon has `beyondKnown`, show `region.beyondKnown` in Settings below the horizon fields and at the top of the Weeks view: "School holidays for {region} are known only until {date}. Later school holidays are missing."
  - The message is a plain paragraph with the existing note class, not an alert.

- [ ] **Step 1: Write failing unit tests:**
  - migration 2→3 adds `customRegions: []` and keeps everything else;
  - a schema 2 file loads;
  - `resolveRegion` prefers built-in;
  - `addCustomRegion` rejects a built-in id and a duplicate;
  - `removeCustomRegion` rejects a region in use;
  - `validate` rejects a `settings.region` that resolves nowhere;
  - a schema 2 template still applies.
- [ ] **Step 2: Write failing e2e tests** in `settings.spec.ts`:
  - importing `de-by-sample.json` adds it to the select and selects it;
  - one Ctrl+Z restores the previous region and removes the custom one;
  - importing `src/data/regions/de-sn.json` shows the built-in error;
  - a non-JSON file shows `error.file.json`, and the workspace is unchanged;
  - with the horizon set beyond `schoolHolidaysKnownUntil` of Saxony, the warning shows in Settings and Weeks;
  - axe passes in de and en.
- [ ] **Step 3: Run** `npm test && npm run e2e -- settings`. They are expected to FAIL.
- [ ] **Step 4: Implement.** In `docs/region-format.md`, document how to import a region file and that it is stored in the workspace file.
- [ ] **Step 5: Run** `npm test && npm run lint && npm run check && npm run e2e`. They are expected to PASS.
- [ ] **Step 6: Commit** `feat: import region files and warn when school holidays run out`.

### Task 4: File format docs, README and changelog (Part A wrap-up, #19 docs part)

**Files:**
- Create: `docs/workspace-format.md`, `tests/unit/docs.test.ts`
- Modify: `README.md`, `CHANGELOG.md`, `docs/template-format.md` and `docs/region-format.md` (only if their example fails the new test)

**Decisions:**
- **`docs/workspace-format.md`.** It is written in the style of `template-format.md`:
  - a fields table for schema 3: `schemaVersion`, `id`, `settings`, `roles`, `people`, `categories`, `customRegions`, `teams`, with team, event, rule and cycle sub-tables;
  - the rule types with an example each;
  - migrations, which happen on load, while newer versions are rejected;
  - privacy, because the file holds names and lives only where the user saves it;
  - a complete small `json` example.
- **`tests/unit/docs.test.ts`.** It extracts the first ` ```json ` block of each format doc and checks it:
  - `workspace-format.md` with `loadWorkspace`;
  - `template-format.md` with `loadTemplate`;
  - `region-format.md` with `validateRegion`.

  Each must be `ok`, so the docs cannot go stale.
- **README.** It gets:
  - a feature list: teams and roles, recurring meetings with rules, calendar, weeks and load, templates, `.ics` export and import, offline app, German and English, accessibility;
  - a quick start: use it at caldence.de, or download the release ZIP and follow `docs/deployment.md`;
  - links to the three format docs.

  Screenshots come in Task 7. Status line: "Status: phase 4 – release preparation (installable app, deployment)".
- **CHANGELOG.** `## Unreleased` gets one entry for #18 and one for the region import (#6).

- [ ] **Step 1: Write** `tests/unit/docs.test.ts`. Run it: it is expected to FAIL, because `workspace-format.md` is missing.
- [ ] **Step 2: Write** the docs, the README and the CHANGELOG.
- [ ] **Step 3: Run** `npm test && npm run lint`. They are expected to PASS.
- [ ] **Step 4: Commit** `docs: workspace format, README features and quick start`.

**PR A.** Merge `main` if needed and open the PR from `feature/phase-4a-pwa-deploy` with the label `release:minor`. The PR body has `Closes #18` on its own line and mentions #6 without closing it, because the Saxony data check is still open. CI must be green, including `deploy-smoke`.

---

# Part B — after the redesign is merged (PR B, 1.0.0)

Before Task 5, merge the current `main` into a fresh branch `feature/phase-4b-release-1-0`. Then read the new `Shell.svelte` and `theme.css`. Place the new UI in the redesign's structure, for example inside its main content area, and use its classes. The behaviour below is binding; the layout follows the redesign.

### Task 5: Start screen (#19)

**Files:**
- Create: `src/ui/views/StartView.svelte`, `tests/e2e/start.spec.ts`
- Modify: the shell (where the calendar empty state is chosen today), `src/i18n/*.json`

**Interfaces:**
- Consumes:
  - `BUILTIN_TEMPLATES` and `builtinTemplate` from `src/data/templates`;
  - the apply dialog of `TemplatesView`; extract it into `src/ui/templates/ApplyDialog.svelte` if it is not reusable as is;
  - the Open handler of the workspace bar;
  - the example loader.

**Decisions:**
- **When it shows.** The start screen shows instead of the active view's content whenever the workspace has no team and the active view is the default (calendar) view. That covers first start, after New, and after deleting the last team. The other views stay reachable and keep their own empty states.
- **Content.**
  - The heading `start.title` ("Welcome to Caldence") and one sentence `start.intro`.
  - Three actions, in this order:
    1. "Start from a template": one button per built-in template in the UI language, opening the apply dialog.
    2. "Open a file…": the same as Open in the workspace bar.
    3. "Open the example": loads the example workspace.
  - A text link "Start with an empty workspace" switches to the Team view.
  - A link "Read the manual" switches to Help.
- **Focus.** After a team is created from a template, focus moves to the new team's first view, as in the Templates view.

- [ ] **Step 1: Write failing e2e tests:**
  - a fresh start shows the heading;
  - each template button opens the dialog, and creating the team replaces the start screen with the calendar;
  - "Open the example" shows the example teams;
  - New after a change, followed by Discard, shows the start screen again;
  - axe passes in de and en, light and dark, and at 375 px.
- [ ] **Step 2: Run** `npm run e2e -- start`. It is expected to FAIL.
- [ ] **Step 3: Implement.** Update the existing tests that expect the old calendar empty state.
- [ ] **Step 4: Run** the full suite. It is expected to PASS.
- [ ] **Step 5: Commit** `feat(ui): start screen with template, open and example`.

### Task 6: Built-in manual (#19)

**Files:**
- Create: `src/ui/help/` (one component per manual section), `src/ui/help/steps.ts`, `tests/e2e/manual.spec.ts`
- Modify: `src/ui/views/HelpView.svelte` (becomes the manual with a table of contents), `src/i18n/*.json`, `tests/e2e/flow.spec.ts` (help table count)

**Interfaces:**
- Produces: `MANUAL_STEPS: { text: string; control: { role: 'button' | 'tab' | 'link'; name: string } | null }[]` in `src/ui/help/steps.ts`.
  - `text` and `control.name` are i18n keys.
  - Each step's text inserts the control's label through a placeholder `{control}`, so the manual always names the real label.

**Decisions:**
- **Sections, in order:**
  1. **First steps.** The steps of `MANUAL_STEPS`, from the start screen to an `.ics` export: start from the Scrum template, add a person in Workspace settings, make them Product Owner in Team, check the meetings, look at Calendar and Load, then export the person in Import / Export.
  2. **The views,** one subsection each: Calendar, Weeks, Load, Meetings, Team, Workspace settings, Templates, Import / Export.
  3. **How the load is calculated.**
     - The duration scales as `base + perUnit × assumption`, rounded to the rounding grid.
     - Each role takes its share, and preparation is added as a percentage.
     - Meetings on public holidays are skipped when "Skip public holidays" is on.
     - Hours per week are averaged over the horizon.
     - FTE = hours ÷ hours per week of the person.
     - Warnings appear above the FTE limit or the warning factor × average.
     - Use the exact setting names from the catalogue.
  4. **Settings or assumptions?** (existing)
  5. **Templates** (existing)
  6. **Files and autosave** (existing)
  7. **Import into your calendar** (existing)
  8. **Keyboard** (existing tables)
  9. **Accessibility:** one paragraph and a link to `docs/accessibility.md` on GitHub (Task 8).
- **Table of contents.** It is a `nav` with in-page links. Each section is a `section` with `aria-labelledby`.

- [ ] **Step 1: Write the failing e2e test** "the manual alone gets a new user to an .ics export".
  - For each locale (de and en), on a fresh start, read `MANUAL_STEPS` from the rendered manual: each step is an `li` with `data-control-role` and `data-control-name` attributes holding the translated label.
  - Then go back and, for each step with a control, activate `getByRole(role, { name, exact: true })` (fill fields where the step says so, through a small map in the test keyed by step index).
  - Expect a download whose name ends in `.ics` and contains `BEGIN:VEVENT`.
  - Add a second test: every heading of the table of contents exists, and axe passes.
- [ ] **Step 2: Run** `npm run e2e -- manual`. It is expected to FAIL.
- [ ] **Step 3: Implement** the sections, both languages, and `steps.ts`.
- [ ] **Step 4: Run** the full suite. It is expected to PASS.
- [ ] **Step 5: Commit** `feat(help): built-in manual with guided first steps`.

### Task 7: Generated screenshots and README (#19)

**Files:**
- Create: `scripts/screenshots.mjs`, `docs/screenshots/*.png`
- Modify: `package.json` (script `screenshots`), `.github/workflows/ci.yml` (step), `README.md`

**Decisions:**
- **The script.**
  - `scripts/screenshots.mjs [--out <dir>]` builds nothing itself. It starts `vite preview` on a free port, opens the example workspace with the clock fixed at `2027-01-13T09:00`, and writes these PNGs at 1280×800 and deviceScaleFactor 2:
    - the start screen;
    - Calendar month view with a day opened;
    - Weeks;
    - Load filtered to one person;
    - Meetings;
    - Templates;
    - Import / Export with the export form;
    - Help.
  - It writes each image in `en` and `de`, light, plus Calendar in dark.
  - Names follow `<view>-<locale>[-dark].png`. The default `--out` is `docs/screenshots`.
- **CI.** CI runs `npm run screenshots -- --out "$RUNNER_TEMP/shots"` after the build, so the script cannot rot. It does not commit the images.
- **README.** It shows `calendar-en.png`, `load-en.png` and `exchange-en.png` near the top, with alt text. The German images are linked in a short "Screenshots" section.

- [ ] **Step 1: Write** the script, then run `npm run build && npm run screenshots`. Expected: 17 files (8 views × 2 locales + 1 dark), each larger than 20 KB. Look at three of them yourself.
- [ ] **Step 2: Update** the README and CI.
- [ ] **Step 3: Run** `npm run lint`. It is expected to PASS.
- [ ] **Step 4: Commit** `docs: generated screenshots in the README`.

### Task 8: Accessibility audit and 1.0 release (#20)

**Files:**
- Create: `tests/e2e/a11y-audit.spec.ts`, `docs/accessibility.md`, `docs/accessibility/audit-2026.md`
- Modify: components only where the audit finds a blocking issue; `README.md`, `CHANGELOG.md`

**Decisions:**
- **Automated audit (`a11y-audit.spec.ts`).** For every view, with the example workspace loaded:
  - **Reflow at 320 × 800 CSS px** (400 % of 1280): no horizontal page scroll (`document.documentElement.scrollWidth <= innerWidth`). Wide tables may scroll inside their own container, which needs `tabindex="0"`, a label and a focus outline.
  - **640 px width** (200 %): the same check.
  - **Forced colours** (`page.emulateMedia({ forcedColors: 'active' })`): axe passes. The focused tab and a focused button keep a visible outline, meaning computed `outline-style` is not `none` or a `box-shadow` is set. The selected tab differs from the others by more than colour (a border or underline).
  - **Reduced motion**: with `reducedMotion: 'reduce'`, no element has a running CSS animation (`document.getAnimations().length === 0` after load).
  - **Keyboard-only flow**: start screen, then "Open the example", then the calendar. It moves through the tabs with the arrow keys, opens a day with Enter, closes with Escape, goes to Import / Export, and exports with Enter. Only `keyboard.press` is used, and each step asserts where focus is.
- **Report (`docs/accessibility/audit-2026.md`).** It covers:
  - scope and method;
  - the automated results with the test names;
  - keyboard walkthrough results;
  - zoom and forced colours;
  - a findings table (id, WCAG criterion, severity, status, fix commit);
  - two empty checklists for the maintainer: NVDA + Firefox on Windows, and VoiceOver + Safari on macOS. Each lists the flows to try: start screen, apply template, add person, add meeting, calendar day details, export, import review, and the error messages.
- **Statement (`docs/accessibility.md`).** It covers:
  - the target, WCAG 2.2 AA;
  - how it is tested (axe in CI, the audit);
  - known limitations from the report;
  - how to report a problem (GitHub issue form).
- **Blocking findings.** Fix every finding that fails a WCAG A or AA criterion in this task. Document the rest with a reason.
- **Release.** README status line: "Status: 1.0". CHANGELOG `## Unreleased` gets entries for #19 and #20. PR B has the label `release:major`, so it ships as 1.0.0.

- [ ] **Step 1: Write** `a11y-audit.spec.ts`. Run it and record every failure as a finding.
- [ ] **Step 2: Fix** the blocking findings, with one commit per finding, each named `fix(a11y): <criterion> <what>`.
- [ ] **Step 3: Write** the report and the statement.
- [ ] **Step 4: Run** the full suite. It is expected to PASS.
- [ ] **Step 5: Commit** `docs: accessibility audit and statement`.

**PR B.** Open the PR from `feature/phase-4b-release-1-0` with the label `release:major`. The PR body has `Closes #19` on its own line and `Closes #20` on another. Before merging, the maintainer fills in the two screen-reader checklists in the report, and any blocking finding from them is fixed in this PR. The PR body says so at the top.
