# Changelog

## Unreleased

## 1.48.0 – 2026-11-19

### Added

- When teams join an area, a role that the area's meetings invite from every team and that a team calls differently (for example "Agile Team" for "Developers") can be mapped to one of the team's roles. PI Planning and the other area meetings then count those people in load and cost, and the role filter and role calendars follow the mapping (#338) (#354)
- A team in an area shows what its people also spend in the area's meetings, on its cost card and in its row of the area Overview, per week and in the planning horizon. People in several teams are split by their weekly hours. The area total stays unchanged. (#336) (#356)
- Meetings & cadence and the .ics export name the meetings that public holidays leave out, with their dates; each date opens that day in the calendar (#341) (#357)
- The add-member form in the Team view shows a person's meeting load before and after adding them (#342) (#367)
- Meeting load: the person drill-in lists the meetings behind a person's load for each team or area, with repeat rule and hours per week; one-off meetings are marked (#343) (#370)
- Meeting load: weeks in the warnings and the peak week open that week in the Calendar with the person filter set (#343) (#370)
- The area Overview counts the days with overlapping meetings in the next 12 weeks and opens an example in the calendar (#339) (#371)
- Meeting load lists one line per person whose meetings overlap, with an example (#339) (#371)

### Changed

- A file saved with Caldence 2 now says that it opens at caldence.de/v2/, instead of only "newer version". (#345)
- A template's level words (for example SAFe's "Release Train") are only taken over by a file without teams; a file with teams keeps its own (#338) (#354)
- Wizard step 4 and Settings ask you to check the preset holiday region (#341) (#357)
- Opening a file starts on the first area's Overview, or on the Calendar without an area, never on Settings, Templates or Import/Export; the area page opens on its Overview (#337) (#358)
- The language is now a setting of this browser like the appearance: switching it no longer marks the file changed, and the file's language is used only while the browser has none chosen (#337) (#358)
- The note on meetings skipped on public holidays is now one short line; the dates unfold on request. (#405)
- Browser back and forward now work inside Caldence: every view and selected team or area has its own address, which can also be bookmarked. (#411)

### Fixed

- After opening a week from the area Overview, the week detail's heading is no longer hidden behind the back button (#302) (#346)
- The area Overview's hours and meeting share now count an unfilled role as one person, like the cost and the Meeting load tiles, so hours × rate equals the cost; the cost card no longer says unfilled roles add no hours (#335) (#348)
- Updating Caldence no longer deletes the offline copy of the Caldence 2 preview at /v2/. (#351)
- Warnings, the Calendar, the people table and the area Overview now agree on who is over the limit: always all meetings ÷ all weekly hours (#307, #334) (#352)
- Missing hours in an area, or area meetings that take most of the hours there, are shown as one hint per person and area under "Hours in the area", not as weekly warnings (#307, #334) (#352)
- The area Overview counts people who are only in the area, in a row of their own (#334) (#352)
- A what-if in a team inside an area shows the team's own meeting load with its hours first, then the area's, in the dialog and the present-mode banner; the banner keeps the hours after Apply (#340) (#353)
- The team switcher no longer breaks the word "Organisation" in the middle (#338) (#354)
- The week view marks days on which the chosen person has overlapping meetings and names them, like the month view (#339) (#355)
- The calendar legend names whose meeting hours the days show: the chosen person, all people in the chosen role, or all people (#339) (#355)
- Scrolling the mouse wheel over a focused number field no longer changes its value (#337) (#358)
- Meeting load by role: people who attend an area meeting through a role mapping count under their own role whether or not the role filter is set (#338) (#359)
- Booking a person beyond the default hours per week no longer lowers their share in meetings or adds room before the limit (#342) (#367)

## 1.47.0 – 2026-11-18

### Added

- Import / Export can save the whole file as an Excel workbook (.xlsx): people per area and team with roles and hours, the areas and teams with their cadence, and all meetings, ready for filters and pivot tables. (#317)
- Meetings can be remote or on site. On site, a flat travel time (there and back) counts for everyone attending, in meeting load and costs, and is shown in the meetings table and written to the calendar export. (#325)
- Organisation level above areas and teams: select the organisation at the top of the sidebar to see the calendar and meeting load of all teams and areas together, and a tree of areas and teams on its own page. Give it a name in the selection's actions menu; with own level names the top level can be renamed too. (#329)

### Changed

- Help is now a set of short visual guides: pick a task, follow a few numbered steps that show the real buttons, and open the view in one click. Details and reference topics are one tap away. (#326)
- The page header names the selected team or area only once and has more room below the file bar; the Team and area page shows the unit's name as its headline. (#332)

## 1.46.0 – 2026-11-18

### Added

- The Team view member list and people pool flag a person whose hours in all teams add up to more than the weekly hours, as Meeting load does (#291) (#301)

### Changed

- On phones the most expensive meetings of the area Overview are cards with the cost on top, no sideways scrolling (#283) (#304)
- With an area selected in a file with several areas, the ZIP export holds only that area's calendar and its teams' calendars, and the button says so (#284) (#305)

### Fixed

- The area Overview's key figure tiles and cards now have the same gap as other views instead of touching (#293) (#303)
- The week detail in Meeting load and the outlined weeks in the area Overview judge a person on all their meetings ÷ all their weekly hours, like the people table; the week detail shows the part in the team in its own column (#294) (#308)

## 1.45.0 – 2026-11-18

### Added

- The cost card and the area's cost table name unfilled roles, which count as one person for the cost but add no hours (#264) (#267)
- After an export, Import / Export says how to update your calendar and links to the import steps in the Help (#280) (#287)
- Meetings can invite individual people by name next to roles, also from another team. A named person counts once, with their own share, in meeting load, costs, the calendar export and their own filter (#285) (#290)
- While you edit a meeting, the form shows its effect on hours, meeting load and (with an hourly rate) cost per week and in the planning horizon, before you save. On phones the effect is one line. (#276) (#295)
- Adding a person who is already in another team, in the setup wizard or the Team view, asks for their hours there and fills in the hours they have left instead of the full weekly hours (#274) (#296)
- Meeting load and the area Structure card flag a person whose hours in all teams add up to more than the weekly hours, for example "52 h – mehr als 40 h pro Woche" (#274) (#296)
- While presenting, the Print button stays available, and printing keeps the what-if note (#278) (#297)
- Printouts start with one line naming the file, the print date, the hourly rate and the planning horizon (#278) (#297)
- The what-if bar shows the change of cost in the planning horizon next to the change per week (#278) (#297)
- Meetings & cadence shows what each meeting and the whole team cost per sprint or PI (for example "Ø €810 / sprint"), next to the cost per week. Teams in flow keep per week only. (#279) (#300)
- Each meeting's cost names its preparation share, for example "incl. 25% preparation", so the figure can be checked. (#279) (#300)

### Changed

- A file now opens where it was saved: on the same team or area, view and area page. The autosave does the same after a reload. (#270)
- Import / Export opens on what this browser exported last; after "Ich bin selbst dabei" in the wizard it opens on your own person. After a team export it opens on the team or area selected in the sidebar. Nothing of this is stored in the file (#280) (#287)
- With an area selected that has no meetings of its own, "Eine Datei pro Team (ZIP)" is the main action, and the picker is labelled "Team oder Bereich auswählen" (#280) (#287)
- Meeting load: the tiles say "typical week" and the chart line says "Ø in the planning horizon", with a hint line that explains the difference. The people table column is now "Ø hours/week". The Total tile names roles without people that it counts as one person each (#272) (#288)
- A person's drill-in in Meeting load says "0 h – keine Termine für diese Rolle" for a team without meetings for their role (#274) (#296)
- Costs in the planning horizon name their period, for example "in the planning horizon (2027, 52 wks)", in the area overview, the cost card and the what-if sheet; in German the cost card now says "im Planungszeitraum" instead of "im Zeitraum" (#278) (#297)
- Meeting load: the people table judges each person on all their teams and areas in every scope, so a person in two teams has the same share, room and "over the limit" tag in each team. In a team or area, a new column "of which in the team/area" shows their part there. For a person in several teams, the share and room in a team change (example file: Alex in Team Alpha now shows 14 % instead of 19 %). The warnings and the Calendar's warning weeks follow the same rule (#273) (#298)
- Meeting load: "Free up to the limit" is now "Room before limit (meetings)", a line under the title says that only meeting time counts, and the tiles show no FTE when a person is chosen (#273) (#298)
- Clicking a meeting on the area Overview shows it highlighted in Meetings & cadence instead of opening it for editing (#277) (#299)
- After a click from the area Overview, a "← {area} overview" button leads back in one click (#277) (#299)
- The area Overview gives its answers on the first screen: the cost explanation folds into "How is this counted?", and the list of teams for assigning people moved to Structure (#277) (#299)
- While presenting, picking an area opens its Overview instead of an empty meeting list (#277) (#299)

### Fixed

- Area overview: the heat map and the cost table use one rule for a team's share of time in meetings, and the legend explains the weekly average (#262) (#269)
- Changing the sprint length, also as a what-if while presenting, keeps Review, Retro and other meetings in the second half of the sprint at its end (day 12 of 14 becomes day 19 of 21); a line names the moved meetings and Undo takes the change back. Meeting hours and costs of a sprint-length what-if change accordingly (#275) (#286)
- Meeting load: the Total tile, the weekly chart, its average and the peak week count every person in a role, as the cost does. Totals for teams with several people in a role are higher than before, and Total × hourly rate now equals the cost per week (#272) (#288)
- Meeting load: a role tile shows the average share per person, measured against the weekly hours of the people in that role. With a person chosen, it uses that person's weekly hours, so tiles and the people table agree (#272) (#288)
- Calendar: the Horizon table (role columns, weekly total) and the hours of a day count every person in a role (#272) (#288)
- On phones the area Overview no longer scrolls sideways, and time and cost per team show as one card per team with the cost in view (#281) (#289)

## 1.44.0 – 2026-11-17

### Added

- Calendar, Load, Meetings & cadence and the team or area page name the selected team or area in a quiet line above the headline, with the configured level name (#196) (#207)
- The sidebar folds into a narrow rail of icons with the new button next to the logo or the key `[`; Caldence remembers the choice in this browser. (#244)
- Without an hourly rate, Meetings & cadence and Meeting load offer a field to set one right there. (#245)
- "Add to calendar…" in Meetings & cadence opens the export with this team, or with the person you exported last. (#245)
- The area overview shows what the meetings cost per team and for the area itself, per week or in the planning horizon, and lists the five most expensive meetings. (#247)
- The start screen, a one-time hint and an "area is ready" card show how to group teams into an area and what to do next (#191) (#248)
- Empty states for an area without teams or without its own meetings (#191) (#248)
- The manual has a chapter on areas, and the example file contains one (#191) (#248)
- Exporting again after a change updates the entries of the earlier export in calendar apps that support updates, and meetings deleted since then are included as cancelled (#21) (#249)
- Public holidays of all 16 German federal states; school holidays are bundled for Saxony so far (#23) (#260)

### Changed

- The team page shows only the team's own members; people and roles of the whole workspace are folded into a section below (#231). (#233)
- One meeting limit everywhere: Settings shows it as "Grenze" in percent, warnings and the person table show shares in percent; the other rule is called "Lastspitze". (#235)
- Clearer words: "Datei" instead of "Arbeitsbereich", "Terminlast" instead of "Auslastung", "abgestimmt" for teams in sync, "Eingeladen" for meeting roles, and your own level names (e.g. "Produkt") in hints that point to a view. (#235)
- The area's entry in the sidebar shows the area icon instead of the people icon. (#244)
- The area overview's meeting load counts all meetings of everyone in the area, the same figure as the new table's total. (#247)
- Exporting a team that belongs to an area as a template now includes the area's cadence, cycles and meetings, so applying it rebuilds both levels (#246) (#250)
- Meeting load: the new People list shows per person the teams, hours of the weekly hours, the share against the limit and how many hours are still free up to the limit. Sort by share or free hours, and click a name to see where the time comes from. (#251)
- The manual describes areas in the chapters on views, calculation, files, calendar export and keyboard (#193) (#255)
- An area without teams offers "Choose teams" on its overview instead of pointing to the sidebar menu (#254) (#256)
- New present mode: "Present" turns Caldence into a clean view for meetings, with larger type and no editing controls. Duration, rhythm and cadence length can be changed as "what if" with a live effect on hours, cost, Meeting load and alignment; Escape ends presenting and discards all what-ifs, the file stays unchanged. Names can be hidden while presenting. (#259)
- Print or save as PDF: a new Print button (on phones in the file menu) and a print layout show only the current view, in light colours and without navigation or edit controls, so the overview, the meeting load or the costs can go into a slide or a mail. An active search and a what-if while presenting are named on the paper. (#261)

### Fixed

- The Plan new wizard now suggests the date the cadence really starts on and says so when a template moves the picked date to its start weekday. (#239)
- Meeting load: the average label of the "Hours per week" chart is no longer cut off when the average is close to the busiest week. (#240)
- The category dot in the Base load table and the peak week in the Per person table no longer break onto a second line. (#241)
- The setup wizard, the template preview and the delete-person dialog use proper singular and plural forms instead of "Woche(n)" / "week(s)". (#241)
- The people list on the Team view names the area and hours of people who work in an area instead of "not assigned yet" (#252) (#257)
- Importing an exported area calendar back into a team no longer offers the area's meetings as new ones (#253) (#258)
- "Per person" in the area's meeting costs counts the same people in every row and in the total: everyone invited to at least one meeting (#263) (#266)
- Meeting load: a person who works only in an area has their area hours (0 h until set) instead of the 40 h default (#265) (#268)

## 1.43.0 – 2026-11-16

### Changed

- Month calendar: meeting names wrap to two lines before they are cut off, and further meetings of a day read "+2 more" instead of "+2" (#211)
- Calendar month view on phones: all seven days fit the screen without sideways scrolling; each day shows its number and a dot per meeting in the category colour, and tapping a day opens its details (#208) (#219)
- Touch screens: buttons, segmented controls and fields have hit areas of at least 44 × 44 px; small icon buttons keep their look and get a larger invisible hit area. Mouse and trackpad keep the compact sizes (#214) (#223)

## 1.42.2 – 2026-11-16

### Fixed

- Avatar initials in the team switcher and the area structure are at least 10 px and still fit, so they stay legible (#215)

## 1.42.1 – 2026-11-16

### Fixed

- Manual: the phone paragraph describes the bottom tab bar and the ⋯ menu instead of the old menu button (#209)

## 1.42.0 – 2026-11-16

### Changed

- Language and appearance only in Settings (#212) (#224)

## 1.41.0 – 2026-11-16

### Changed

- Language and appearance (light, dark, match system) are now set only in Workspace settings › General; the sidebar no longer shows them. Saved choices keep working (#212)
- Phones: a tab bar at the bottom shows Calendar, Load, Meetings and Team with one tap; Templates, Settings, Import / Export, Help and the links moved into the file bar's "…" menu, which replaces the menu button (#209)

## 1.40.0 – 2026-11-16

### Changed

- Team assumptions are labelled by a plain name instead of a technical key, in normal type; the example workspace calls its assumption "Number of stakeholders" ("Anzahl Stakeholder" in German), and a taken name gets a clear message (#210)

## 1.39.1 – 2026-11-15

### Fixed

- Sidebar switcher: long area and team names wrap instead of being cut off; an area's team count is a small number badge, and the selected unit's name shows on up to two lines with the full text as a tooltip (#190)

## 1.39.0 – 2026-11-15

### Added

- Areas: roles are created right in the area: "New role …" in "+ Person" and in the person card, and the role list (rename, colour, order) is on the structure page too

## 1.38.1 – 2026-11-15

### Fixed

- Areas: "Role · every team (n)" now shows the same count on Meetings & cadence and in the area overview (everyone the meeting reaches), area edits in the structure tree are checked like all other edits, and an error message used a fixed "area" instead of the configured level name

## 1.38.0 – 2026-11-15

### Added

- Area structure: with an area selected, the sidebar entry carries the upper level name and shows the area as a tree: who works only in the area, in a team and in the area, or only in a team, with their hours. Hover or tap a person to see everywhere they work, tap a meeting to see who is invited and which team lacks the role, or switch to a table. Add people, choose teams and edit area roles and hours right in the tree (#167)

## 1.37.0 – 2026-11-15

### Changed

- Area overview: compare team cadences and load, see the area's steering (#195)
- Calendar and Load show the whole area when an area is selected (#166) (#188)
- SAFe template creates a Release Train area (#187)

## 1.36.0 – 2026-11-15

### Added

- Area meetings: with an area selected, Meetings & cadence plans the area's own meetings and optional cadence. A role can be invited from every team ("Scrum Master · every team"); the form and the list name who that reaches, which team lacks the role and who has no hours in the area yet. Area meetings count as area time, not team time: Load, the hours check (0 h in an area without an entry), costs and the iCalendar export include them, and the area gets a calendar of its own (#165)
- With an area selected, Calendar (week, month, horizon) and Load also show the area's own meetings, marked with the area icon and name, and the area's cadence. "Show for" offers the area's teams to narrow the view to one of them; a single team still shows only its own meetings (#166)

### Changed

- The SAFe template now creates a Release Train above the team: Release Train Engineer and Product Management are roles of the train, and PI Planning, ART Sync, System Demo, Inspect & Adapt and the PI Planning preparation are train meetings that invite the team roles from every team. The team keeps the iteration events with a two-week cadence, and a second SAFe team joins the same Release Train (#169)

## 1.35.0 – 2026-11-15

### Added

- Areas: group teams under an area (Bereich, or your own level name) with ⋯ › Add area, choose its teams, rename or delete it. The sidebar switcher lists each area with its teams below it; with an area selected, Calendar and Load show all its teams together, and Meetings & cadence and Team offer its teams to pick (#164)
- Area overview "Cadence & load": compares each team's sprints or periods with the area cadence (or, without one, with the cadence most teams share) and names why a team is out of step; the meeting load of each team per week sits on the same 12-week axis, and a cell opens Load at that week. Key figures and the area's own roles and meetings with their weekly hours complete the page. It only compares; no cadence is changed (#168)

### Fixed

- Dialog buttons no longer look like the small row actions of tables (#164)

## 1.34.2 – 2026-11-15

### Fixed

- New-version notice: Reload now always loads the new version, also after a hard reload while another Caldence tab is open (#181)

## 1.34.1 – 2026-11-15

### Fixed

- Plan new, step 1: a click anywhere on an option card (also on its description) picks that way of working (#174)

## 1.34.0 – 2026-11-15

### Added

- Settings › Names: call the levels Bereich/Team, Abteilung/Team, Plattform/Produkt, Chapter/Unit, Release Train/Team or your own names; the sidebar, team menu and buttons follow (#163)

## 1.33.0 – 2026-11-15

### Added

- Workspace files can store areas that group several teams (schema 5); older files are upgraded on open. Nothing in the app uses them yet (#162)

## 1.32.0 – 2026-11-14

### Changed

- Bring the in-app manual up to date (#171)

## 1.31.0 – 2026-11-14

### Changed

- Manual brought up to date: people are added in Team, the settings chapter and the "Where is each value set?" table name the hourly rate, Load mentions the costs card, the first steps mention the card after Plan new, and a new paragraph explains the phone layout (views menu, ⋯ file menu) (#159)
- First visit: Load, Meetings & cadence and Team show the same card as long as there is no team, with Plan new and Open the example; Meetings & cadence no longer shows the categories without a team, and the sidebar's "No team yet" box no longer squeezes its text (#158)
- The card after Plan new explains that the note about unsaved changes is about the file only, and the wizard names Team as the place for roles and people (#158)

## 1.30.0 – 2026-11-14

### Changed

- Meetings table: the headings Meeting, Next and Cost sort it, and meetings on the same day follow their start time; "By category" groups the rows with each category's cost per week (#150)
- Meetings table is more compact: participants as coloured initials (name on hover or tap), "When" in one short line, Duplicate and Delete in a ⋯ menu; on phones each meeting is a card (#150)

## 1.29.0 – 2026-11-14

### Changed

- Meeting form: participants are aligned rows with the column heads once, a quiet remove button and an add button with an icon; on a phone the role gets a row of its own

## 1.28.0 – 2026-11-14

### Changed

- Friendly 404 page in the Caldence look (#152)

## 1.27.0 – 2026-11-14

### Added

- Search engines, AI assistants and visitors without JavaScript see a short description of Caldence instead of an empty page (#135)
- Search results and shared links show a title, a description and a preview image; caldence.de also tells search engines what Caldence is (structured data) (#136)
- `llms.txt` and `favicon.ico` in the release; caldence.de also gets `robots.txt` and `sitemap.xml` (#137)

## 1.26.0 – 2026-11-14

### Changed

- Faster first start: the included server configurations send text files gzip-compressed (#138)

## 1.25.0 – 2026-11-14

### Changed

- Phones: the file bar is one row. Save stays, New, Open and Save as are in a menu next to it, and the role and person filters share one row

## 1.24.0 – 2026-11-14

### Changed

- Team view: People and Roles are cards of their own and follow right after Members; Assumptions come last

### Fixed

- The mobile menu button and the light and dark appearance buttons keep their contrast on hover

## 1.23.1 – 2026-11-14

### Changed

- deps: Bump the npm group with 2 updates (#133)

## 1.23.0 – 2026-11-13

### Changed

- The Weeks view is now the calendar's third level: Week · Month · Horizon (Woche · Monat · Zeitraum). Horizon shows one row per week of the planning horizon, as the Weeks view did; the sidebar has 8 entries

### Fixed

- The team actions menu keeps focus when it is opened by keyboard right after renaming a team
- Tables: the current week no longer shares the header's tint (a bar on its left edge marks it), and a small gap keeps a row from touching the rounded header corners

## 1.22.0 – 2026-11-13

### Changed

- The cadence and the cycles with their milestones moved from Team to the meetings view, now called Meetings & cadence. The cadence shows as one line above the meetings and opens with Change; changing it keeps an open meeting form

## 1.21.0 – 2026-11-13

### Changed

- People and roles are created in the Team view, where they are assigned; a new person can be added while assigning them
- Weekly hours are set per team: a person can work 20 h in one team and 18 h in another. Workspaces from earlier versions split a person's hours evenly across their teams (schema 4)

## 1.20.1 – 2026-11-13

### Fixed

- The month calendar fits short laptop screens

## 1.20.0 – 2026-11-13

### Changed

- Small UI and copy fixes from the UI scan (#114)

## 1.19.0 – 2026-11-13

### Changed

- Load warnings that mean something (#119)

## 1.18.0 – 2026-11-13

### Changed

- The example's categories are named in the UI language, Meetings lists meetings in the order they next take place, the Weeks table keeps its column headings in view on wide screens, and the settings point to Members & cadence by its name
- Narrow screens: the views, language, appearance and links open from a menu button that shows the current view, instead of a sideways-scrolling row that hid most views
- Calmer sidebar: thin dividers instead of the three group headings, and language and appearance side by side in one row
- Load warnings ignore peaks that come back with the cadence, such as every sprint start, show one line per person with the threshold explained, and sit at full width below the chart; Weeks calls them “Load warning” too. The example's kick-off workshop now takes 4 hours

## 1.17.0 – 2026-11-13

### Changed

- The role and person filters appear only above Calendar, Weeks and Load, where they apply; Load explains that the per-person table covers all teams

## 1.16.0 – 2026-11-13

### Changed

- Consistent cards, widths and spacing (#109)

## 1.15.0 – 2026-11-13

### Added

- Appearance switch below the language: match the system (default), light or dark, remembered in this browser

### Changed

- Calmer cards: no accent line on top, every view uses the full width, no extra space above the first heading or below an empty status line, load tiles line up their values, and the version moved from the sidebar header to its footer
- "+ Add" buttons and colour labels look the same in all lists

## 1.14.0 – 2026-11-12

### Added

- Optional hourly rate in the settings: with it, Meetings shows a cost column and a costs card, and Load shows the costs card with the weekly and horizon totals and the cost per category; without it, no costs are shown

## 1.13.0 – 2026-11-12

### Changed

- Members & cadence: two columns of cards; members show their initials in the role colour with a link to the settings, each cycle shows its milestones on the planning horizon, and add rows use quieter buttons

## 1.12.0 – 2026-11-12

### Changed

- Calendar: icon buttons to page through the months, holidays, school holidays, the cadence and milestones as coloured tags, the day details open next to the day with time, rule and roles and an Edit button that opens the meeting, a legend of the categories, and the week view lists the meetings of each day side by side

## 1.11.0 – 2026-11-12

### Changed

- Load: summary tiles for the total, each role and the peak week, a chart of the hours per week with the average and warning weeks, and one warning line per person and kind of warning

## 1.10.0 – 2026-11-11

### Changed

- Weeks: events are coloured tags in one column, weeks with a high load are named, the total has a bar, and quick filters show only weeks with a warning or a cadence start

## 1.9.0 – 2026-11-11

### Changed

- Meetings: each row shows when it takes place, the next date and the participants as role chips; actions are icons with tooltips, and a filter narrows the list

## 1.8.0 – 2026-11-11

### Changed

- View title and "Show for" filters in one row on wide screens (#88)

## 1.7.0 – 2026-11-11

### Changed

- Sidebar: the team is chosen at the top, its actions sit behind one button; views are grouped and "Team" is now "Members & cadence"
- Save is highlighted only while there are unsaved changes; "Saved" shows in green
- Footer with imprint, privacy and a link to the source code on GitHub
- Start screen: a clearer welcome with one main action, "Plan new", and tiles to open a file or the example
- New logo: a calendar with a heartbeat line
- On wide screens the view title and the "Show for" filters share one row

## 1.6.1 – 2026-11-11

### Changed

- Setup: fix styling and name suggestions in "Plan another team" (#83)

## 1.6.0 – 2026-11-11

### Changed

- Team: plan another team with the wizard (#80)

## 1.5.0 – 2026-11-11

### Fixed

- Deployment: when the SFTP login fails, the log now says why (for example "Host key verification failed" or "Permission denied") instead of only "Connection closed".

## 1.4.0 – 2026-11-11

### Added

- Imprint and privacy page: when the operator puts `imprint.html` or `privacy.html` next to the app, the sidebar shows a link to it. The pages are never part of the release (see `docs/deployment.md`, with a template).
- Deployment: after each release, a separate workflow uploads it to caldence.de by SFTP once the maintainer approves the run. It checks the release's checksum and attestation, uploads the entry points last, keeps the previous release's files for one more deployment and deletes only files an earlier deployment uploaded, never touches the imprint or privacy page, and then runs the smoke test against the live site. It can be started by hand with any published version.

## 1.3.0 – 2026-11-11

### Fixed

- Release: the release workflow approves the held CI runs of its release PR, and the release PR merges itself from that run. Before, the required check only counted after someone clicked "Approve workflows to run".

## 1.2.0 – 2026-11-11

### Changed

- Release: the release PR is merged automatically as soon as CI is green on it, and the release is then published without a click. It is only merged when it holds nothing but the version commit of the release workflow.
- CI: the main check runs in Playwright's container image with the browsers preinstalled, so it no longer spends minutes installing browsers.

## 1.1.1 – 2026-11-10

### Fixed

- Release: when no changelog entry was written since the last release (for example only Dependabot updates), the release PR lists the merged PRs instead of an empty section that made its CI fail.

## 1.1.0 – 2026-11-10

### Security

- Load and weeks (#40): ids such as `__proto__`, `constructor` or `toString` from a workspace or template file no longer change `Object.prototype` or produce wrong numbers. Hours are counted in records without a prototype, an assumption is only read when the team has it, and the calendar import review no longer uses a raw UID as key.
- Large files (#41): a workspace, template or region file can no longer freeze the app. Files above 5 MB are refused before they are read, all dates must be in the years 1900 to 2200, the planning horizon may be at most 5 years long, and there are upper limits for the number of meetings (500 in all), teams, people and other lists, for text lengths and for numbers such as durations and cadence lengths (see `docs/workspace-format.md`). A stored workspace beyond these limits is not restored but kept as a backup. Adding `?reset` to the address starts with an empty workspace in any case.
- Release and CI workflows (#43): actions are pinned to commit SHAs. The release no longer pushes to the protected `main`: merging a PR with a release label opens or updates a release PR with version and changelog, and merging that PR builds the release in a job with a read-only token and publishes it from a separate job without npm. Releases now include a SHA-256 file and a build provenance attestation (see `docs/deployment.md`). Workflow values reach scripts through environment variables, every job has a time limit, and `npm ci` runs without install scripts.
- Security headers (#42): the release sends a Content Security Policy (only the app's own files, no inline scripts or styles, no framing), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy` through `.htaccess`, `web.config` and the nginx example, and `index.html` carries the policy as a `<meta>` tag for hosts without headers. `README.txt` and `web.config` are no longer served. `docs/deployment.md` explains HTTPS redirect, HSTS and a single host name, which are set by the host.
- Security policy (#44): `SECURITY.md` explains how to report a vulnerability privately and what to expect. Dependabot proposes weekly updates for npm packages and GitHub Actions, CodeQL scans the code and the workflows, and CI fails on high or critical `npm audit` advisories.

## 1.0.2 – 2026-11-10

### Security

- Calendar export (#39): ids from a workspace or template file can no longer add lines to an exported .ics file. Ids must now be 1 to 64 characters from `A–Z`, `a–z`, `0–9`, `.`, `_` and `-`; files with other ids are rejected with a message naming the id. The export also removes control characters from every line and quotes the time zone where needed. Ids the app creates itself always had this form.

## 1.0.1 – 2026-11-08

### Changed

- German interface: one term each for FTE (instead of "VZÄ" in the settings) and for the cadence ("Takt" instead of "Taktung").

## 1.0.0 – 2026-11-08

### Added

- Start screen (#19): a workspace without teams shows a welcome page on the Calendar view with the built-in templates, Open a file, the example and links to an empty workspace and the manual.
- Built-in manual (#19): the Help view has a table of contents, guided first steps from the start screen to an .ics export that name the real button and tab labels, a chapter on every view, how the load is calculated, and a section on accessibility. All help texts were brought up to date with the current views.
- Screenshots (#19): `npm run screenshots` generates the README images in English and German (and the calendar in dark mode) from the built app; CI runs it so the script stays working.
- Accessibility audit (#20): an automated audit checks every view at 320 and 640 px width, in forced colours (Windows contrast themes) and with reduced motion, and walks from the start screen to an .ics export with the keyboard only. The results are in `docs/accessibility/audit-2026.md`, and the accessibility statement (`docs/accessibility.md`) describes the target (WCAG 2.2 AA), the tests, known limitations and how to report a problem.

### Fixed

- Accessibility (#20): after opening the example or a file from the start screen, the focus moves to the Calendar tab instead of the page; wide tables (meetings, team members, import review and the manual) can be scrolled with the keyboard; the pressed Month or Week button has a border; today is announced as the current date in the month grid; in forced colours the selected view, the selected day, today and the view mode stay visible; on narrow screens the selected view is underlined.
- Calendar: all seven days of the month stay visible beside the day details on a laptop screen.
- The empty Weeks and Load views use the same label for opening the example as the start screen.

## 0.6.0 – 2026-11-08

### Added

- Installable app (#18): Caldence can be installed from the browser and works offline after the first visit; a prompt offers the new version when an update is available.
- Deployment (#18): the release ZIP includes ready-made server configurations, and a deployment guide (`docs/deployment.md`) explains how to host Caldence yourself.
- Region file import (#6): import a region file with holidays in the workspace settings; it is stored in the workspace file and can be removed again.
- Warning when school holidays are not known for the planning horizon, and a hint when a workspace uses an unknown region (#6).
- Documentation of the workspace file format, with examples that are checked by the tests, and a feature list and quick start in the README.

### Changed

- Workspace files use schema 3 (adds `customRegions`); older files are upgraded when opened.
- The Help view now covers installing the app and importing region files.

## 0.5.0 – 2026-11-08

### Changed

- New look: a dark sidebar with icons for the views, a top bar with Save as the main button, cards for every view, and a refreshed colour scheme in light and dark mode. On narrow screens the sidebar becomes a header.
- The month calendar shows each day's meetings as chips in their category colour, marks today, school holidays and non-working days, and opens the day details next to the grid on wide screens.
- The load view shows category colours and a bar for each role's share of the working week.

## 0.4.0 – 2026-11-08

### Added

- Templates (#15): apply the built-in Scrum, Kanban and SAFe templates in German or English, and import or export your own template files. Templates hold roles, cadence, categories and meetings, but no people.
- Calendar export (#16): export a team, role or person as an .ics file for a chosen period, with optional holidays, school holidays, milestones and reminders. Includes a manual check list for Outlook, Google Calendar and Apple Calendar (`docs/manual-checks/ics-import.md`).
- Calendar import (#17): import meetings from an .ics file (for example from Outlook) after a review that shows what is imported, already present or left out, with a mapping to team, roles and categories.
- Help sections for templates and for importing the .ics file into Outlook, Google Calendar and Apple Calendar.

### Fixed

- German: the hint to add a category before adding meetings now uses the formal "Sie" like the rest of the app.

## 0.3.0 – 2026-11-07

### Added

- Meetings on selected weekdays, for example a Daily Scrum Monday to Friday: new repeat rule "Selected weekdays" with a summary such as "On Monday to Friday" (#15).
- Every workspace has its own id (schema 2), so later calendar exports get stable, collision-free event ids. Older files are upgraded on open.

### Fixed

- Autosave no longer loses the last change when the page is reloaded or closed while that change is still being written.

## 0.2.0 – 2026-11-07

### Added

- Open, save and autosave workspace files (#14): workspace bar (New, Open, Save, Save as), File System Access API with download/upload fallback, unsaved-changes dialog, keyboard shortcuts (Ctrl/Cmd+S, Shift+S, O, Z), IndexedDB autosave with restore after reload, and an example workspace.
- Editing (#9, #10, #11, #12): core edit operations for roles, people, categories, teams, cycles and events with reference checks (`error.ref.inuse`); workspace store with undo (50 steps), dirty flag and file name; form error mapping.
- Workspace settings view (#9, #11): language, region, time zone, workdays, hours, horizon, holidays, thresholds, and editable roles (with colour) and people; deleting a role that is in use asks for a replacement.
- Teams and team view (#10, #11): team switcher (add, rename, duplicate, delete), role and person filter, and per-team members, cadence, cycles with milestones and assumptions.
- Meetings view (#12): event table (rule summary, time, effective duration, roles), inline event form for all six rule types with scaling, participants and preparation in %, categories with colour and replace-on-delete, and undo.
- Calendar view (#13): month grid (APG grid keyboard pattern) with holidays, school holidays, cadence starts, milestones, hours and meeting count per day, week view, navigation, inline day details with person-overlap warnings, and empty-state hints.
- Weeks and load views (#13): weekly table (ISO week, cadence, milestones, holidays, school holidays, hours per role, current week marked) and load tables per category and role, per role and per person with warnings.
- Core view data (#10, #13): region registry, workspace holiday index, filtered occurrences, day load, week rows, load summary and per-person conflicts.
- Help view (#10, #11, #14) in German and English: first steps, where each setting lives (workspace settings or team view), files and autosave, keyboard shortcuts for the platform, and calendar keys; a combined end-to-end test covers the flow from an empty workspace to Save as, reload and Open.

### Changed

- The UI language is now a workspace setting.
- `preparation` is capped at 1 (a fraction); the UI shows and edits it as a percent.
- The person filter scopes cadence and milestones to the teams of the person (shared `scopeTeams`), and `loadSummary` returns a category by role matrix.
- The example team now has a scaled meeting.
- README status updated to phase 2.

### Fixed

- Deleting a role, category, person, cycle or assumption that is still used asks for a replacement or is refused; a used assumption or milestone cannot be removed, and renaming an assumption updates scaling rules.
- Keyed lists no longer crash when milestone names, milestone ids or cadence labels repeat; a workspace file with a duplicate team member (person and role) is rejected; each view has an error fallback so one failing view cannot lock the app.
- After Save in the unsaved-changes dialog, a refused file picker shows a hint instead of a read error; a file dialog that never reports cancel no longer blocks the file buttons.
- Autosave restore migrates the stored workspace before validating it.
- Ctrl/Cmd+S and Ctrl/Cmd+O commit the field being edited first; Ctrl/Cmd+Z is ignored inside forms and while a meeting draft is open.
- Localized percent, peak and warning texts in the load view; shared day item list, scoped markers and details focus in the calendar.

## 0.1.0 – 2026-11-07

- Project setup: Vite, Svelte 5, TypeScript (strict), Vitest, Playwright, ESLint and Prettier.
- Minimal app shell showing the app name and version.
- Core date helpers (UTC-only): parsing, weekday, ISO week, nth weekday of month, Easter, time conversion.
- Workspace model, hand-written validation with i18n error keys, and schema migrations.
- GitHub Actions: CI on pull requests and `main`; automatic versioning and release (ZIP of `dist/`) driven by PR labels.
- Contributor documents: CONTRIBUTING, code of conduct, issue and pull request templates.
- Region files with Saxony public and school holidays (core module, JSON data, format docs).
- Recurrence engine: occurrences of events within the horizon (weekly, every n weeks, monthly nth weekday, cadence day, cycle milestone, once), holiday flagging and scaled durations.
- Project license changed to AGPL-3.0-or-later.
- Load calculation: weekly base load per role and category, load per week and person, FTE and threshold warnings.
- Internationalisation: German and English catalogues, `t`, locale detection, date and number formatting, Svelte locale store; app shell text moved to catalogues.
- Accessible app shell: skip link, nine view tabs (WAI-ARIA), language switch, light/dark tokens, reduced-motion support, WCAG contrast helpers, axe checks in e2e, accessibility checklist.
- Fixed: cadence-day validation is 0-based (day 0 is the cadence start) and rejects days beyond the cadence length.
- Fixed: region validation error paths use dot style (`holidays.0.name`).
- Fixed: release workflow has `pull-requests: read` and no longer releases a hotfix for commits without a PR.
- First released version will be 0.1.0 (package version starts at 0.0.0).
