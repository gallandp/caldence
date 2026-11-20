# Caldence glossary (UI words)

The words the German and English UI use for the same things. New and changed texts follow this list.
German is the reference; the English UI follows the same split.

## One threshold

There is exactly **one** limit for "too much time in meetings": the Settings value
`thresholds.maxFte` (default 0.6 = 60 % of a person's weekly hours). Every flag, pill, KPI,
column and bar uses it and shows its value ("über 60 %").

- UI name: **Grenze** / **limit**. Settings label: "Grenze: Anteil der Wochenstunden in Terminen"
  (input in percent). Never "FTE" for this value.
- No other share threshold (the prototype's hard-coded 25 % goes).
- **FTE** only means capacity: meeting hours as full-time equivalents (role and total tiles in Terminlast for a {levelTeam} or {levelArea}; not shown with a person chosen). Per-person values are shown as a share in percent, so they compare with the Grenze.
- The second rule (`warnFactor`, default 1.5 × the person's usual load) is a **Lastspitze** /
  **load spike**. It is never called "Überlast" or "Grenze".
- "Spitzenwoche" / "Peak week" stays: the week with the most hours.

## Terms

| DE | EN | Means | Do not use it for |
|---|---|---|---|
| **{levelArea} / {levelTeam}** | same | The two configurable levels. Always via level words when a text names the level or its view. | The file, a generic "group" |
| **{levelOrg}** (Organisation) | **{levelOrg}** (Organisation) | The top level above all {levelAreas} and {levelTeams} (#313). One file is one organisation; its own name is optional. Configurable only with own level names. Avoid articles before it ("Unternehmen" is neuter) | A {levelArea}, the line organisation (separate concept) |
| **Datei** (was Arbeitsbereich) | **file** (was workspace) | The workspace file and everything that applies to all of it | The area level |
| **Person** | person | A human, exists once per file | Membership |
| **Mitglied** | member | Person + role + hours in one {levelTeam} | People in the area only ("Person {levelInArea}") |
| **Eingeladen** | Invited | Roles (and so their people) invited to a meeting; meetings table column (was "Teilnehmer") | — |
| **Einzeln eingeladen** | Invited by name | One person invited to a meeting without their role, from any {levelTeam} (#285). Counts once, with its own share | Members of the {levelTeam} |
| **Rollen für die Termine {levelInArea}** | roles for the meetings in the area | When a {levelTeam} joins a {levelArea} (Choose teams …): which of its roles attends where the {levelArea}'s meetings invite a role "from every team" that the {levelTeam} calls differently, e.g. "Agile Team" → "Entwickler:innen" (#338). One select per role, also from the "fehlt" / "No … in" note on an area meeting, in the structure tree and in the meeting form, with a role of the same or a similar name preselected (#362); "Niemand" / "Nobody" leaves it missing | Renaming or merging roles |
| **Termin** | meeting | A meeting series or single meeting | Export counts ("Terminserien und Einzeltermine") |
| **Takt** | cadence | The rhythm: kind + length + start (Sprint, Flow, PI) | Being in sync |
| **abgestimmt / weicht ab** | aligned / differs | Whether a {levelTeam}'s Takt fits the {levelArea}'s. KPI "Abgestimmt: 2 von 4", pill "Weichen ab: …" | — |
| **Terminlast** | meeting load | Hours in meetings and their share of weekly hours. Sidebar view, page title, KPI (was "Auslastung") | Total workload |
| **Anteil in Terminen** | share in meetings | Every share column / bar | — |
| **über Grenze** | over the limit | A person or week above the one Grenze, judged on all of the person's {levelTeams} and the {levelArea} in every scope: all meetings ÷ all weekly hours (at most the Settings weekly hours, see **Last-Basis**), the same in Warnings, the Calendar, the people table, the {levelArea} Overview and the week detail (#307, #334, #342) | "Überlast" |
| **Stunden {levelInArea}** (Hinweis) | hours in the area (hint) | One line per person and {levelArea} under Warnungen: invited to meetings {levelInArea} without hours set there, or those meetings take more than the Grenze of the hours there. Never a weekly warning | "über Grenze", "Warnung" |
| **Last-Basis** (no UI label) | load base | The weekly hours a person's share in meetings, the Grenze and the Platz bis Grenze are measured against: all their hours in all {levelTeams} and {levelAreas}, at most the Standard-Wochenstunden from Settings. Hours booked beyond a working week never make a person look less loaded; more hours within it can lower the share (#342) | The hours shown as overbooked ("52 h – mehr als 40 h pro Woche") |
| **Platz bis Grenze (Termine)** | room before limit (meetings) | Hours per week that still fit into meetings before the Grenze; negative by how much a person is over it ("−0,2 h über der Grenze", #448) (was "Frei bis Grenze") | Free working time |
| **davon {levelInTeam} / {levelInArea}** | of which in the team / area | People table and the week opened from the area Overview: a person's part in the chosen {levelTeam} or {levelArea} (meetings there ÷ hours there) | The person's share, sort or Grenze |
| **Überschneidung** | overlap | Two meetings of one person at the same time on one day. The calendar marks the day with a person chosen; the {levelArea} Overview counts the days in the next 12 weeks; Meeting load lists one line per person under “Overlapping meetings” (#339), whose example date opens that week in the Calendar (#375). Never a limit or a weekly warning | "Konflikt", "clash", "über Grenze" |
| **Lastspitze** | load spike | A week above warnFactor × usual load | "Überlast", "Grenze" |
| **Kosten** | cost | Meeting hours × rate, always with unit and period (€/Woche, im Planungszeitraum) | — |
| **+ … in Terminen {levelInArea}** | + … in meetings {levelInArea} | Under a {levelTeam}'s cost: what its people also spend in the meetings of its {levelArea}; a person in several {levelTeams} is split by their weekly hours there (#336). Informative, never added to a total | Part of the {levelTeam}'s cost |
| **Planungszeitraum** | planning horizon | Settings horizon; the period for long-term cost | — |
| **entfällt an Feiertagen** | left out on public holidays | A meeting on a public holiday of the region while "Feiertage auslassen" is on: counts no hours, missing from the `.ics` export (EXDATE). Meetings & cadence and the export name these meetings with their dates (#341); the day details say "Entfällt wegen eines Feiertags" | "abgesagt" (a deleted meeting sent as cancelled in a re-export) |

## Two meeting-share numbers (H2)

Same label for two values is not allowed:

- **Termine des {levelTeam}** – meeting hours of the {levelTeam} ÷ the {levelTeam}'s hours (cost / framework comparison).
- **Termine der Personen (alle {levelTeams})** – average over the people in scope, counting all their {levelTeams} and the {levelArea}. The Terminlast people table judges each person this way in every scope.

Where both appear near each other, add a one-line hint saying which scope is counted.

The same holds for the two weekly hour figures in Terminlast:

- **übliche Woche** / typical week – the recurring meetings of one regular week (tiles, Grundlast table, cost per week, the hours and shares of the area Overview cost table). Every person in a role counts; a role without members counts as one person, as for cost (with the default weekly hours in a share, #335).
- **Ø im Planungszeitraum** / Ø in the planning horizon – the average of the real weeks (chart line, people table): one-off meetings count, skipped holidays do not.

A role tile's percentage is **Ø pro Person** / Ø per person: the role's hours ÷ the weekly hours of its people (with a person chosen: that person's load base). FTE stays the capacity number.

## Tabs and page names

- Area tabs: **Struktur | Überblick** (was "Takt & Auslastung"; name by role, not contents).
- "Termine & Takt" stays as a page name (Takt = the rhythm defined there).
