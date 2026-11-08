# Accessibility statement

Caldence aims to be usable by everyone who plans team meetings, with a keyboard, a screen reader, zoom, a contrast theme or reduced motion.

## Target

Caldence targets [WCAG 2.2](https://www.w3.org/TR/WCAG22/) level AA, in German and English, in light and dark mode. This statement covers the app (start screen, all views, dialogs and the built-in manual) from version 1.0.

## How it is tested

- **Automated checks in CI.** Every pull request runs axe-core (WCAG 2.0, 2.1 and 2.2 A and AA rules) in every view, in both languages and both colour schemes, and in the dialogs and forms that the end-to-end tests open. A violation fails the build.
- **The accessibility audit.** [`tests/e2e/a11y-audit.spec.ts`](../tests/e2e/a11y-audit.spec.ts) also runs in CI. With the example workspace loaded, it checks every view at 320 and 640 px width (reflow), in forced colours, with reduced motion, and walks from the start screen to an .ics export with the keyboard only. The results and findings are in the [audit report 2026](accessibility/audit-2026.md).
- **Screen readers.** NVDA with Firefox on Windows and VoiceOver with Safari on macOS are tested by hand, with the checklists in the audit report. Their results are recorded there.

## Known limitations

- **Wide tables scroll inside their own area.** At 320 px width (400 % zoom) the month grid and the wide tables (meetings, team members, import review, the tables in the manual) scroll sideways inside a labelled area that you can reach with Tab and scroll with the arrow keys. The page itself does not scroll sideways.
- **File bar icons in contrast themes.** The icons on New, Open, Save and Save as are not shown in Windows contrast themes. The text labels are.
- **Orientation of the view list on narrow screens.** Below about 960 px width the view tabs are shown in one row, but are announced as a vertical list. Both Left / Right and Up / Down move between them.
- **Browsers.** The automated audit runs in Chromium. Firefox and WebKit (Safari) run the file tests in CI, but not the audit.
- **Contrast themes** were checked with Chromium's emulation, not with every Windows contrast theme.

## Report a problem

If something in Caldence is hard or impossible to use for you, please [open a bug report](https://github.com/gallandp/caldence/issues/new?template=bug.yml) and start the title with "Accessibility:". Tell us what you tried to do, what happened, and which browser, operating system and assistive technology (with versions) you use. Problems that fail WCAG 2.2 AA are fixed with priority.
