# Manual check: updating events with a second export

Issue #21 lets a second export update the entries of the first one instead of adding copies. Automated tests check the file; whether an app applies the update can only be checked in the app itself.

## How the file is built

- Every entry has a stable `UID`: meeting, team or area, and file id (`ev-sync.team-alpha.<file id>@caldence`; single entries add their date). The UID only changes when the meeting, its team or the file is replaced.
- A changed entry gets `SEQUENCE` = seconds since 2020-01-01 at the time of export (at least one more than its last one), with `DTSTAMP` and `LAST-MODIFIED` at that time, so it is newer than the one before. An entry whose content is the same as in the last export of the same selection in this browser is written exactly as then, `SEQUENCE`, `DTSTAMP` and `LAST-MODIFIED` included, so calendar apps leave it and what was added to it there alone (#441). The browser remembers a fingerprint of each entry for this.
- A series keeps the `DTSTART` of the last export of the same selection when the new "From" lies later: it is written from that start with the current rules (no split into an old and a new series), so a re-export in March does not remove December to February from the calendar. If the rules changed, the past occurrences follow the new rules too. Single entries start at "From". The stored start lives with the last export in the browser: after clearing site data, on another device or in another browser, the next export starts every series at "From" again.
- `SUMMARY` is "<meeting> · <team or area>" and a meeting's place or link is `LOCATION` (a web link also `URL`) (#442). Without a place there is no `LOCATION`; "On site" and the travel time are in `DESCRIPTION`. The first export after this change writes every meeting with a new `SEQUENCE` once.
- Every series ends at "To" (`COUNT`); the export names that date ("The series end on …; export again before then").
- The calendar keeps `METHOD:PUBLISH`. Entries that the last export of the same selection (team, role or person) wrote and that are gone now are written once more with `STATUS:CANCELLED`. The last export is remembered per file in the browser (`localStorage`), not in the file: on another device or after clearing site data, the next export cannot cancel anything, but it still updates.
- Single entries are only cancelled within the export period. A series is cancelled when its meeting is deleted, no longer in the selection, or now written as single entries. A series that is still a meeting of the selection is kept, even when the period holds none of its occurrences, since it may still run outside the period. A series is one entry: when a later export writes it again with a shorter period, its new end replaces the old one, so occurrences beyond the shorter period leave the calendar.
- Holidays and school holidays are never cancelled, only forgotten: every selection writes them with the same UID, and one calendar may hold several selections. School holidays are named by their first day, even when the period starts inside them.
- Meetings share their UID across selections too. When one calendar holds several selections (say a team and a person) and a meeting leaves one of them, the cancellation removes it from that calendar; importing the other selection again brings it back.

## Steps

1. Export a team with the default period and import it into the app.
2. In Caldence, move one meeting to another weekday, rename a second one and delete a third. Export the same team again.
3. Import the second file into the same calendar.
4. Add a note to an unchanged meeting in the calendar app. Export the same team again with a later "From" (for example a month later) and import it.

## Results

| Calendar app              | Date | Moved meeting replaced | Renamed meeting replaced | Deleted meeting removed | No copies | Past meetings kept, note kept (step 4) | Notes |
| ------------------------- | ---- | ---------------------- | ------------------------ | ----------------------- | --------- | -------------------------------------- | ----- |
| Classic Outlook (Windows) |      |                        |                          |                         |           |                                        |       |
| New Outlook               |      |                        |                          |                         |           |                                        |       |
| Outlook on the web        |      |                        |                          |                         |           |                                        |       |
| Google Calendar           |      |                        |                          |                         |           |                                        |       |
| Apple Calendar (macOS)    |      |                        |                          |                         |           |                                        |       |

Where an app adds copies, the manual (Help → Import into your calendar) tells people to delete the old entries first.
