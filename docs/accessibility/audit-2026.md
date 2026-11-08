# Accessibility audit 2026

Audit of Caldence for the 1.0 release (issue #20), November 2026. The target is [WCAG 2.2](https://www.w3.org/TR/WCAG22/) level AA. The public summary is the [accessibility statement](../accessibility.md).

## Scope and method

**In scope:** the whole app as built by `npm run build`: the start screen, the nine views (Calendar, Weeks, Load, Meetings, Team, Workspace settings, Templates, Import / Export, Help), the file bar, the dialogs and the built-in manual. Both languages (German and English) and both colour schemes (light and dark).

**Out of scope:** the GitHub pages (README, releases, issue forms) and the files Caldence writes (.ics, workspace files).

**Method:**

1. An automated audit, `tests/e2e/a11y-audit.spec.ts`, run with Playwright 1.65 in Chromium (Chrome for Testing 153) and axe-core 4.14 with the tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa`. Every check loads the example workspace (`Open the example`) on a fixed day, 17 March 2027.
2. The existing end-to-end tests, which already run axe in each view and dialog they cover (start screen, calendar, meetings, team, settings, templates, import and export, files, manual, weeks and load).
3. A review of the code and of screenshots for what the tests cannot see: states shown only by colour or shape, forced colours, names of scrolling regions.
4. Screen-reader tests by the maintainer, with the checklists at the end of this report. They are not done yet.

The audit spec was written first and run before any fix. Every failure was recorded as a finding below, then fixed or documented.

## Automated results

All 22 tests in `tests/e2e/a11y-audit.spec.ts` pass after the fixes (Chromium).

| Test                                                                                                | What it checks                                                                                                                                                                                                                      | First run                         |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `reflow at 320 px: no horizontal page scroll in any view (de)` / `(en)`                             | Start screen and every view at 320 × 800 CSS px (400 % of 1280): `scrollWidth <= innerWidth`. Every element that scrolls sideways must be reachable by keyboard and named; one that holds a table must be a focusable, named region. | Failed: A-02, A-03                |
| `reflow at 640 px: no horizontal page scroll in any view (de)` / `(en)`                             | The same at 640 px (200 %).                                                                                                                                                                                                         | Failed: A-03                      |
| `reflow at 320 px: the month grid region is focusable and shows a focus outline`                    | The month grid scrolls inside its region, which has `tabindex="0"`, the name "Month grid" and an outline when reached with Tab.                                                                                                     | Passed                            |
| `reflow at 320 px: every table that scrolls is a region reached by Tab with a focus outline`        | Meetings, Team, Help and Import / Export (with the import review of an .ics file open): each view has at least one table region that scrolls; every such region is reached with Tab and shows an outline. Added with the fix for A-03.                                                                                                        | (added later)                     |
| `example workspace: axe passes in every view (de, light)` and the other three combinations          | axe in every view with the example loaded, in both languages and colour schemes. Added after the first run, as the older sweep in `a11y.spec.ts` runs on an empty workspace.                                                        | (added later) Passed              |
| `forced colours: axe passes in every view (de, light)` and the other three combinations             | axe in every view with `forcedColors: 'active'`.                                                                                                                                                                                    | Failed in dark: A-05              |
| `forced colours: focus outlines and the selected tab stay visible (1280 px)` / `(320 px)`           | In forced colours, the focused tab and a focused button keep an outline (`outline-style` not `none`, or a `box-shadow`); the selected tab has a border or an underline that the other tabs lack.                                    | Failed: A-04                      |
| `default colours: the selected view tab has a border or an underline at 320 px` / `800 px` | Below 60 rem, where the bar beside the tab is hidden, the selected tab has a border or an underline that the other tabs lack. | (added later) Failed before A-11 |
| `default colours: pressed view mode, selected day and today differ by more than colour`             | Month / Week, the selected day and today have a border, underline, shadow or shape that the others lack. For the pressed mode only a border or an underline counts.                                                                | (added later) Failed before A-06  |
| `forced colours: pressed view mode, selected day and today differ by more than colour`              | The same in forced colours, where shadows and gradients do not count, as forced colours remove them.                                                                                                                               | (added later) Failed before A-07  |
| `reduced motion: no CSS animation runs after load in any view`                                      | With `reducedMotion: 'reduce'`, `document.getAnimations()` is empty on the start screen and in every view.                                                                                                                          | Passed                            |
| `keyboard only: start screen, example, calendar, day details and export`                            | The walkthrough below, with `keyboard.press` only and the focus asserted after each step.                                                                                                                                          | Failed: A-01                      |

Related checks in other specs: `a11y.spec.ts` (axe in every view in de and en, light and dark; skip link; tab pattern; reduced motion turns off transitions), `start.spec.ts` (axe on the start screen and the template dialog; 375 px), `calendar.spec.ts` (`today is exposed as the current date, not only by its colour`, added with A-08).

## Keyboard walkthrough

Steps of the test `keyboard only: start screen, example, calendar, day details and export`, with where the focus is after each step.

| Step                                               | Keys                              | Focus afterwards                                   | Result           |
| -------------------------------------------------- | --------------------------------- | -------------------------------------------------- | ---------------- |
| Start screen to "Open the example"                 | Tab (skip link, tabs, file bar …) | "Open the example"                                 | Pass             |
| Open the example                                   | Enter                             | The Calendar tab                                   | Fail, then pass (A-01): the focus fell back to the page |
| Move through the views                             | ArrowDown, ArrowRight             | Weeks, then Load; the panel follows                | Pass             |
| Back to the calendar                               | ArrowLeft, ArrowUp                | Calendar tab                                       | Pass             |
| Into the month grid                                | Tab                               | Today's cell (17 March 2027)                       | Pass             |
| Next day                                           | ArrowRight                        | 18 March                                           | Pass             |
| Open the day                                       | Enter                             | Heading of the day details                         | Pass             |
| Close the day                                      | Escape                            | 18 March again; the details are gone               | Pass             |
| Back to the tabs                                   | Shift+Tab                         | Calendar tab                                       | Pass             |
| To Import / Export                                 | End, ArrowUp                      | Help, then Import / Export                         | Pass             |
| To the export button                               | Tab                               | "Export .ics…"                                     | Pass             |
| Export                                             | Enter                             | Stays on "Export .ics…"; the file is downloaded and the status names it | Pass |

The other flows (templates, people, meetings, settings, import review, dialogs) are covered by keyboard steps in their own specs; see the screen-reader checklists for the flows the maintainer still walks by hand.

## Zoom and forced colours

**Zoom and reflow (1.4.4, 1.4.10).** The page never scrolls sideways at 320 and 640 CSS px, in German and English, on the start screen and in every view. The viewport was set by Playwright instead of using the browser zoom; at the same CSS width the layout is the same. Below 60 rem the sidebar becomes a header with the views in one scrolling row, and below 40 rem the file bar wraps. The month grid and the wide data tables (meetings, team members, import review, the tables in the manual) scroll inside their own region: this is the exception WCAG makes for content that needs two dimensions. Each such region can be reached with Tab, is named by its table and shows the focus outline.

**Forced colours (Windows contrast themes).** Tested with Chromium's `forcedColors: 'active'` emulation in light and dark. axe passes in every view. Focus outlines stay. The selected view tab, the pressed Month / Week button, the selected day and today were drawn with gradients and shadows, which forced colours remove; they now get borders and underlines there (A-04, A-07). The icons in the file bar disappear in forced colours (A-09).

**Reduced motion (2.3.3).** No animation runs, and transitions are 0 s. The app defines no CSS animations today, so the reduced-motion test passes trivially; it guards against animations added later.

## Findings

Severity: **serious** blocks a task for some users; **moderate** makes a task harder; **minor** is an inconvenience or affects only a tool. "Fixed" means fixed in this release.

| Id   | WCAG criterion                                                              | Finding                                                                                                                                                                                                                                                                                                                         | Severity | Status     | Fix commit |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | ---------- |
| A-01 | 2.4.3 Focus Order (A)                                                       | "Open the example" and "Open a file…" replace the start screen, and with it the focused button: the focus fell back to the page, and a keyboard user had to start again from the top. Now the current tab gets the focus, as after a template. Also for the "Open the example" button of the empty Weeks and Load views (which said "Open example" before; both now use the same label).         | Serious  | Fixed      | 7275317    |
| A-02 | 2.1.1 Keyboard (A), with 1.4.10 Reflow (AA)                                 | At 320 px the manual's tables (where to set what, keyboard shortcuts, calendar keys) scroll sideways but held nothing focusable, so the hidden columns could not be reached with the keyboard. They are now focusable regions named by their caption.                                                                             | Serious  | Fixed      | 08d434a    |
| A-03 | 2.1.1 Keyboard (A)                                                          | The meetings table and the team members table (and the import review table) scroll sideways at 320 and 640 px. Their buttons and fields could be reached, but not the text columns between them, and the containers had no name. They are now focusable regions named by their caption, like the month grid.                    | Moderate | Fixed      | ee65d5a    |
| A-04 | 1.4.11 Non-text Contrast (AA), in forced colours                            | In forced colours the selected view tab looked like the others: its gradient bar and inset shadow are removed there. It now has a border and an underline in forced colours.                                                                                                                                                   | Moderate | Fixed      | eda5d45    |
| A-05 | 1.4.3 Contrast (Minimum) (AA), in forced colours; a false positive          | In dark forced colours axe read the text of Save and of the primary buttons as #120e33 on black (1.13:1). The text is painted in the system colour, but Chromium keeps the authored colour in `-webkit-text-fill-color`. Not a failure for users; fixed so the automated check is reliable: the accent text token is `ButtonText` there. | Minor    | Fixed      | f058f2d    |
| A-06 | 1.4.11 Non-text Contrast (AA) and 1.4.1 Use of Color (A)                    | The pressed calendar mode (Month / Week) was shown by a slightly lighter pill (about 1.1:1 against the track), a faint shadow and the text colour. It now has a border in the accent colour (at least 3:1). Found by review; the test was added with the fix.                                                                     | Moderate | Fixed      | 5c488e3    |
| A-07 | 1.4.11 Non-text Contrast (AA), in forced colours                            | In forced colours the selected day (inset shadow), today (gradient circle) and the pressed view mode lost their marks. They now get a Highlight border, a ring and an underline there. Found by review of forced-colour screenshots.                                                                                             | Moderate | Fixed      | 5931a6b    |
| A-08 | 1.3.1 Info and Relationships (A)                                            | Today was marked only visually in the month grid. The cell now has `aria-current="date"`. Found by code review.                                                                                                                                                                                                                 | Moderate | Fixed      | 2c3a3d7    |
| A-09 | None (best practice)                                                        | The icons on the file bar buttons (New, Open, Save, Save as) disappear in forced colours, as they are drawn with a background colour and a mask.                                                                                                                                                                                | Minor    | Documented | –          |
| A-10 | None (ARIA practice, related to 4.1.2)                                      | Below 60 rem the view tabs are laid out as a row, but the tab list keeps `aria-orientation="vertical"`.                                                                                                                                                                                                                         | Minor    | Documented | –          |
| A-11 | 1.4.11 Non-text Contrast (AA) | Below 60 rem the bar beside the selected view tab is hidden; what remained was a pill of about 1.6:1 against the sidebar, a lighter text colour and a heavier font weight. The selected tab is now underlined there. Found in the final review; test `default colours: the selected view tab has a border or an underline at 320 px` / `800 px`. | Moderate | Fixed | 756d5d7 |
| A-12 | 1.4.10 Reflow (AA) | With a wider fallback font (DejaVu Sans, the Linux default in CI) the German paging buttons of the calendar ("Voriger Monat", "Heute", "Nächster Monat") did not fit in one row at 320 px and widened the page to 326 px. The button group now wraps. Found by the audit in CI; the local run uses a narrower system font. | Moderate | Fixed | 2980f8a |

Reasons for the documented findings:

- **A-09:** the icons are decorative and every button has a visible text label, so no information or function is lost. Redrawing them as inline SVG with `currentColor` is a later improvement.
- **A-10:** both arrow pairs (Left / Right and Up / Down) move between the tabs in either layout, so keyboard and screen-reader users are not blocked; only the announced orientation can be wrong on narrow screens. Changing the attribute with the layout needs a media-query listener and is left for a later release.

## Limits of this audit

- Screen readers were not tested yet; see the checklists below.
- Only Chromium was used for the audit. Firefox and WebKit run the file tests in CI, not the audit.
- Forced colours were emulated in Chromium, not tested with a real Windows contrast theme.
- Text spacing (1.4.12) and content on hover or focus (1.4.13) were not tested automatically. Caldence has no custom tooltips.
- axe finds about a third to a half of WCAG issues; the rest relies on the review and the manual checks.

## Screen-reader checklist: NVDA + Firefox on Windows

Tester: \_\_\_ · Date: \_\_\_ · NVDA version: \_\_\_ · Firefox version: \_\_\_ · Caldence version: \_\_\_

For each flow, check that every control is announced with its name, role and state, that the focus lands where the next step starts, and that status and error messages are read without moving the focus. Note any problem as a new finding in the table above.

- [ ] Start screen: the welcome heading, the template buttons, "Open a file…", "Open the example" and the two links are announced; opening the example lands on the Calendar tab.
- [ ] Apply template: the dialog is announced with its name; the fields are labelled; "Create team" closes it and the focus is on the Calendar tab.
- [ ] Add person: in Workspace settings, add a person; the new row's fields are announced with the person's name; deleting a person who is in a team asks for confirmation in a dialog.
- [ ] Add meeting: in Meetings, the form "New meeting" is announced; the recurrence fields are labelled; saving announces the result and the meeting is in the table.
- [ ] Calendar day details: the grid is announced as a grid; arrow keys read each day with its holidays, meetings and hours; today is announced as the current date; Enter opens the details and Escape returns to the day.
- [ ] Export: in Import / Export, the scope, period and options are announced; "Export .ics…" saves the file and the status message is read.
- [ ] Import review: after choosing an .ics file, the review table is announced with its caption; the checkboxes and the mapping fields are labelled; the result is read.
- [ ] Error messages: an invalid field (for example an inverted export period) is announced as invalid with its message; a file error on Open is read as an alert.

## Screen-reader checklist: VoiceOver + Safari on macOS

Tester: \_\_\_ · Date: \_\_\_ · macOS version: \_\_\_ · Safari version: \_\_\_ · Caldence version: \_\_\_

Same rules as above.

- [ ] Start screen: the welcome heading, the template buttons, "Open a file…", "Open the example" and the two links are announced; opening the example lands on the Calendar tab.
- [ ] Apply template: the dialog is announced with its name; the fields are labelled; "Create team" closes it and the focus is on the Calendar tab.
- [ ] Add person: in Workspace settings, add a person; the new row's fields are announced with the person's name; deleting a person who is in a team asks for confirmation in a dialog.
- [ ] Add meeting: in Meetings, the form "New meeting" is announced; the recurrence fields are labelled; saving announces the result and the meeting is in the table.
- [ ] Calendar day details: the grid is announced as a grid; arrow keys read each day with its holidays, meetings and hours; today is announced as the current date; Enter opens the details and Escape returns to the day.
- [ ] Export: in Import / Export, the scope, period and options are announced; "Export .ics…" saves the file and the status message is read.
- [ ] Import review: after choosing an .ics file, the review table is announced with its caption; the checkboxes and the mapping fields are labelled; the result is read.
- [ ] Error messages: an invalid field (for example an inverted export period) is announced as invalid with its message; a file error on Open is read as an alert.
