# scenario-d-availability-picker-api Specification

## Purpose

TBD - created by archiving change 'scenario-d-availability-picker-join'. Update Purpose after archive.

## Requirements

### Requirement: Scenario D vote deadline anchored to latest candidate slot

For an activity using slot voting where the schedule variant is `find_date_time`, the system SHALL anchor the forced-decision deadline (`vote_deadline_at`) to the latest `slot_start` across all candidate slots, not to the creator-configured reminder deadline (`deadline_at`), which anchors to the earliest possible date.

#### Scenario: Activity creation sets vote_deadline_at to the latest candidate slot

- **WHEN** an activity is created with schedule variant `find_date_time` and multiple candidate slots across different dates and times
- **THEN** the system SHALL set `vote_deadline_at` to the maximum `slot_start` among all candidate slots

#### Scenario: Earlier candidate slot passing does not force a decision

- **WHEN** the current time is past the earliest candidate slot's `slot_start` but before `vote_deadline_at`
- **THEN** the activity status SHALL remain `recruiting`
- **AND** voting SHALL remain open for all candidate slots

#### Scenario: Latest candidate slot passing forces a decision

- **WHEN** the current time is at or past `vote_deadline_at`
- **THEN** the system SHALL transition the activity out of `recruiting` using the current vote counts


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
