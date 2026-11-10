# Contributing to Caldence

Thank you for helping. Caldence is a static web app (TypeScript, Vite, Svelte 5): no server-side logic and no external requests at runtime.

## Setup

Requires Node 22.

```sh
npm ci
npm run dev
```

## Checks

Run before opening a pull request:

```sh
npm run lint && npm run check && npm test && npm run build && npm run e2e
```

For the first e2e run, install the browser with `npx playwright install chromium`.

## Accessibility checklist

Caldence targets WCAG 2.2 AA. Check every UI change against this list:

- Semantic HTML first (landmarks, headings, buttons, labels); add ARIA only where HTML cannot express it.
- Everything works with the keyboard alone, in a logical order, with no keyboard traps.
- Focus is always visible (at least 3:1 contrast) and moves sensibly when views change.
- Every control has a programmatic label, and all text comes from the catalogues (no literal text, also not in `title`, `alt`, `aria-label` or `placeholder`).
- Text contrast is at least 4.5:1 and non-text contrast at least 3:1, in light and dark theme; use the tokens in `src/ui/tokens.css`.
- Never convey information by colour alone; add text, a pattern or an icon with a label.
- Respect `prefers-reduced-motion`: no animation or transition for users who ask for none.
- Run axe (`npm run e2e`) on every new view in both light and dark scheme; it must report zero violations.
- Test both locales (de and en), including text length and `<html lang>`.

## Pull requests

- Branch from `main`, for example `feature/<topic>` or `fix/<topic>`.
- Add an entry under `## Unreleased` in `CHANGELOG.md`. Every PR does this.
- Add tests: unit tests in `tests/unit/`, end-to-end tests in `tests/e2e/`.
- Add exactly one release label. Never change the version by hand; it is bumped automatically on merge.

| Label            | Effect on `Major.Minor.Hotfix`                       |
| ---------------- | ---------------------------------------------------- |
| `release:major`  | 1.2.3 becomes 2.0.0                                  |
| `release:minor`  | 1.2.3 becomes 1.3.0                                  |
| `release:hotfix` | 1.2.3 becomes 1.2.4 (also used when no label is set) |
| `release:none`   | no release (docs, CI, tooling)                       |

## Security

Please report security problems privately, not as an issue. See [SECURITY.md](SECURITY.md).

## Conduct

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Contributions are licensed under the [GNU Affero General Public License v3.0 or later](LICENSE).
