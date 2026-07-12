# activity-formation-confirmation Specification

## Purpose

TBD - created by archiving change 'scenario-d-matching-rework'. Update Purpose after archive.

## Requirements

### Requirement: Formation decision candidates are not filtered to only the leading option

For a voting-based activity (schedule variant `find_date` or `find_date_time`) in status `recruiting` or `voting`, the `decision_candidates` returned by the activity detail API SHALL include every candidate slot, not only the slot(s) tied for the highest support, sorted by support in descending order.

#### Scenario: Non-leading candidate slots remain visible to the creator

- **WHEN** an activity has candidate slot X with 3 votes and candidate slot Y with 2 votes
- **THEN** `decision_candidates` SHALL include both X and Y
- **AND** X SHALL appear before Y in the list

#### Scenario: find_date activity ranks candidates by vote count and identifies supporters

- **WHEN** the activity's schedule variant is `find_date`
- **THEN** each `decision_candidates` entry SHALL include the candidate slot's `id`, `slot_start`, `slot_end`, `count`, `is_unanimous` (whether `count` equals the number of real participants who submitted a vote, excluding the creator), and `supporters` (an array of `{user_id, display_name, avatar_url}` for every participant who voted for this slot)


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
### Requirement: Creator may confirm any listed candidate, not only the top-ranked one

For a `find_date` activity, `confirmFormation` SHALL accept any `candidateSlotId` that belongs to the activity's existing candidate slots, regardless of its vote count relative to other candidates.

#### Scenario: Confirming a non-leading candidate succeeds

- **WHEN** the creator calls `confirmFormation` with a `candidateSlotId` that belongs to the activity but is not among the candidates with the highest vote count
- **THEN** the system SHALL confirm the activity using that candidate slot

#### Scenario: Confirming a candidate slot from another activity is rejected

- **WHEN** the creator calls `confirmFormation` with a `candidateSlotId` that does not belong to this activity
- **THEN** the system SHALL reject the request with a 400 response


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
### Requirement: Reaching the participant target never auto-confirms an activity

When a joining participant causes an activity's participant count to reach `participant_target`, the system SHALL NOT automatically transition the activity to `confirmed` for any schedule variant. The system SHALL instead transition the activity to `voting` and notify the creator that the target has been reached, leaving the final confirmation to an explicit `confirmFormation` call. This applies uniformly to fixed-time activities (no voting), `range`-mode activities, `find_date` activities, and `find_date_time` activities.

#### Scenario: Fixed-time activity reaching target transitions to voting

- **WHEN** a participant joins a fixed-time (no voting) activity and the new participant count reaches `participant_target`
- **THEN** the activity status SHALL transition to `voting`
- **AND** the system SHALL notify the creator that the target has been reached

#### Scenario: Range-mode activity reaching target transitions to voting

- **WHEN** a participant joins a `range`-mode activity and the new participant count reaches `participant_target`
- **THEN** the activity status SHALL transition to `voting`
- **AND** the system SHALL notify the creator that the target has been reached

#### Scenario: Unanimous find_date vote reaching target does not auto-confirm

- **WHEN** a participant joins a `find_date` activity, the new participant count reaches `participant_target`, and all joined participants voted for the same candidate slot
- **THEN** the activity status SHALL transition to `voting`
- **AND** the system SHALL notify the creator that the target has been reached, using the same notification used for a non-unanimous outcome

#### Scenario: Creator confirms formation explicitly after target reached

- **WHEN** the creator calls `confirmFormation` after being notified that the participant target was reached
- **THEN** the system SHALL confirm the activity following the existing per-scenario confirmation rules

<!-- @trace
source: deadline-model-redesign
code:
  - src/controllers/activityController.js
tests:
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/scenarioBRange.test.js
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
### Requirement: Fixed-time activities expose participant headcount and avatars to the creator

For a fixed-time activity (schedule variant `fixed`, no voting), the activity detail API response SHALL include `current_count` and a `participants` array (each with `id`, `display_name`, `avatar_url`) reflecting everyone who has joined, on the same basis as voting-based activities.

#### Scenario: Creator views a fixed-time activity with joined participants

- **WHEN** the creator requests activity detail for a `fixed`-variant activity that two participants have joined
- **THEN** the response SHALL include `current_count: 2`
- **AND** the response SHALL include a `participants` array with both participants' `id`, `display_name`, and `avatar_url`

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
### Requirement: Decision candidates are restricted to the activity creator

For a voting-based activity (schedule variant `find_date` or `find_date_time`) or a `range`-mode activity in status `recruiting` or `voting`, the `decision_candidates` field returned by the activity detail API SHALL be `null` when the requesting user is not the activity's creator. The full ranked candidate list SHALL continue to be returned, unchanged, when the requesting user is the creator.

#### Scenario: Non-creator receives null decision_candidates

- **WHEN** a joined non-creator participant requests activity detail for a `find_date_time` activity in `voting` status
- **THEN** the response's `decision_candidates` SHALL be `null`

#### Scenario: Creator still receives the full ranked list

- **WHEN** the activity's creator requests activity detail for the same activity in `voting` status
- **THEN** the response's `decision_candidates` SHALL include the full ranked list, unchanged from existing behavior

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

---
### Requirement: confirmFormation rejects a candidate whose start time has already passed

For every scheduling scenario, `confirmFormation` SHALL reject the request when the candidate slot or computed time range the creator is attempting to confirm has a start time that is at or before the current server time. The system SHALL NOT create a confirmed slot or transition the activity status when this check fails.

#### Scenario: Confirming an expired find_date candidate slot is rejected

- **WHEN** the creator calls `confirmFormation` with a `candidateSlotId` whose `slot_start` is at or before the current server time
- **THEN** the system SHALL respond with a 400 status and an error message indicating the slot has already passed
- **AND** the system SHALL NOT update `confirmed_slot_id` or the activity status

#### Scenario: Confirming an expired find_date_time computed window is rejected

- **WHEN** the creator calls `confirmFormation` for a `find_date_time` activity with a `slotStart`/`slotEnd` pair whose `slotStart` is at or before the current server time
- **THEN** the system SHALL respond with a 400 status and an error message indicating the slot has already passed
- **AND** the system SHALL NOT create a new `ActivityCandidateSlot` or update the activity status

#### Scenario: Confirming an expired range-mode window is rejected

- **WHEN** the creator calls `confirmFormation` for a `range`-mode activity with a `slotStart`/`slotEnd` pair whose `slotStart` is at or before the current server time
- **THEN** the system SHALL respond with a 400 status and an error message indicating the slot has already passed
- **AND** the system SHALL NOT create a new `ActivityCandidateSlot` or update the activity status

#### Scenario: Confirming a fixed-time activity whose slot has already passed is rejected

- **WHEN** the creator calls `confirmFormation` for a fixed-time (no voting) activity whose single candidate slot's `slot_start` is at or before the current server time
- **THEN** the system SHALL respond with a 400 status and an error message indicating the slot has already passed

#### Scenario: Confirming a still-future candidate succeeds

- **WHEN** the creator calls `confirmFormation` with a candidate whose start time is strictly after the current server time
- **THEN** the system SHALL proceed with confirmation following the existing per-scenario rules

<!-- @trace
source: deadline-model-redesign
code:
  - src/controllers/activityController.js
tests:
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/scenarioBRange.test.js
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
### Requirement: Fixed-time activities may confirm formation while in voting status

For a fixed-time activity (schedule variant `fixed`, no voting), `confirmFormation` SHALL accept the request while the activity status is `recruiting` or `voting`. The system SHALL reject the request for any other status.

#### Scenario: Confirming a fixed-time activity that has transitioned to voting

- **WHEN** a fixed-time activity has transitioned to `voting` (for example, after its registration deadline passed) and the creator calls `confirmFormation` before the decision deadline
- **THEN** the system SHALL confirm the activity using its single candidate slot

#### Scenario: Confirming a fixed-time activity in an invalid status is rejected

- **WHEN** the creator calls `confirmFormation` for a fixed-time activity whose status is `confirmed` or `cancelled`
- **THEN** the system SHALL respond with a 400 status and SHALL NOT change the activity

<!-- @trace
source: deadline-model-redesign
code:
  - src/controllers/activityController.js
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
### Requirement: Decision-buffer period expiring without confirmation cancels the activity across all scheduling scenarios

For every scheduling scenario, when an activity in `voting` status reaches its `deadline_at` without the creator calling `confirmFormation`, the system SHALL automatically transition the activity to `cancelled` and SHALL notify the creator and all joined participants.

#### Scenario: Fixed-time activity in voting status past its deadline is auto-cancelled

- **WHEN** a lazy status check runs for a fixed-time activity in `voting` status where `deadline_at < now` and `confirmed_slot_id` is still unset
- **THEN** the system SHALL transition the activity to `cancelled`
- **AND** the system SHALL notify the creator and all joined participants

#### Scenario: Range-mode activity in voting status past its deadline is auto-cancelled

- **WHEN** a lazy status check runs for a `range`-mode activity in `voting` status where `deadline_at < now` and `confirmed_slot_id` is still unset
- **THEN** the system SHALL transition the activity to `cancelled`
- **AND** the system SHALL notify the creator and all joined participants

#### Scenario: find_date or find_date_time activity in voting status past its deadline is auto-cancelled

- **WHEN** a lazy status check runs for a `find_date` or `find_date_time` activity in `voting` status where `deadline_at < now` and `confirmed_slot_id` is still unset
- **THEN** the system SHALL transition the activity to `cancelled`
- **AND** the system SHALL notify the creator and all joined participants

#### Scenario: Confirming before the deadline prevents auto-cancellation

- **WHEN** the creator calls `confirmFormation` successfully before `deadline_at` is reached
- **THEN** a subsequent lazy status check SHALL NOT transition the activity to `cancelled`, because `confirmed_slot_id` is already set

<!-- @trace
source: deadline-model-redesign
code:
  - src/controllers/activityController.js
tests:
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/scenarioBRange.test.js
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