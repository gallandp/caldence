# First start and onboarding: design

Date: 2026-11-10. Status: agreed with the maintainer; each measure is implemented on request.

## Target groups

Agile coaches, Scrum Masters, Product Owners and managers. Three of the four mainly plan for others, often for several teams. The first start therefore assumes a person who plans for a team; their own calendar is optional.

## Current state and gaps

1. A team created from a template has no people. The load view and the per-person export stay empty. People are added under Settings, memberships under Team.
2. Region (de-sn), time zone, planning horizon and weekly hours are set silently.
3. The empty state sends mixed signals: a red "Add team" hint, the welcome card, filters without data, and "Save" as the primary button.
4. Autosave and the purpose of the workspace file are never explained.
5. "Start with an empty workspace" leads to an empty Team view.
6. The "First steps" help needs 11 steps across 6 views.

## Target: user journey

1. **Arrive**: one primary action "Plan new", with "Open file" and "Open example" as secondary actions.
2. **"Plan new" wizard**
   1. Way of working: Scrum, Kanban, SAFe or "No template"; each tile says in one sentence what it brings.
   2. Team: name and cadence start (prefilled as `applyTemplate` does today).
   3. Build the team: enter names per template role (several allowed); optional "I take part as …". Can be skipped.
   4. Confirm the frame: time zone from the browser, region as a suggestion, planning horizon.
3. **Result**: calendar showing the team (or the user's own person, if entered). A one-time hint card with "Adjust meetings", "Share calendars" and one sentence on autosave and the file.
4. **Adjust** meetings; the load view shows the effect.
5. **Share**: .ics per person or role.
6. **Return**: autosave restores everything; the file is only for backup and sharing.
7. **Grow**: "Add another team" runs the same wizard and offers existing people.

Later, outside the wizard: working hours and part time, school holidays, load thresholds, categories, cycles, milestones, assumptions, own templates and regions. Each empty state names exactly one next step.

## Technical approach

- Client-side only, no new dependencies.
- New pure function in `src/core` (for example `setupTeam`): applies the template, creates people and memberships and sets the frame settings. Unit tests.
- The wizard writes everything with one `workspace.apply`, so one Ctrl+Z undoes it.
- UI in `src/ui/setup/`; `StartView` gets simpler.
- WCAG 2.2 AA for every step; axe in E2E.

## Changes (one issue each)

1. Clean up the empty state (release:hotfix).
2. "Plan new" wizard with `setupTeam` (release:minor).
3. Frame step with suggestions for time zone and region.
4. Hint card after setup.
5. "Share calendars" export: several .ics files at once.
6. "Add another team" through the team switcher.
7. Update the "First steps" help, E2E tests and screenshots (part of every change).

Order: 1 and 2 first, then 3 and 4, then 5 and 6.
