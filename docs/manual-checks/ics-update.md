# Manual check: updating events with a second export

Issue #21 lets a second export update the entries of the first one instead of adding copies. Automated tests check the file; whether an app applies the update can only be checked in the app itself.

## How the file is built

- Every entry has a stable `UID`: meeting, team or area, and file id (`ev-sync.team-alpha.<file id>@caldence`; single entries add their date). The UID only changes when the meeting, its team or the file is replaced.
- Every entry of one export has the same `SEQUENCE` (minutes since 2020-01-01 at the time of export) and `LAST-MODIFIED`, so each export is newer than the one before.
- The calendar keeps `METHOD:PUBLISH`. Entries that the last export of the same selection (team, role or person) wrote and that are gone now are written once more with `STATUS:CANCELLED`. The last export is remembered per file in the browser (`localStorage`), not in the file: on another device or after clearing site data, the next export cannot cancel anything, but it still updates.
- A shorter export period does not cancel what lies outside it. A series is cancelled when its meeting is deleted, no longer in the selection, or now written as single entries.

## Steps

1. Export a team with the default period and import it into the app.
2. In Caldence, move one meeting to another weekday, rename a second one and delete a third. Export the same team again.
3. Import the second file into the same calendar.

## Results

| Calendar app              | Date | Moved meeting replaced | Renamed meeting replaced | Deleted meeting removed | No copies | Notes |
| ------------------------- | ---- | ---------------------- | ------------------------ | ----------------------- | --------- | ----- |
| Classic Outlook (Windows) |      |                        |                          |                         |           |       |
| New Outlook               |      |                        |                          |                         |           |       |
| Outlook on the web        |      |                        |                          |                         |           |       |
| Google Calendar           |      |                        |                          |                         |           |       |
| Apple Calendar (macOS)    |      |                        |                          |                         |           |       |

Where an app adds copies, the manual (Help → Import into your calendar) tells people to delete the old entries first.
