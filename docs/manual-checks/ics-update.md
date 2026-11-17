# Manual check: updating events with a second export

Issue #21 lets a second export update the entries of the first one instead of adding copies. Automated tests check the file; whether an app applies the update can only be checked in the app itself.

## How the file is built

- Every entry has a stable `UID`: meeting, team or area, and file id (`ev-sync.team-alpha.<file id>@caldence`; single entries add their date). The UID only changes when the meeting, its team or the file is replaced.
- Every entry of one export has the same `SEQUENCE` (seconds since 2020-01-01 at the time of export) and `LAST-MODIFIED`, so each export is newer than the one before.
- The calendar keeps `METHOD:PUBLISH`. Entries that the last export of the same selection (team, role or person) wrote and that are gone now are written once more with `STATUS:CANCELLED`. The last export is remembered per file in the browser (`localStorage`), not in the file: on another device or after clearing site data, the next export cannot cancel anything, but it still updates.
- Single entries are only cancelled within the export period. A series is cancelled when its meeting is deleted, no longer in the selection, or now written as single entries. A series that is still a meeting of the selection is kept, even when the period holds none of its occurrences, since it may still run outside the period. A series is one entry: when a later export writes it again with a shorter period, its new end replaces the old one, so occurrences beyond the shorter period leave the calendar.
- Holidays and school holidays are never cancelled, only forgotten: every selection writes them with the same UID, and one calendar may hold several selections. School holidays are named by their first day, even when the period starts inside them.
- Meetings share their UID across selections too. When one calendar holds several selections (say a team and a person) and a meeting leaves one of them, the cancellation removes it from that calendar; importing the other selection again brings it back.

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
