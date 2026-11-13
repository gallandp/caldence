# Navigation and team people: design

Status: draft for Philipp's approval (2026-11-13).

## Why

Philipp finds the current structure unintuitive:

- "Mitglieder & Takt" mixes two things. Members belong to the team; the cadence belongs to the meetings it drives.
- People and roles are created under Einstellungen, not where members are assigned.
- A person has one weekly working time for all teams. Philipp splits a person's time between teams (Alex: 20 h in Alpha, 18 h in Beta).
- The "Wochen" view and the calendar's "Woche" toggle sound the same. They are different (one week's days in detail vs. one row per week over the whole horizon), but the names do not say so.

He explicitly does not want a rename-only fix: the structure should change, even where that goes below the UI.

## Goals

1. The sidebar answers "what do I want to do" without duplicates: 8 entries instead of 9.
2. Everything about a team's people is in the Team view: create people, give them roles and weekly hours for this team, create roles.
3. Weekly hours are per person per team.
4. A person in several teams stays one person, so cross-team overlaps and their total load stay visible.
5. Takt and cycles live with the meetings.
6. Existing workspace files open unchanged in meaning.

## Non-goals

- No change to how meetings, rules, load or costs are calculated beyond where the weekly hours come from.
- No change to templates' format (templates already carry no people).
- No visual redesign beyond what the moved content needs; reuse the existing card, table and `.segmented` patterns.

## Anti-goals

- Silently losing data on migration (hours, memberships, roles, people without a team).
- Two different "Alex" records when the user meant the same person.
- A Team view so long that members scroll out of sight behind roles and assumptions.

## Approaches considered (for "Wochen")

| | What | Trade-off |
|---|---|---|
| A | Rename only ("Wochenübersicht", "7 Tage") | Cheapest, keeps 9 entries. Rejected by Philipp: not enough. |
| **B (chosen)** | Calendar gets three levels: **Woche · Monat · Zeitraum**. "Zeitraum" is today's Weeks table. | All "when" in one place; touches CalendarView, which another thread is changing. |
| C | Weeks table as a tab inside Auslastung | Groups hours with hours, but the table also shows cadence, milestones and holidays, which are calendar content. |

For people, Philipp chose (decision card, 2026-11-13): **same person across teams, hours per team** over fully separate people per team (which would lose overlaps and total load).

## Navigation (decided)

```
[Team card + Team actions]
ANSEHEN      Kalender (Woche | Monat | Zeitraum)
             Auslastung
PLANEN       Termine & Takt
             Team
             Vorlagen
ARBEITSBEREICH  Einstellungen
             Import / Export
Hilfe
```

Mockups: project files `design/navigation/` (nav.png, detail.png; index.html is the source). The Team card in detail.png shows per-team hours and people without a team.

## Views

### Kalender

- Segmented toggle `Woche | Monat | Zeitraum`; default stays Monat.
- Zeitraum = the current WeeksView content (show-filter All / High load / Cadence, table, current week scrolled into view). Prev/next/today buttons and the period title are hidden in Zeitraum; the caption already names the horizon.
- The role/person filter applies to all three levels as today.
- The `weeks` view id disappears from the sidebar. Any code that switched to `weeks` switches to calendar with level Zeitraum.

### Termine & Takt (was Termine)

- Top: compact Takt line ("Sprint · 2 Wochen · ab 05.01.2027") with an "Ändern" button that expands the existing cadence fields inline.
- Middle: meetings table (unchanged).
- Below: Zyklen & Meilensteine (moved unchanged from the team view), then Kategorien (unchanged).

### Team (was Mitglieder & Takt)

Philipp's mental model (2026-11-13): "I create team, people and roles. Then I assign people with their roles to the team." The view follows that order without forcing a detour:

- **Members of <team>** (top): one row per person in this team: name, roles (one or more, as chips), weekly hours in this team, remove.
- **Add member**: combobox "Person wählen oder neu anlegen" listing all people not yet in this team, plus "Neu: <typed name>" (creates the person and assigns them in one step). Then role(s) (also with "Neu: <role>") and hours (default: Einstellungen › Stunden pro Woche).
- **Personen & Rollen** (below, marked "gelten für alle Teams"): the people list (name; read-only list of their teams with hours and the sum) and the role list, both moved here from Einstellungen with add/rename/delete as today. A person has only a name.
- Renaming a person renames them in every team. Deleting a person removes them from all teams (confirm when in any team; undo as today). Removing a member from a team never deletes the person: people without a team are valid ("create first, assign later").
- **Annahmen**: unchanged, last.

### Einstellungen

- Remove the Personen and Rollen lists. Keep Allgemein (language, region, timezone, Stunden pro Woche as the default for new members and the FTE basis in Auslastung), Arbeitstage, Planungszeitraum, Feiertage überspringen, Auslastungsgrenzen, Kosten.

## Data model

Schema 3 → 4.

- `Person` loses `hoursPerWeek`: `{ id, name }`. `ws.people` stays the identity list (filters, overlaps, load by person).
- A team's membership carries the weekly hours per person: one entry per person per team, with that person's role ids and `hoursPerWeek`. Exact shape is the builder's call; it must allow several roles per person per team (as today) with one hours value.
- Migration 3 → 4: a person's old `hoursPerWeek` is split evenly over their teams (40 h in two teams → 20 h each), so their summed capacity and every FTE warning stay the same. People without a team are kept. The workspace format doc is updated.
- Validation: hours per membership with the same limits as today.

## Load and warnings

- "Above usual" warning: unchanged (per person over all teams).
- "Above FTE" warning and FTE figures follow the filter, so rows and warnings always agree:
  - team filter (the normal case): the person's meeting hours in that team vs. their hours in that team;
  - person filter: their meeting hours over all teams vs. their summed hours over all teams.
- After migration the person-filter numbers equal today's numbers (even split keeps the sum).

## Constraints

- Static app, no server. Files from older versions must open (migration) and the help pages must match.
- Another thread ("Kalender aufs MacBook-Air-Display einpassen") is changing CalendarView's month layout. Calendar work in this design starts after that PR is merged, on top of it.
- i18n: German and English strings for every new label.
- Accessibility rules as elsewhere (segmented group labels, combobox keyboard support, table captions).

## Delivery (proposal)

Separate PRs, each releasable:

1. Data model: per-team hours, migration, load/FTE, Team view with people and roles, Einstellungen trimmed. (`release:minor`)
2. Termine & Takt: move cadence and cycles. (`release:minor`)
3. Calendar levels: Zeitraum replaces the Weeks view; sidebar to 8 entries; help updated. (`release:minor`, after the calendar-layout PR)

## Left to the builder

- Exact membership data shape and how call sites that use `m.roleId` are adapted.
- Combobox implementation details.
- Order of the moved cards within a view, if the mockup's order reads badly at narrow widths.
