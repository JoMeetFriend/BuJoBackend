## MODIFIED Requirements

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

## ADDED Requirements

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
