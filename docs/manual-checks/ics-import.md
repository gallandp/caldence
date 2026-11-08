# Manual check: importing an exported .ics file

Issue #16 asks for a check in real calendar apps, because automated tests cannot open them. Export a team from the Import / Export view with holidays included and a reminder set, using a period that spans a daylight saving time change (late March or late October in Europe). Then import the file into each app below and fill in the date and result (OK / not OK, with notes).

## What to check in every app

1. The recurring series appear at the right local times, both before and after the daylight saving time change.
2. Holidays and school holidays are not imported as meetings (they are left out of the series).
3. Categories and reminders are kept.
4. An all-day holiday appears as an all-day entry.

## Results

| Calendar app                          | Date | Right times on both sides of the DST change | Holidays left out | Categories and reminders kept | All-day holiday is all-day | Notes |
| ------------------------------------- | ---- | ------------------------------------------- | ----------------- | ----------------------------- | -------------------------- | ----- |
| Classic Outlook (Windows)             |      |                                             |                   |                               |                            |       |
| New Outlook                           |      |                                             |                   |                               |                            |       |
| Outlook on the web                    |      |                                             |                   |                               |                            |       |
| Google Calendar                       |      |                                             |                   |                               |                            |       |
| Apple Calendar (macOS)                |      |                                             |                   |                               |                            |       |

## Reminder about re-importing

Importing the same file again updates nothing yet; delete the old entries first. Updating is tracked in #21.
