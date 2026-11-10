# Workspace format

A Caldence workspace is one JSON file, usually named like `plan.caldence.json`. It holds everything you plan: settings, roles, people, categories, teams and their meetings. The current schema version is `3`.

## Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | integer | Schema version of the file (`3`). |
| `id` | string | Stable id of the workspace (a UUID); used for stable ids in calendar exports. |
| `settings` | object | See below. |
| `roles` | list of `{ id, name, colour }` | Roles such as Product Owner. `colour` is `#rrggbb`. |
| `people` | list of `{ id, name, hoursPerWeek }` | People; `hoursPerWeek` is not negative. |
| `categories` | list of `{ id, name, colour }` | Event categories. |
| `customRegions` | list of regions | Region files imported into this workspace (see [region-format.md](region-format.md)). An id must not equal a built-in region id or another imported one. |
| `teams` | list of teams | See below. |

All ids (the workspace `id` and the ids of roles, people, categories, teams, cycles, milestones and events) are 1 to 64 characters from `A–Z`, `a–z`, `0–9`, `.`, `_` and `-`, and unique within their list. A file with any other id is rejected. Dates are `YYYY-MM-DD`, times `HH:MM`, both local; durations are whole minutes.

### `settings`

| Field | Type | Meaning |
| --- | --- | --- |
| `locale` | `"de"` or `"en"` | Language of the app. |
| `region` | string | Id of a built-in or imported region. An unknown id still loads, but then no holidays are used. |
| `timezone` | string | IANA time zone, for example `Europe/Berlin`. |
| `workdays` | list of 1-7 | Working weekdays, Monday is 1, Sunday is 7. Not empty, no duplicates. |
| `hoursPerWeek` | number | Default working hours per week, above 0. |
| `horizon` | `{ from, to }` | Planning period; `to` is not before `from`. |
| `skipHolidays` | boolean | Skip meetings that fall on a public holiday. |
| `thresholds` | `{ warnFactor, maxFte }` | Load warning limits, both above 0. |

### Team

| Field | Type | Meaning |
| --- | --- | --- |
| `id`, `name` | string | Identity and display name. |
| `templateId` | string, optional | Id of the template the team was created from. |
| `cadence` | `{ kind, lengthWeeks, start }` | `kind` is `sprint`, `flow` or `pi`; `lengthWeeks` is an integer from 1; `start` is a date. |
| `members` | list of `{ personId, roleId }` | A person in a role. The same pair must not appear twice. |
| `assumptions` | object of numbers | Named values (for example `devs`) that scale meeting durations. |
| `cycles` | list of `{ id, name, milestones }` | `milestones` is a list of `{ id, name, date }`. |
| `events` | list of events | The recurring meetings. |

### Event

| Field | Type | Meaning |
| --- | --- | --- |
| `id`, `name` | string | Identity and display name. |
| `categoryId` | string | A category id. |
| `rule` | object | When the meeting happens; see the rule types. |
| `time` | `HH:MM` | Start time. |
| `duration` | integer | Minutes, above 0. |
| `scaling` | `{ base, perUnit, assumption, grid }`, optional | Duration grows with a team assumption: `base` plus `perUnit` per unit of `assumption`, rounded to `grid` minutes. |
| `participants` | list of `{ roleId, share }` | Roles taking part; `share` is above 0 and at most 1. |
| `preparation` | number, 0 to 1 | Preparation time as a fraction of the duration. |

## Rule types

Weekdays are numbers from 1 (Monday) to 7 (Sunday).

| Type | Example | Meaning |
| --- | --- | --- |
| `weekly` | `{ "type": "weekly", "weekday": 1 }` | Every week on that weekday. |
| `weekdays` | `{ "type": "weekdays", "weekdays": [1, 2, 3, 4, 5] }` | Several weekdays; not empty, no duplicates. |
| `every-n-weeks` | `{ "type": "every-n-weeks", "weekday": 3, "n": 2, "anchor": "2027-01-06" }` | Every `n` weeks, counted from the `anchor` date. |
| `monthly-nth-weekday` | `{ "type": "monthly-nth-weekday", "weekday": 2, "nth": -1 }` | The `nth` (1 to 5, or -1 for the last) weekday of each month. |
| `cadence-day` | `{ "type": "cadence-day", "day": 0 }` | A day of each cadence period; 0 is the start day and the day must lie within `lengthWeeks`. |
| `cycle-milestone` | `{ "type": "cycle-milestone", "cycleId": "cy1", "milestoneId": "m1", "offsetDays": -1 }` | Relative to a milestone of a cycle of the same team; the offset is in days and may be negative. |
| `once` | `{ "type": "once", "date": "2027-03-01" }` | A single date. |

## Migrations and versions

Older files (schema 1 and 2) are upgraded when they are opened: schema 2 added `id`, schema 3 added `customRegions`. The upgraded file is written on the next save. A file with a newer schema than the app knows is rejected, so that no data is lost by an older app; update the app instead.

## Privacy

A workspace file contains names of people, their working hours and your meeting plan. Caldence never uploads it. The file lives only where you save it, and a copy is kept in your browser for autosave. Share it only with people who may see this data. To share a team's structure without personal data, export it as a [template](template-format.md) instead.

## Example

```json
{
  "schemaVersion": 3,
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
  "roles": [{ "id": "r1", "name": "Scrum Master", "colour": "#1d4ed8" }],
  "people": [{ "id": "p1", "name": "Alex", "hoursPerWeek": 40 }],
  "categories": [{ "id": "c1", "name": "Meetings", "colour": "#15803d" }],
  "customRegions": [],
  "teams": [
    {
      "id": "t1",
      "name": "Team A",
      "cadence": { "kind": "sprint", "lengthWeeks": 2, "start": "2027-01-04" },
      "members": [{ "personId": "p1", "roleId": "r1" }],
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
  ]
}
```
