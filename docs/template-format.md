# Template format

A Caldence template describes the roles, categories and recurring events of **one team**, without any people, and optionally the area above it. It is a JSON file with the workspace schema version of the app that wrote it (currently `5`). Templates and workspaces share one version number: older versions (1 to 4) are migrated on load, and fields that a migration adds only to workspaces (such as `customRegions`) are dropped; newer versions are rejected. The built-in Scrum and Kanban templates are version `2` and are migrated like any other; SAFe, which has an area, is version `5`.

## Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `kind` | `"caldence-template"` | Marks the file as a template. A workspace file has no `kind`. |
| `schemaVersion` | integer | Schema version of the file. |
| `id` | string | Stable id of the template; copied to `templateId` of every team created from it. Like all ids in a template (roles, categories, cycles, milestones, events): 1 to 64 characters from `A–Z`, `a–z`, `0–9`, `.`, `_` and `-`. |
| `name` | string | Display name. |
| `description` | string | One sentence about the template. |
| `roles` | list of `{ id, name, colour }` | Roles the events refer to. |
| `categories` | list of `{ id, name, colour }` | Event categories. |
| `team` | object | A team without `id`, `members` and `templateId`: `name`, `cadence`, `assumptions`, `cycles`, `events`. |
| `area` | object, optional | The area above the team, without `id`, `members`, `memberHours` and `teamIds`: `name`, `cadence` (required here), `cycles`, `events` and optional `levelNames` (as in the workspace settings). |

The `team` and `area` objects, their events, rules, cycles and cadences follow the same rules as in a workspace file; area meetings may invite a role `fromTeams` (from every team of the area). Dates and times are local; durations are in minutes.

### Example: the SAFe template

The built-in SAFe template (`src/data/templates/safe.en.json`) has a Scrum team and an `area` "Release Train" with a 10-week PI cadence (`kind: "pi"`), the cycle "PI 1" and the train's meetings: PI Planning (two days), ART Sync, System Demo, Inspect & Adapt and the PI Planning preparation on a milestone. They invite Product Owner, Scrum Master/Team Coach and Agile Team `fromTeams`, and Product Management and Release Train Engineer as the train's own roles. Its `levelNames` is `{ "preset": "train" }`, so a workspace without areas calls its levels Release Train and Team.

## Applying a template

- Roles and categories are matched with existing ones by name (trimmed, ignoring case). Matches are reused; the others are added with new ids.
- The team gets a new id and `templateId`.
- All dates (cadence start, cycle milestones, `every-n-weeks` anchors, `once` dates) move by a whole number of weeks so that the cadence starts on the first matching weekday on or after the day of applying.
- With an `area`, the first team from the template creates the area with the template's cadence, cycles and meetings, without people. It takes the template's `levelNames` only when it is the workspace's first area and the workspace has no level names yet.
- A further team from the same template joins the area that already holds a team from it (or an empty area of the same name) instead of creating a second one. Its dates move so that its cadence starts with the area's first increment on or after the day of applying, keeping its iterations in step with the area. Existing areas made by hand are never changed.

## No personal data

A template must never contain personal data. It has no `people`, no `settings`, no `customRegions` and no `team.members`. A file that has any of them is rejected, so that a workspace file or a team with names cannot be shared as a template by mistake. When a team is exported as a template, only the roles used by its events and members and the categories used by its events are kept. When the team is in an area, the export also writes the optional `area` part (name, cadence, cycles, meetings and the file's level names) with the roles and categories of the area's meetings; area members, area hours and team ids are never written. An area without its own cadence gets the team's cadence in the template.

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
