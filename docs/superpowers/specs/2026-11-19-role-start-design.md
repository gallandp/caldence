# Start by role (Caldence 2, #387)

## Why

Caldence 2 maps one organisation from two sides: the product side (organisation → areas →
teams) and the line side (line groups → line teams → people). Different people own different
parts of that picture. Instead of one generic "Plan new" flow, the start screen asks who you are
and sets up *your* level, so several people can fill the same file from their own perspective.
The roles follow the personas (docs/product-vision.md; the concept lives in the project files
under design/personas): agile coach, product owner, area lead (platform owner / head of
department) and people manager (line manager). The order on screen is Philipp's (line first).
It is a way in, not a persona mode: after setup everyone uses the same app.

## What each role creates

| Role | Wizard steps | Creates | Opens |
|---|---|---|---|
| Line management (line manager, team lead, Chapter Lead …) | line teams → frame | optional organisation name, optional group, line teams | the group's or first line team's page |
| Leading several teams (platform owner, head of department, Tribe Lead …) | way of working → structure → frame | level names, one area with its teams | the area page |
| Product ownership (Product Owner, Product Manager …) | the existing team wizard, Product Owner preselected for "I take part myself" | one team with people | calendar + "team is ready" card |
| Agile coaching (Agile Coach, Scrum Master, RTE …) | way of working → structure → frame | level names, organisation name, areas with their teams | the organisation page |

The frame step (time zone, region, horizon) appears only for a file without teams, as before.

## Approaches considered

1. **Extend the existing SetupWizard with a mode** (chosen). The way-of-working step, the start
   date logic (template weekdays, moved-date hint) and the frame step are reused; only one new
   step per mode is added. Smallest change, one consistent dialog.
2. A separate dialog per role: duplicates the frame step and template handling.
3. Role choice that only pre-selects views (no setup): does not answer "create my level".

## Decisions

- Core: `setupStructure` (areas + teams from one template, SAFe-style templates get one area
  cadence per area via a new `applyTemplate` option `joinArea`) and `setupLine` in
  `src/core/setup.ts`. No schema change; level names use the existing presets.
- A file with line units but no teams is no longer "empty": the start screen shows only for a
  file with neither; the views that need a team show their usual "no team yet" state, the line
  page works. The selection falls back to the first line unit when there is no team.
- Team names are typed one per line or comma separated (`splitNames`).
- The chosen role is not stored (out of scope).
- A file with only line teams offers "Plan new", "Set up a unit and its teams" and "Set up
  the product organisation" in the views that need a team, so the product side can follow.
  The frame step is skipped there, since the line manager set it already.
- Cards are named by responsibility, with a muted line of the usual job titles, because
  organisations call these roles differently (Philipp, 2026-11-19).
