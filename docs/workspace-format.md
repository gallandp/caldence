# Workspace format

A Caldence workspace is one JSON file, usually named like `plan.caldence.json`. It holds everything you plan: settings, roles, people, categories, teams, areas and their meetings. The current schema version is `7`.

Caldence 2, built on the branch `release/v2` and served at `/v2/` (#344), writes *format 2*: `schemaVersion` is 1000 plus the schema it is based on (for example `1007`). Caldence 1.x does not open such a file and says that it belongs to Caldence 2, so the new data is never dropped on save. Caldence 2 opens files of both formats.

## Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | integer | Schema version of the file (`7`). |
| `id` | string | Stable id of the workspace (a UUID); used for stable ids in calendar exports. |
| `settings` | object | See below. |
| `roles` | list of `{ id, name, colour }` | Roles such as Product Owner. `colour` is `#rrggbb`. |
| `people` | list of `{ id, name }` | People. A person can be a member of several teams. |
| `categories` | list of `{ id, name, colour }` | Event categories. |
| `customRegions` | list of regions | Region files imported into this workspace (see [region-format.md](region-format.md)). An id must not equal a built-in region id or another imported one. |
| `teams` | list of teams | See below. |
| `areas` | list of areas | Groups of teams (shown as "Bereich" / "Area" by default). See below. May be empty. |
| `organisation` | object, optional | The organisation the file maps, the top of the tree organisation → areas → teams: `{ "name": "Nordwind GmbH" }` (a string of at most 200 characters). One file is one organisation; without this entry the app shows the level's name ("Organisation"). Older app versions ignore it. |
| `view` | object, optional | Where the app was looking when the file was saved, so it opens there again: `unit` (id of the selected team or area, or `@organisation` for the organisation), `page` (`calendar`, `load`, `meetings`, `team`, `templates`, `settings`, `exchange` or `help`) and `areaPage` (`structure` or `overview`). All three are optional strings of at most 64 characters; unknown or malformed values are ignored on open (a malformed `view` does not keep the file from opening). Choosing another view does not count as a change to save; the autosave follows it, also after presenting. |

All ids (the workspace `id` and the ids of roles, people, categories, teams, areas, cycles, milestones and events) are 1 to 64 characters from `A–Z`, `a–z`, `0–9`, `.`, `_` and `-`, and unique within their list. A file with any other id is rejected. Dates are `YYYY-MM-DD`, times `HH:MM`, both local; durations are whole minutes.

### `settings`

| Field | Type | Meaning |
| --- | --- | --- |
| `locale` | `"de"` or `"en"` | Language of the app. |
| `region` | string | Id of a built-in or imported region. An unknown id still loads, but then no holidays are used. |
| `timezone` | string | IANA time zone, for example `Europe/Berlin`. |
| `workdays` | list of 1-7 | Working weekdays, Monday is 1, Sunday is 7. Not empty, no duplicates. |
| `hoursPerWeek` | number | Default working hours per week, above 0. A team member without an entry in `memberHours` has these hours. The app also uses them as the weekly limit: a person whose hours in all teams and areas add up to more is flagged, and adding a person to one more team proposes the hours left. |
| `horizon` | `{ from, to }` | Planning period; `to` is not before `from`. |
| `skipHolidays` | boolean | Skip meetings that fall on a public holiday. |
| `thresholds` | `{ warnFactor, maxFte }` | Both above 0. `maxFte` is the one limit for meetings: a share of a person's weekly hours (0.6 = 60 %, shown in percent in Settings). `warnFactor` flags a load spike: a week above this many times the usual load. |
| `hourlyRate` | number, optional | Euros per person and hour, above 0. With it, Meetings and Meeting load show what meetings cost; without it, no costs are shown. |
| `levelNames` | object, optional | What the workspace calls its two levels (an area and its teams). Either `{ "preset": … }` with one of `area` (Bereich/Team), `department` (Abteilung/Team), `platform` (Plattform/Produkt), `chapter` (Chapter/Unit), `train` (Release Train/Team), or own names `{ "area": "Cluster", "team": "Squad" }`, both non-empty; own names may add `"organisation": "Konzern"` for the top level (non-empty; without it "Organisation"). Without it: `area`. |

### Team

| Field | Type | Meaning |
| --- | --- | --- |
| `id`, `name` | string | Identity and display name. |
| `templateId` | string, optional | Id of the template the team was created from. |
| `cadence` | `{ kind, lengthWeeks, start }` | `kind` is `sprint`, `flow` or `pi`; `lengthWeeks` is an integer from 1; `start` is a date. |
| `members` | list of `{ personId, roleId }` | A person in a role. The same pair must not appear twice. |
| `memberHours` | object | Weekly working hours of a person in this team, by person id, from 0 to 168. A member without an entry has `settings.hoursPerWeek`. |
| `assumptions` | object of numbers | Named values (for example `Number of developers`) that scale meeting durations. |
| `cycles` | list of `{ id, name, milestones }` | `milestones` is a list of `{ id, name, date }`. |
| `events` | list of events | The recurring meetings. |

### Area

An area groups several teams into one unit, for example a department or a release train. It is shaped like a team, without assumptions. Areas do not nest.

| Field | Type | Meaning |
| --- | --- | --- |
| `id`, `name` | string | Identity and display name. The id must not equal a team id. |
| `teamIds` | list of team ids | The teams in the area. A team belongs to at most one area. |
| `cadence` | `{ kind, lengthWeeks, start }`, optional | Reference cadence of the area, for example a planning interval of 10 weeks. Without it, the area's meetings cannot use the `cadence-day` rule. |
| `members` | list of `{ personId, roleId }` | People with a role at area level, for example head of area. The same pair must not appear twice. |
| `memberHours` | object | Weekly hours of a person in the area, by person id, from 0 to 168. Unlike in a team, a person without an entry has **0 hours** in the area: area time comes on top of team time and is set on purpose. |
| `cycles` | list of `{ id, name, milestones }` | As in a team. |
| `events` | list of events | The area's own meetings. |

### Event

| Field | Type | Meaning |
| --- | --- | --- |
| `id`, `name` | string | Identity and display name. |
| `categoryId` | string | A category id. |
| `rule` | object | When the meeting happens; see the rule types. |
| `time` | `HH:MM` | Start time. |
| `duration` | integer | Minutes, above 0. |
| `scaling` | `{ base, perUnit, assumption, grid }`, optional | Duration grows with a team assumption: `base` plus `perUnit` per unit of `assumption`, rounded to `grid` minutes. |
| `participants` | list of `{ roleId, share, fromTeams? }` or `{ personId, share }` | Roles and people taking part; `share` is above 0 and at most 1. Only in an area's meetings, `fromTeams: true` invites the role from every team of the area ("Product Owner from every team") instead of the area's own members with that role. In a team's meeting `fromTeams` is an error. `{ personId, share }` invites one person by name, from any team or area; each person at most once per meeting, never together with `roleId`. A person invited by name counts once, with that share, also when one of their roles is invited too. |
| `preparation` | number, 0 to 1 | Preparation time as a fraction of the duration. |
| `onSite` | `{ travel }`, optional | The meeting takes place on site; without it, it is remote. `travel` is an integer of minutes, 0 to 1440: the travel time there and back of everyone attending, per occurrence. It counts in load and costs like the meeting itself, weighted by `share`, but preparation does not grow it. |

## Rule types

Weekdays are numbers from 1 (Monday) to 7 (Sunday).

| Type | Example | Meaning |
| --- | --- | --- |
| `weekly` | `{ "type": "weekly", "weekday": 1 }` | Every week on that weekday. |
| `weekdays` | `{ "type": "weekdays", "weekdays": [1, 2, 3, 4, 5] }` | Several weekdays; not empty, no duplicates. |
| `every-n-weeks` | `{ "type": "every-n-weeks", "weekday": 3, "n": 2, "anchor": "2027-01-06" }` | Every `n` weeks, counted from the `anchor` date. |
| `monthly-nth-weekday` | `{ "type": "monthly-nth-weekday", "weekday": 2, "nth": -1 }` | The `nth` (1 to 5, or -1 for the last) weekday of each month. |
| `cadence-day` | `{ "type": "cadence-day", "day": 0 }` | A day of each cadence period; 0 is the start day and the day must lie within `lengthWeeks`. In an area it needs the area's own `cadence`. |
| `cycle-milestone` | `{ "type": "cycle-milestone", "cycleId": "cy1", "milestoneId": "m1", "offsetDays": -1 }` | Relative to a milestone of a cycle of the same team or area; the offset is in days and may be negative. |
| `once` | `{ "type": "once", "date": "2027-03-01" }` | A single date. |

## Migrations and versions

Older files (schema 1 to 6) are upgraded when they are opened: schema 2 added `id`, schema 3 added `customRegions`, schema 4 moved a person's `hoursPerWeek` to `memberHours` of their teams, split evenly (40 hours in two teams become 20 in each), schema 5 added an empty `areas` list, schema 6 lets meetings invite people by name (`{ personId, share }` participants; older files change only their version). Schema 7 lets meetings take place on site with a travel time (`onSite`; older files change only their version). The optional `organisation` entry came without a new schema version. The upgraded file is written on the next save. A file with a newer schema than the app knows is rejected, so that no data is lost by an older app; update the app instead. Schema 5 files need Caldence 1.33 or newer; to show areas, their level names and their meetings, 1.36 or newer. Schema 6 files need Caldence 1.45 or newer. Schema 7 files need Caldence 1.47 or newer.

## Limits

A file that goes beyond these limits is rejected with a message naming the field. They keep a shared file from making the app unusable (every view walks the planning horizon day by day for every meeting).

| What | Limit |
| --- | --- |
| File size | 5 MB |
| Dates (all of them) | years 1900 to 2200 |
| Planning horizon | at most 5 years (`to` at most the same date 5 years after `from`) |
| Meetings | 500 in all teams and areas together |
| Teams / areas / roles / categories / people | 50 / 50 / 200 / 200 / 1000 |
| Teams per area | 50 |
| Members, cycles, milestones per cycle (teams and areas), assumptions per team | 1000, 100, 100, 50 |
| Imported regions | 20 (each with at most 100 holidays and 500 school holidays of at most a year each) |
| Names and other text | 200 characters (template description: 2000) |
| Hours per week | 168 |
| Cadence length, `every-n-weeks` `n` | 52 weeks |
| `duration`, scaling `base`, `perUnit`, `grid` | 1440 minutes |
| `offsetDays` | -366 to 366 |
| Assumption values | -10000 to 10000 |
| `warnFactor`, `maxFte` | 100, 10 |

If a stored workspace ever keeps the app from starting, open it with `?reset` at the end of the address (for example `https://caldence.de/?reset`). The app then starts with an empty workspace; the stored one is kept in the browser as a backup (`current.bak`) until the next reset or unreadable start.


## Privacy

A workspace file contains names of people, their working hours and your meeting plan. Caldence never uploads it. The file lives only where you save it, and a copy is kept in your browser for autosave. Share it only with people who may see this data. To share a team's structure without personal data, export it as a [template](template-format.md) instead.

## Example

```json
{
  "schemaVersion": 7,
  "id": "6f1c1d52-4b0e-4f0a-9a43-0c2f6a1d8e11",
  "settings": {
    "locale": "en",
    "region": "de-sn",
    "timezone": "Europe/Berlin",
    "workdays": [1, 2, 3, 4, 5],
    "hoursPerWeek": 40,
    "horizon": { "from": "2027-01-01", "to": "2027-12-31" },
    "skipHolidays": true,
    "thresholds": { "warnFactor": 1.5, "maxFte": 0.6 }
  },
  "roles": [
    { "id": "r1", "name": "Scrum Master", "colour": "#1d4ed8" },
    { "id": "r2", "name": "Head of area", "colour": "#7e22ce" }
  ],
  "people": [
    { "id": "p1", "name": "Alex" },
    { "id": "p2", "name": "Jordan" }
  ],
  "categories": [{ "id": "c1", "name": "Meetings", "colour": "#15803d" }],
  "customRegions": [],
  "teams": [
    {
      "id": "t1",
      "name": "Team A",
      "cadence": { "kind": "sprint", "lengthWeeks": 2, "start": "2027-01-04" },
      "members": [{ "personId": "p1", "roleId": "r1" }],
      "memberHours": { "p1": 40 },
      "assumptions": {},
      "cycles": [],
      "events": [
        {
          "id": "e1",
          "name": "Daily Scrum",
          "categoryId": "c1",
          "rule": { "type": "weekdays", "weekdays": [1, 2, 3, 4, 5] },
          "time": "09:30",
          "duration": 15,
          "participants": [{ "roleId": "r1", "share": 1 }],
          "preparation": 0
        }
      ]
    }
  ],
  "areas": [
    {
      "id": "a1",
      "name": "Platform",
      "teamIds": ["t1"],
      "members": [{ "personId": "p2", "roleId": "r2" }],
      "memberHours": { "p2": 8 },
      "cycles": [],
      "events": [
        {
          "id": "e2",
          "name": "Scrum of Scrums",
          "categoryId": "c1",
          "rule": { "type": "weekly", "weekday": 3 },
          "time": "14:00",
          "duration": 30,
          "participants": [
            { "roleId": "r1", "share": 1, "fromTeams": true },
            { "roleId": "r2", "share": 1 }
          ],
          "preparation": 0
        }
      ]
    }
  ]
}
```
