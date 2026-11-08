# Template format

A Caldence template describes the roles, categories and recurring events of **one team**, without any people. It is a JSON file with the workspace schema version of the app that wrote it (currently `3`). Templates and workspaces share one version number: older versions (1 to 3) are migrated on load, and fields that a migration adds only to workspaces (such as `customRegions`) are dropped; newer versions are rejected. The built-in templates are version `2` and are migrated like any other.

## Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `kind` | `"caldence-template"` | Marks the file as a template. A workspace file has no `kind`. |
| `schemaVersion` | integer | Schema version of the file. |
| `id` | string | Stable id of the template; copied to `templateId` of every team created from it. |
| `name` | string | Display name. |
| `description` | string | One sentence about the template. |
| `roles` | list of `{ id, name, colour }` | Roles the events refer to. |
| `categories` | list of `{ id, name, colour }` | Event categories. |
| `team` | object | A team without `id`, `members` and `templateId`: `name`, `cadence`, `assumptions`, `cycles`, `events`. |

The `team` object, its events, rules, cycles and the `cadence` follow the same rules as in a workspace file. Dates and times are local; durations are in minutes.

## Applying a template

- Roles and categories are matched with existing ones by name (trimmed, ignoring case). Matches are reused; the others are added with new ids.
- The team gets a new id and `templateId`.
- All dates (cadence start, cycle milestones, `every-n-weeks` anchors, `once` dates) move by a whole number of weeks so that the cadence starts on the first matching weekday on or after the day of applying.

## No personal data

A template must never contain personal data. It has no `people`, no `settings`, no `customRegions` and no `team.members`. A file that has any of them is rejected, so that a workspace file or a team with names cannot be shared as a template by mistake. When a team is exported as a template, only the roles used by its events and members and the categories used by its events are kept.

## Example

```json
{
  "kind": "caldence-template",
  "schemaVersion": 2,
  "id": "my-team",
  "name": "My team",
  "description": "Weekly sync and a two-week review.",
  "roles": [{ "id": "r1", "name": "Lead", "colour": "#1d4ed8" }],
  "categories": [{ "id": "c1", "name": "Meetings", "colour": "#15803d" }],
  "team": {
    "name": "My team",
    "cadence": { "kind": "sprint", "lengthWeeks": 2, "start": "2027-01-04" },
    "assumptions": {},
    "cycles": [],
    "events": [
      {
        "id": "e1",
        "name": "Weekly sync",
        "categoryId": "c1",
        "rule": { "type": "weekly", "weekday": 1 },
        "time": "10:00",
        "duration": 30,
        "participants": [{ "roleId": "r1", "share": 1 }],
        "preparation": 0
      }
    ]
  }
}
```
