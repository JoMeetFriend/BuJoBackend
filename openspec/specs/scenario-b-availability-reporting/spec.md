# scenario-b-availability-reporting Specification

## Purpose

TBD - created by archiving change 'scenario-b-availability-redesign'. Update Purpose after archive.

## Requirements

### Requirement: Participant free-form availability reporting

For an activity in `range` availability mode, the system SHALL allow a joined participant to submit one or more time ranges representing when they are available, instead of selecting from creator-defined candidate slots.

#### Scenario: Participant submits a single available range

- **WHEN** a joined participant submits `{ ranges: [{ start, end }] }` to `POST /:id/join`
- **THEN** the system SHALL persist the range as an `ActivityAvailabilityRange` record linked to the participant and the activity

#### Scenario: Participant submits multiple disjoint ranges

- **WHEN** a joined participant submits more than one range in a single request
- **THEN** the system SHALL persist each range as a separate `ActivityAvailabilityRange` record

#### Scenario: Empty submission is rejected

- **WHEN** a participant submits a request with zero ranges
- **THEN** the system SHALL reject the request with a 400 response and SHALL NOT persist any record

#### Scenario: Range outside the creator's time window is rejected

- **WHEN** the activity has a `time_window_start`/`time_window_end` set and a submitted range falls outside that window
- **THEN** the system SHALL reject the request with a 400 response

#### Scenario: Re-submission before formation replaces prior ranges

- **WHEN** a participant who already submitted availability submits new ranges while the activity status is `recruiting` or `voting`
- **THEN** the system SHALL delete the participant's previously stored ranges and persist the new ones

#### Scenario: Creator is treated as always available

- **WHEN** the overlap ranking is computed for an activity created by the current user
- **THEN** the system SHALL count the creator as available for every candidate slot without requiring a stored `ActivityAvailabilityRange` record

<!-- @trace
source: scenario-b-availability-redesign
updated: 2026-07-09
code:
  - prisma/schema.prisma
  - prisma/migrations/20260709133702_add_availability_range/migration.sql
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/computeRangeRanking.test.js
  - src/__tests__/activityStateMachine.test.js
-->

---
### Requirement: Optional creator-defined time window

The system SHALL allow the activity creator to optionally set `time_window_start` and `time_window_end` when creating a `range`-mode activity, constraining the time of day participants can report availability for.

#### Scenario: Creator omits the time window

- **WHEN** the creator does not set `time_window_start`/`time_window_end`
- **THEN** the system SHALL treat the full day (00:00–23:59 of `fixed_date`) as the allowed range for participant submissions

#### Scenario: Creator sets a time window

- **WHEN** the creator sets `time_window_start` and `time_window_end`
- **THEN** the system SHALL reject participant-submitted ranges that fall outside `[time_window_start, time_window_end]`

<!-- @trace
source: scenario-b-availability-redesign
updated: 2026-07-09
code:
  - prisma/schema.prisma
  - prisma/migrations/20260709133702_add_availability_range/migration.sql
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/computeRangeRanking.test.js
  - src/__tests__/activityStateMachine.test.js
-->

---
### Requirement: Overlap ranking computation

The system SHALL compute a ranked list of candidate time slots for a `range`-mode activity by slicing the effective time window into 60-minute segments and counting, for each segment, how many participants (including the creator) have a submitted range covering it.

#### Scenario: Ranking is split into two sections

- **WHEN** the creator requests the ranked candidates for a `voting` or `recruiting` activity in `range` mode
- **THEN** the system SHALL return `decision_candidates` as `{ perfect_overlap: [...], partial_overlap: [...] }`, where `perfect_overlap` contains segments whose count equals the total participant count, and `partial_overlap` contains up to the top 3 remaining segments by count. Each segment entry SHALL include a `temp-`-prefixed identifier derived from its start time (not a real `ActivityCandidateSlot.id`), `slot_start`, `slot_end`, and `count`

#### Scenario: Tied segments are ordered by time

- **WHEN** two or more segments have the same availability count
- **THEN** the system SHALL order them with the earlier segment first

##### Example: ranking three participants' overlapping ranges

| Participant | Range | Notes |
| --- | --- | --- |
| Creator | 18:00–21:00 | always counted available |
| Alice | 18:00–20:00 | |
| Bob | 19:00–21:00 | |

- **GIVEN** the three ranges above and a 60-minute segment size
- **WHEN** the ranking is computed
- **THEN** the segment 19:00–20:00 SHALL appear in the "perfect match" section with count 3, and segments 18:00–19:00 and 20:00–21:00 SHALL appear in the "most available" section with count 2 each, ordered 18:00–19:00 before 20:00–21:00

#### Scenario: No participant has submitted availability

- **WHEN** the ranked candidates are requested and zero `ActivityAvailabilityRange` records exist for the activity
- **THEN** the system SHALL return both `perfect_overlap` and `partial_overlap` as empty arrays

#### Scenario: Submitted availability has zero overlap

- **WHEN** at least one participant submitted availability but no segment has more than 1 participant available
- **THEN** `perfect_overlap` SHALL be empty and `partial_overlap` SHALL show the highest-count segments

<!-- @trace
source: scenario-b-availability-redesign
updated: 2026-07-09
code:
  - prisma/schema.prisma
  - prisma/migrations/20260709133702_add_availability_range/migration.sql
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/computeRangeRanking.test.js
  - src/__tests__/activityStateMachine.test.js
-->

---
### Requirement: Creator confirmation persists the selected slot

The system SHALL accept `{ slotStart, slotEnd }` (not `candidateSlotId`) as the `POST /:id/confirm-formation` body for `range`-mode activities, and SHALL persist the creator's confirmed selection by creating a single `ActivityCandidateSlot` record matching that start/end at confirmation time, linking it via `ActivitySchedule.confirmed_slot_id`. The system SHALL NOT create candidate slot records during activity creation or while `recruiting`/`voting`.

#### Scenario: Creator confirms a ranked segment

- **WHEN** the creator submits `POST /:id/confirm-formation` with `{ slotStart, slotEnd }` matching one of the segments returned in `decision_candidates`
- **THEN** the system SHALL create exactly one `ActivityCandidateSlot` matching that segment's start and end time and set it as `confirmed_slot_id`

#### Scenario: Confirmation slot does not match any ranked segment

- **WHEN** the creator submits `POST /:id/confirm-formation` with `{ slotStart, slotEnd }` that does not match any segment currently in `decision_candidates`
- **THEN** the system SHALL reject the request with a 400 response and SHALL NOT create an `ActivityCandidateSlot`

<!-- @trace
source: scenario-b-availability-redesign
updated: 2026-07-09
code:
  - prisma/schema.prisma
  - prisma/migrations/20260709133702_add_availability_range/migration.sql
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/computeRangeRanking.test.js
  - src/__tests__/activityStateMachine.test.js
-->

---
### Requirement: Vote deadline auto-cancellation

For a `range`-mode activity in `voting` status, the system SHALL automatically transition the activity to `cancelled` when `vote_deadline_at` has passed and the creator has not confirmed a slot.

#### Scenario: Creator misses the vote deadline

- **WHEN** a lazy status check runs for an activity in `voting` status where `vote_deadline_at < now` and `confirmed_slot_id` is still unset
- **THEN** the system SHALL transition the activity to `cancelled` and SHALL notify all participants

<!-- @trace
source: scenario-b-availability-redesign
updated: 2026-07-09
code:
  - prisma/schema.prisma
  - prisma/migrations/20260709133702_add_availability_range/migration.sql
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/computeRangeRanking.test.js
  - src/__tests__/activityStateMachine.test.js
-->

---
### Requirement: Zero-submission cancellation without a participant cap

For a `range`-mode activity with no `participant_target` set, the system SHALL automatically transition the activity to `cancelled` when `deadline_at` has passed and no participant other than the creator has submitted any availability.

#### Scenario: Recruiting deadline passes with no submissions and no cap

- **WHEN** a lazy status check runs for a `recruiting`, `range`-mode activity where `participant_target` is null, `deadline_at < now`, and no `ActivityAvailabilityRange` record exists for any participant other than the creator
- **THEN** the system SHALL transition the activity to `cancelled` and SHALL notify the creator

<!-- @trace
source: scenario-b-availability-redesign
updated: 2026-07-09
code:
  - prisma/schema.prisma
  - prisma/migrations/20260709133702_add_availability_range/migration.sql
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/computeRangeRanking.test.js
  - src/__tests__/activityStateMachine.test.js
-->

---
### Requirement: Join rejects activities past their deadline

Regardless of availability mode, the system SHALL reject a join request when the activity's `deadline_at` has already passed, even if the activity's stored status has not yet been transitioned by a lazy check.

#### Scenario: Joining an expired but not-yet-transitioned activity

- **WHEN** a user submits `POST /:id/join` for an activity whose `status` is still `recruiting` but `deadline_at < now`
- **THEN** the system SHALL reject the request with an error indicating the activity has expired, and SHALL NOT create an `ActivityParticipant` record

<!-- @trace
source: scenario-b-availability-redesign
updated: 2026-07-09
code:
  - prisma/schema.prisma
  - prisma/migrations/20260709133702_add_availability_range/migration.sql
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/computeRangeRanking.test.js
  - src/__tests__/activityStateMachine.test.js
-->
