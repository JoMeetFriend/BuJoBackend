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

#### Scenario: find_date activity ranks candidates by vote count

- **WHEN** the activity's schedule variant is `find_date`
- **THEN** each `decision_candidates` entry SHALL include the candidate slot's id, `slot_start`, `slot_end`, `count`, and whether `count` equals the number of joined participants


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

When a joining participant causes an activity's participant count to reach `participant_target`, the system SHALL NOT automatically transition the activity to `confirmed` for any schedule variant. The system SHALL instead notify the creator that the target has been reached, leaving the final confirmation to an explicit `confirmFormation` call. This applies uniformly to fixed-time activities (no voting), `find_date`, and `find_date_time` activities; range-mode (`find_time`) activities already never auto-confirm and are unaffected by this requirement.

#### Scenario: Fixed-time activity reaching target does not auto-confirm

- **WHEN** a participant joins a fixed-time (no voting) activity and the new participant count reaches `participant_target`
- **THEN** the activity status SHALL remain `recruiting`
- **AND** the system SHALL notify the creator that the target has been reached

#### Scenario: Unanimous find_date vote reaching target does not auto-confirm

- **WHEN** a participant joins a `find_date` activity, the new participant count reaches `participant_target`, and all joined participants voted for the same candidate slot
- **THEN** the activity status SHALL transition to `voting`
- **AND** the system SHALL notify the creator that the target has been reached, using the same notification used for a non-unanimous outcome

#### Scenario: Creator confirms formation explicitly after target reached

- **WHEN** the creator calls `confirmFormation` after being notified that the participant target was reached
- **THEN** the system SHALL confirm the activity following the existing per-scenario confirmation rules

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