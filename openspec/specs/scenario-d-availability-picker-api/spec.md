# scenario-d-availability-picker-api Specification

## Purpose

TBD - created by archiving change 'scenario-d-availability-picker-join'. Update Purpose after archive.

## Requirements

### Requirement: Scenario D vote deadline anchored to latest candidate slot

For an activity using slot voting where the schedule variant is `find_date_time`, the system SHALL anchor the decision deadline ceiling (`deadline_at`) to the latest `slot_start` across all candidate slots. The registration deadline (`vote_deadline_at`) SHALL be computed by subtracting the creator-selected offset from `deadline_at`, and SHALL always resolve to a timestamp strictly earlier than `deadline_at`.

#### Scenario: Activity creation sets deadline_at to the latest candidate slot

- **WHEN** an activity is created with schedule variant `find_date_time` and multiple candidate slots across different dates and times
- **THEN** the system SHALL set `deadline_at` to the maximum `slot_start` among all candidate slots

#### Scenario: Earlier candidate slot passing does not force a decision

- **WHEN** the current time is past the earliest candidate slot's `slot_start` but before `vote_deadline_at`
- **THEN** the activity status SHALL remain `recruiting`
- **AND** voting SHALL remain open for all candidate slots

#### Scenario: Registration deadline passing transitions the activity out of recruiting

- **WHEN** the current time is at or past `vote_deadline_at`
- **THEN** the system SHALL transition the activity out of `recruiting` using the current vote counts

#### Scenario: Latest candidate slot passing without confirmation auto-cancels

- **WHEN** the current time is at or past `deadline_at`, the activity is in `voting` status, and the creator has not called `confirmFormation`
- **THEN** the system SHALL transition the activity to `cancelled`, per the cross-scenario requirement in `activity-formation-confirmation`

<!-- @trace
source: deadline-model-redesign
code:
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
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
### Requirement: Scenario D slot resubmission during recruiting

The join API SHALL allow a joined participant to replace their selected candidate slots for a `find_date_time` activity while the activity status is `recruiting`, using the same replace semantics already defined for `find_date` activities.

#### Scenario: Joined participant replaces selected candidate slots

- **WHEN** a joined participant submits new `candidateSlotIds` (and optionally `candidateSlotRanges`) for a `find_date_time` activity whose status is `recruiting`
- **THEN** the system SHALL delete that participant's previous `ActivityAvailability` rows for the activity
- **AND** the system SHALL persist the new `ActivityAvailability` rows
- **AND** the system SHALL NOT create a duplicate participant row

#### Scenario: Joined participant tries to replace after recruiting

- **WHEN** a joined participant submits new `candidateSlotIds` for a `find_date_time` activity whose status is `voting` or `confirmed`
- **THEN** the system SHALL reject the request
- **AND** the stored `ActivityAvailability` rows SHALL remain unchanged


<!-- @trace
source: scenario-d-availability-picker-join
updated: 2026-07-11
code:
  - prisma/migrations/20260711003217_add_availability_range_to_candidate_slot_vote/migration.sql
  - prisma/schema.prisma
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/activityStateMachine.test.js
-->

---
### Requirement: Participant sub-range within a candidate slot

The join API SHALL accept an optional `candidateSlotRanges` array of `{candidateSlotId, rangeStart, rangeEnd}` entries alongside `candidateSlotIds`, allowing a participant to record the specific sub-interval they selected within a candidate slot's time window.

#### Scenario: Sub-range within slot bounds is accepted

- **WHEN** a participant submits a `candidateSlotRanges` entry whose `rangeStart` and `rangeEnd` fall within the referenced candidate slot's `slot_start` and `slot_end`
- **THEN** the system SHALL persist `range_start` and `range_end` on the corresponding `ActivityAvailability` row

#### Scenario: Sub-range outside slot bounds is rejected

- **WHEN** a participant submits a `candidateSlotRanges` entry whose `rangeStart` or `rangeEnd` falls outside the referenced candidate slot's `slot_start`/`slot_end`
- **THEN** the system SHALL reject the entire join request with a 400 response
- **AND** the system SHALL NOT persist any `ActivityAvailability` rows from that request

#### Scenario: Vote without a sub-range still counts

- **WHEN** a participant submits `candidateSlotIds` without a matching entry in `candidateSlotRanges`
- **THEN** the system SHALL persist the `ActivityAvailability` row with `range_start` and `range_end` set to `null`
- **AND** the vote SHALL count toward `is_selected` the same as any other vote


<!-- @trace
source: scenario-d-availability-picker-join
updated: 2026-07-11
code:
  - prisma/migrations/20260711003217_add_availability_range_to_candidate_slot_vote/migration.sql
  - prisma/schema.prisma
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/activityStateMachine.test.js
-->

---
### Requirement: Activity detail exposes the current user's selected sub-range per candidate slot

The activity detail API SHALL expose a `my_range` field on each `candidate_slots` entry, reflecting the current user's own stored sub-range for that slot, if any.

#### Scenario: User has a stored sub-range for a slot

- **WHEN** the requesting user has an `ActivityAvailability` row for a candidate slot with non-null `range_start`/`range_end`
- **THEN** the corresponding `candidate_slots` entry in the response SHALL include `my_range: { start, end }` as ISO strings

#### Scenario: User voted without a sub-range

- **WHEN** the requesting user has an `ActivityAvailability` row for a candidate slot with null `range_start`/`range_end`, or has no row at all for that slot
- **THEN** the corresponding `candidate_slots` entry SHALL include `my_range: null`

<!-- @trace
source: scenario-d-availability-picker-join
updated: 2026-07-11
code:
  - prisma/migrations/20260711003217_add_availability_range_to_candidate_slot_vote/migration.sql
  - prisma/schema.prisma
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/activityStateMachine.test.js
-->

---
### Requirement: Scenario D candidate dates accept only one time slot

For an activity being created with schedule variant `find_date_time`, the system SHALL reject the request with a 400 response if the submitted `dateSlots` array contains more than one entry for the same `date`.

#### Scenario: Duplicate date in dateSlots is rejected

- **WHEN** an activity is created with schedule variant `find_date_time` and `dateSlots` contains two or more entries sharing the same `date` value
- **THEN** the system SHALL reject the request with a 400 response
- **AND** the system SHALL NOT create the activity or any candidate slots

#### Scenario: One slot per date is accepted

- **WHEN** an activity is created with schedule variant `find_date_time` and every entry in `dateSlots` has a distinct `date` value
- **THEN** the system SHALL create one candidate slot per date as before


<!-- @trace
source: scenario-d-matching-rework
updated: 2026-07-11
code:
  - API_DOCS.md
  - prisma/schema.prisma
  - src/controllers/activityController.js
  - .agents/skills/spectra-sync-specs/SKILL.md
  - prisma/migrations/20260711003217_add_availability_range_to_candidate_slot_vote/migration.sql
tests:
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/computeSlotOverlapRanking.test.js
-->

---
### Requirement: Scenario D computes sub-range overlap ranking per candidate slot

For a `find_date_time` activity, the system SHALL compute a per-candidate-slot overlap ranking from participants' submitted sub-ranges (`range_start`/`range_end`), using the same 60-minute segment coverage-counting and adjacent-equal-count merging approach as the scenario B range-mode ranking, scoped to each candidate slot's own `slot_start`~`slot_end` window. A participant who voted for a candidate slot without submitting a sub-range SHALL be treated as covering the slot's entire window for this computation. The creator SHALL NOT be counted in this ranking.

#### Scenario: Overlap ranking scoped to a single candidate slot's window

- **WHEN** the system computes the overlap ranking for a candidate slot with `slot_start` 09:00 and `slot_end` 12:00
- **THEN** the segments used for the ranking SHALL fall entirely within 09:00~12:00
- **AND** sub-ranges submitted for other candidate slots SHALL NOT affect this ranking

##### Example: three participants with different sub-ranges

- **GIVEN** a candidate slot 09:00~12:00 with three real participants who voted for it: A submitted 09:00~10:00, B submitted 09:30~11:00, C voted without a sub-range
- **WHEN** the system computes the overlap ranking for this slot, using fixed 60-minute segments starting at 09:00
- **THEN** the merged entry for 09:00~10:00 SHALL show count 3 (A, B, and C all cover it) and `is_unanimous: true`
- **AND** the entry for 10:00~11:00 SHALL show count 2 (B and C cover it, A does not) and `is_unanimous: false`
- **AND** the entry for 11:00~12:00 SHALL show count 1 (only C covers it) and `is_unanimous: false`
- **AND** each entry SHALL include a `supporters` array listing the covering participants' `user_id`, `display_name`, and `avatar_url`

#### Scenario: Participant without a sub-range counts as available for the whole slot

- **WHEN** a participant voted for a candidate slot and submitted no matching `candidateSlotRanges` entry for it
- **THEN** every segment within that candidate slot's window SHALL count this participant as available

#### Scenario: Adjacent equal-count segments within a slot are merged

- **WHEN** two or more time-adjacent 60-minute segments within the same candidate slot have exactly the same count AND the exact same set of covering participants
- **THEN** the system SHALL combine them into a single entry spanning from the earliest segment's `slot_start` to the latest segment's `slot_end`, the same merging behavior used for scenario B (including not merging same-count segments whose supporters differ)


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
### Requirement: Scenario D formation confirmation creates a slot from the computed overlap window

When confirming formation for a `find_date_time` activity, the creator SHALL select a segment from the merged overlap ranking of a candidate slot (computed per the previous requirement) rather than the candidate slot's original full bounds. The system SHALL create a new `ActivityCandidateSlot` at confirmation time using the selected segment's start and end, following the same on-demand slot creation pattern used by scenario B's range mode.

#### Scenario: Confirming a computed overlap segment creates the final slot

- **WHEN** the creator confirms formation for a `find_date_time` activity by submitting a candidate slot's overlap segment start/end matching one of the entries in that candidate slot's merged ranking
- **THEN** the system SHALL create a new candidate slot with `slot_start`/`slot_end` matching the selected segment
- **AND** the system SHALL set this new slot as `confirmed_slot_id`

#### Scenario: Confirming a segment not in the computed ranking is rejected

- **WHEN** the creator submits a start/end time that does not match any entry in the computed overlap ranking for the chosen candidate slot
- **THEN** the system SHALL reject the request with a 400 response


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
### Requirement: Decision candidates response groups merged segments under their candidate slot

For a `find_date_time` activity, the `getActivity` response's `decision_candidates` SHALL be an array of one entry per candidate slot, each including that slot's own `id`, `slot_start`, `slot_end`, `count` (total participants who voted for this candidate slot), and a `segments` array containing the merged overlap ranking entries for that slot (replacing the previous `perfect_overlap`/`partial_overlap` pair).

#### Scenario: Each candidate slot shows its own merged segment list

- **WHEN** the creator views a `find_date_time` activity in `voting` status with two candidate slots, each having its own submitted sub-ranges
- **THEN** the response SHALL include two `decision_candidates` entries, one per candidate slot
- **AND** each entry's `segments` array SHALL contain only the merged overlap segments computed from that candidate slot's own sub-ranges

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
### Requirement: candidate_slots expose overlapping co-participants to non-creator viewers

For a `find_date_time` activity, when the requesting user is not the creator, each entry in the `candidate_slots` field of the activity detail response where `is_selected` is `true` SHALL include a `co_participants` array. This array SHALL be derived from that candidate slot's merged overlap ranking (per "Scenario D computes sub-range overlap ranking per candidate slot"): every real participant (excluding the creator and excluding the requesting user) whose covering segment overlaps the requesting user's own sub-range (`my_range`), or the candidate slot's entire window if the requesting user voted without a sub-range. Entries where `is_selected` is `false` SHALL have an empty `co_participants` array.

#### Scenario: Overlapping sub-range co-participant appears

- **WHEN** the requesting user submitted a sub-range of 09:00–10:00 for a candidate slot, and another real participant submitted 09:30–11:00 for the same slot
- **THEN** the `candidate_slots` entry for that slot SHALL include the other participant in `co_participants`

#### Scenario: Non-overlapping sub-range does not appear

- **WHEN** the requesting user submitted a sub-range of 09:00–10:00 for a candidate slot, and another real participant submitted 10:00–11:00 for the same slot (a hand-off with no actual time overlap)
- **THEN** the `candidate_slots` entry for that slot SHALL NOT include the other participant in `co_participants`

#### Scenario: No sub-range treats the whole slot window as the requesting user's own range

- **WHEN** the requesting user voted for a candidate slot without submitting a sub-range
- **THEN** `co_participants` SHALL include every other real participant whose covering segment falls anywhere within that candidate slot's `slot_start`~`slot_end` window

#### Scenario: Unselected candidate slots do not leak other participants' choices

- **WHEN** the requesting user did not vote for a candidate slot
- **THEN** that `candidate_slots` entry SHALL have `co_participants: []`

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