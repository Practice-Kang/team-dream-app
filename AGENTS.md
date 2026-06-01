# AGENTS.md

## Project

This repository is for `꿈꾸민턴`, a badminton club of about 100 members, to build a mobile-first doubles matching web app for club meetups.

The app should help organizers prepare and run men's doubles, women's doubles, and mixed doubles games without manually writing name labels or moving magnets on a board.

Primary goals:

- Let organizers quickly select today's attendees on mobile.
- Generate doubles matches from selected attendees.
- Respect the number of available courts per round.
- Clearly separate players assigned to games from waiting players.
- Reduce repeated partners/opponents, excessive consecutive play, and long waits over time.
- Show match order and court assignments in a way members can understand at the gym.

## Source Materials

- Google Sheet: <https://docs.google.com/spreadsheets/d/1IWyUCa6DJCJ2ET-DTNQLoEkHw9tcx42w3CWCR196dMQ>
- Notion user-story draft: <https://knowing-vegetable-bb9.notion.site/372735f79f1d80bba2f1ecc27046a55f>

Use these as product context. If the sheet or Notion content matters for implementation details, re-check the live source instead of relying only on this file.

## Data Source

For the first version, do not introduce a separate database unless the user explicitly changes the requirement.

Use the Google Sheet `회원명단` tab as the member source of truth. The app must treat it as read-only.

Known `회원명단` columns:

- `No`
- `회원명`
- `가입일`
- `성별`
- `운영진(Y/N)`
- `면제(Y/N)`
- `비고`

Additional observed tabs:

- `오늘체크`: daily attendance/check view, including current date, total member count, check count, and member list.
- `관리 자동화`: Apps Script-driven maintenance/sync notes. It says member-list cleanup sorts `회원명단` by join date, renumbers `No`, and syncs today's check/dashboard views.

As of 2026-06-01, the sheet showed 102 total members. Treat this number as dynamic.

Important data rules:

- Do not write to or mutate the original Google Sheet from the matching app in MVP.
- Avoid storing credentials, sheet exports, or private member data in the repository.
- Normalize member names carefully, but do not silently merge different people with similar names.
- Handle blank trailing columns and partially empty rows from Google Sheets CSV/export responses.
- Keep gender values compatible with the sheet's Korean values: `남`, `여`.

## Product Users

Primary user: organizer/game runner.

They need to select attendees, set court count, generate matches, reshuffle, advance rounds, and share results while also participating in games.

Secondary user: regular member.

They need to quickly understand whether they are playing or waiting, which court they are on, who their partner is, and who they are playing against.

## MVP Scope

Include:

- Mobile member list from `회원명단`.
- Attendee selection and deselection.
- Selected attendee count.
- Selected attendee review/removal.
- Optional name search; 초성 search can wait unless requested.
- Court count setting.
- Doubles match generation.
- Waiting-player display.
- Reshuffle/regenerate action.
- Copyable match result text.
- Mobile browser access.
- Read-only sheet data access.

Exclude for MVP:

- Login.
- Member creation, editing, or deletion.
- Saving attendance back to the sheet.
- Saving match results to a database.
- Organizer permission management.
- Real-time collaborative editing.
- Long-term statistics.
- Payments or dues.
- Direct integration with the 소모임 app.

## Priorities

P0:

- Mobile member list.
- Attendee selection.
- Court count input.
- Doubles match generation.
- Waiting-player display.
- Read-only data lookup.

P1:

- Name search.
- Next-round generation.
- Today's accumulated game count.
- Consecutive-wait prevention.
- Result copy/share.

P2:

- Skill balancing.
- Gender balancing.
- Repeated partner prevention.
- Repeated opponent prevention.
- Match history persistence.
- Organizer-only features.
- 소모임 app integration.

## Matching Domain Rules

Assume one doubles game needs exactly 4 players.

Round capacity:

- `gamesPerRound = min(courtCount, floor(attendeeCount / 4))`
- `playersPerRound = gamesPerRound * 4`
- Remaining attendees are waiting players.

The matching algorithm should be explainable. Prefer clear scoring and deterministic tie-breaking over opaque randomness.

When improving fairness, consider:

- Lower priority for players who played in the immediately previous round.
- Higher priority for players who have waited longer.
- Balance total games played today.
- Avoid repeated partners before avoiding repeated opponents if a tradeoff is needed.
- Avoid very uneven games when skill data becomes available.
- Consider gender composition for men's doubles, women's doubles, and mixed doubles, but do not invent unavailable gender/skill data.

For MVP, it is acceptable to start with simple fair rotation and reshuffle behavior, then add stronger balancing once match history and skill inputs exist.

## UX Guidance

Design for gym-floor mobile use:

- Large tap targets.
- Fast selection/deselection.
- Clear selected count and court count.
- Results visible at a glance.
- Distinguish playing vs waiting strongly.
- Avoid dense admin screens during the active meetup flow.
- Keep Korean labels natural and short.

The first screen should be the usable matching workflow, not a marketing landing page.

## Engineering Guidance

There is no established stack yet. When scaffolding starts, choose a simple web stack that supports fast mobile UI iteration and static/light backend deployment.

Keep the first implementation small:

- Separate sheet fetching/parsing from matching logic.
- Make matching logic pure and unit-testable.
- Add tests around round capacity, waiting players, gender constraints, repeated players, and reshuffle behavior.
- Keep member data types explicit.
- Make sheet access replaceable so a future database can be added without rewriting the matching engine.

Recommended core concepts:

- `Member`: stable member identity from `회원명단`.
- `Attendee`: a member selected for today's meetup.
- `Match`: court number, team A, team B, and match type.
- `Round`: generated matches plus waiting attendees.
- `SessionState`: today's selected attendees, court count, rounds, and per-member play/wait counts.

Do not add persistence, authentication, or admin management unless the user asks for it.

## Success Criteria

The first useful version succeeds when:

- Organizers can select attendees without name labels.
- Organizers can create initial game groups without the magnet board.
- Games and waiting players are automatically separated according to court count.
- Mobile operation feels comfortable during a live meetup.
- Members can easily understand match results.
- The original Google Sheet remains unchanged.
- The organizer's matching burden is meaningfully reduced.
