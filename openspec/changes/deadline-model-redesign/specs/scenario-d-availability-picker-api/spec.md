## MODIFIED Requirements

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
