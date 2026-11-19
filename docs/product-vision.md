# Caldence product vision

This page is the yardstick for every change proposal. Words follow the [glossary](glossary.md).

## Vision

Caldence lets an Agile Coach build the meeting system of teams and areas in minutes and show everyone the same picture of it: when people meet, how much of their time it takes and what it costs, before anyone argues about it.

## Target users

Builders create and change plans; readers come with one question and mostly see the coach's screen or file.

1. **Agile Coach** (primary, builder): sets up teams, cadences and areas from templates, tries what-ifs while presenting the app on a projector in workshops and hands out calendars.
2. **Product Owner** (builder): builds their own team's cadence, gets it into Outlook as `.ics` and wants to know what meetings cost.
3. **Area lead** (reader): whether the teams' cadences are aligned and what their meetings cost, as a figure for a budget talk.
4. **People manager** (reader): meeting load per person and role, who is over the limit and who has room.

## Problems Caldence solves

- Recurring meetings of several teams are planned in heads and spreadsheets; nobody sees whether cadences are aligned or where they collide.
- The time and money a framework's meetings take is invisible, so "do we need this meeting?" has no numbers.
- Getting a planned cadence into everyone's calendar is manual work.
- Trying a what-if ("3-week sprints?", "half the refinement?") means guessing its effect.

## Product principles

- **Local-first, one file.** Everything stays in the browser; the workspace is one file the user saves, opens and sends (autosaved in the browser). No accounts, no server storage.
- **Static files only.** The app runs from any web server; no server-side logic.
- **Simple over complete.** The smallest change that solves a real problem; no configuration for edge cases; one app for all personas, no persona modes.
- **Answers before editors.** The first screen of a scope answers the reader's question; editing is one step further in and never happens by accident.
- **Numbers you can quote.** One question has one number on every screen. Every figure carries its unit, its period and what it counts (meeting time, not total workload). One limit from Settings.
- **Readable on a projector and usable on a phone.** Present mode for workshops; phones for looking something up, never scrolling sideways.
- **Bring the end goal to the work.** Outlook export and budget figures sit where planning happens.
- **Accessible and bilingual.** WCAG 2.2 AA, German and English, the file's own level words (for example Platform / Product).

## What Caldence is not

- Not a tool for finding free slots or booking rooms; single meetings exist only as part of a plan.
- Not a total workload or capacity planner; it measures meeting time only.
- Not a collaboration server: no shared online plans, no live sync between users, no accounts.
- Not a time-tracking or HR tool.

## Current focus themes

1. **Workshop flow:** show the system, change one thing as a what-if, everyone sees the effect, back to the overview in one click.
2. **Trustworthy numbers:** hours, shares, FTE and cost agree across tiles, tables and views, also for people in several teams.
3. **What-ifs that hold:** what-ifs (sprint length, duration, rhythm) give a correct calendar, load and cost, also while editing.
4. **Answers that leave the room:** cost per team per week and in the planning horizon, print and export that open on the right selection.
5. **Readers find the answer:** area Overview and Meeting load answer their question on the first screen, on a projector and on a phone.

## Changes

- 2026-11-19 (Caldence 2, #387): the start screen asks for the role and each role sets up its own level of the same organisation (line teams, an area, one team, the whole organisation). This is a way in, not a persona mode: afterwards everyone uses the same app, and readers still get the file from a builder.
- 2026-11-18: created from the app (1.44), the personas and the builders/readers split; focus themes reflect proposals #272 to #281.
