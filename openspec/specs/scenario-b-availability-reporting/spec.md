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

The system SHALL compute a ranked list of candidate time slots for a `range`-mode activity by slicing the effective time window into 60-minute segments, counting for each segment how many real participants (excluding the creator) have a submitted range covering it, then merging adjacent segments that share the same count into a single entry.

#### Scenario: Ranking is a single array sorted by support

- **WHEN** the creator requests the ranked candidates for a `voting` or `recruiting` activity in `range` mode
- **THEN** the system SHALL return `decision_candidates` as a single array sorted by `count` in descending order, replacing the previous `{ perfect_overlap, partial_overlap }` structure
- **AND** each entry SHALL include a `temp-`-prefixed identifier derived from its start time (not a real `ActivityCandidateSlot.id`), `slot_start`, `slot_end`, `count`, `is_unanimous` (whether `count` equals the number of real participants who submitted a range), and `supporters` (an array of `{user_id, display_name, avatar_url}` for every participant covering this segment)

#### Scenario: Adjacent segments with equal count and identical supporters are merged

- **WHEN** two or more time-adjacent 60-minute segments have exactly the same count AND the exact same set of covering participants
- **THEN** the system SHALL combine them into a single entry spanning from the earliest segment's `slot_start` to the latest segment's `slot_end`

#### Scenario: A count change breaks the merge

- **WHEN** a segment's count differs from the immediately preceding segment's count
- **THEN** the system SHALL start a new entry at that segment, even if the preceding segments were merged together

#### Scenario: Equal count but different supporters does not merge

- **WHEN** two time-adjacent 60-minute segments have the same count but the participants covering them are not the same set of people (a hand-off, e.g. one participant's range ends exactly where a different participant's range begins)
- **THEN** the system SHALL keep them as separate entries, even though their `count` values are equal

##### Example: adjacent same-count segments from different people are not merged

| Participant | Range |
| --- | --- |
| Alice | 09:00–10:00 |
| Bob | 10:00–11:00 |

- **GIVEN** the two ranges above and a 60-minute segment size
- **WHEN** the ranking is computed
- **THEN** the entry for 09:00–10:00 SHALL have count 1 with `supporters` containing only Alice
- **AND** the entry for 10:00–11:00 SHALL have count 1 with `supporters` containing only Bob
- **AND** these two entries SHALL remain separate, not merged into a single 09:00–11:00 entry

##### Example: overlapping ranges producing count changes across the window

| Participant | Range |
| --- | --- |
| Alice | 18:00–19:00 |
| Bob | 18:00–21:00 |

- **GIVEN** the two ranges above, a 60-minute segment size, and 2 real participants total
- **WHEN** the ranking is computed
- **THEN** the entry for 18:00–19:00 SHALL have count 2 (Alice, Bob) and `is_unanimous: true`
- **AND** the entry for 19:00–21:00 SHALL have count 1 (Bob only), `is_unanimous: false`, merged into one entry since both its underlying 19:00–20:00 and 20:00–21:00 segments share count 1
- **AND** these two entries SHALL NOT be merged with each other since their counts differ (2 vs 1)

#### Scenario: Tied segments are ordered by time

- **WHEN** two or more entries have the same count after merging
- **THEN** the system SHALL order them with the earlier entry first

##### Example: two same-count entries from different participant subsets

| Participant | Range |
| --- | --- |
| Alice | 09:00–10:00 |
| Bob | 09:00–10:00 |
| Carol | 14:00–15:00 |
| Dave | 14:00–15:00 |

- **GIVEN** the four ranges above and a 60-minute segment size
- **WHEN** the ranking is computed
- **THEN** both 09:00–10:00 and 14:00–15:00 SHALL have count 2
- **AND** the entry for 09:00–10:00 SHALL appear before the entry for 14:00–15:00 in `decision_candidates`

#### Scenario: No participant has submitted availability

- **WHEN** the ranked candidates are requested and zero `ActivityAvailabilityRange` records exist for the activity
- **THEN** the system SHALL return `decision_candidates` as an empty array

#### Scenario: Submitted availability has zero overlap

- **WHEN** at least one participant submitted availability but no segment has more than 1 participant available
- **THEN** `decision_candidates` SHALL still include those single-participant segments; the system SHALL NOT filter out non-unanimous entries


<!-- @trace
source: decision-view-ux-redesign
updated: 2026-07-12
code:
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/computeRangeRanking.test.js
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/computeSlotOverlapRanking.test.js
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
### Requirement: Zero-submission cancellation without a participant cap

For a `range`-mode activity with no `participant_target` set, the system SHALL automatically transition the activity to `cancelled` when `vote_deadline_at` has passed and no participant other than the creator has submitted any availability.

#### Scenario: Recruiting deadline passes with no submissions and no cap

- **WHEN** a lazy status check runs for a `recruiting`, `range`-mode activity where `participant_target` is null, `vote_deadline_at < now`, and no `ActivityAvailabilityRange` record exists for any participant other than the creator
- **THEN** the system SHALL transition the activity to `cancelled` and SHALL notify the creator

<!-- @trace
source: deadline-model-redesign
code:
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/activityStateMachine.test.js
-->


<!-- @trace
source: deadline-model-redesign
updated: 2026-07-12
code:
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/computeRangeRanking.test.js
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/collectOverlappingCoParticipants.test.js
  - src/__tests__/computeSlotOverlapRanking.test.js
-->

---
### Requirement: Join rejects activities past their deadline

Regardless of availability mode, the system SHALL reject a join request when the activity's `vote_deadline_at` has already passed, even if the activity's stored status has not yet been transitioned by a lazy check.

#### Scenario: Joining an expired but not-yet-transitioned activity

- **WHEN** a user submits `POST /:id/join` for an activity whose `status` is still `recruiting` but `vote_deadline_at < now`
- **THEN** the system SHALL reject the request with an error indicating the activity has expired, and SHALL NOT create an `ActivityParticipant` record

<!-- @trace
source: deadline-model-redesign
code:
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/activityStateMachine.test.js
-->


<!-- @trace
source: deadline-model-redesign
updated: 2026-07-12
code:
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/computeRangeRanking.test.js
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/collectOverlappingCoParticipants.test.js
  - src/__tests__/computeSlotOverlapRanking.test.js
-->

---
### Requirement: Range-mode cancellation removes stored availability ranges

The system SHALL remove a participant's stored availability ranges when that participant cancels joining a range-mode activity.

#### Scenario: Participant cancels a range-mode activity

- **WHEN** a joined participant cancels joining a range-mode activity whose status is `recruiting`
- **THEN** the system SHALL mark the participant as left
- **AND** the system SHALL delete that participant's `ActivityAvailabilityRange` records for the activity

#### Scenario: Cancelled participant is excluded from range ranking

- **WHEN** range-mode decision candidates are computed after a participant has cancelled joining
- **THEN** the cancelled participant's old availability ranges SHALL NOT contribute to any `decision_candidates` entry

<!-- @trace
source: decision-view-ux-redesign
updated: 2026-07-12
code:
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/computeRangeRanking.test.js
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/computeSlotOverlapRanking.test.js
-->

---
### Requirement: my_ranges expose overlapping co-participants to non-creator viewers

For a `range`-mode activity, when the requesting user is not the creator, each entry in the `my_ranges` field of the activity detail response SHALL include a `co_participants` array listing every other real participant (excluding the creator and excluding the requesting user) whose own submitted range overlaps this range's time span.

#### Scenario: Overlapping submitter appears in co_participants

- **WHEN** the requesting user submitted a range of 18:00–20:00, and another real participant submitted a range of 19:00–21:00
- **THEN** the `my_ranges` entry for 18:00–20:00 SHALL include the other participant in `co_participants`

#### Scenario: Non-overlapping submitter does not appear in co_participants

- **WHEN** the requesting user submitted a range of 09:00–10:00, and another real participant submitted a range of 10:00–11:00 (a hand-off with no actual time overlap)
- **THEN** the `my_ranges` entry for 09:00–10:00 SHALL NOT include the other participant in `co_participants`

#### Scenario: The creator's own submission never appears in co_participants

- **WHEN** the activity's creator has a stored `ActivityAvailabilityRange` overlapping the requesting user's range
- **THEN** the creator SHALL NOT appear in `co_participants`

<!-- @trace
source: decision-view-participant-scope
updated: 2026-07-12
code:
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/collectOverlappingCoParticipants.test.js
  - src/__tests__/computeSlotOverlapRanking.test.js
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/computeRangeRanking.test.js
-->