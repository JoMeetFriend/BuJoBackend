# scenario-c-date-picker-api Specification

## Purpose

TBD - created by archiving change 'scenario-c-date-picker-api'. Update Purpose after archive.

## Requirements

### Requirement: Activity detail exposes schedule variant

The activity detail API SHALL expose a `schedule_variant` field that identifies the scheduling scenario.

#### Scenario: Fixed activity

- **WHEN** an activity does not require voting
- **THEN** the activity detail response SHALL include `schedule_variant: 'fixed'`

#### Scenario: Find-time activity

- **WHEN** an activity uses `availability_mode: 'range'`
- **THEN** the activity detail response SHALL include `schedule_variant: 'find_time'`

#### Scenario: Find-date activity

- **WHEN** an activity uses slot voting with candidate slots across multiple dates and a uniform time shape
- **THEN** the activity detail response SHALL include `schedule_variant: 'find_date'`

#### Scenario: Find-date-time activity

- **WHEN** an activity uses slot voting and does not match the find-date rule
- **THEN** the activity detail response SHALL include `schedule_variant: 'find_date_time'`

<!-- @trace
source: scenario-c-date-picker-api
updated: 2026-07-10
code:
  - .agents/skills/spectra-sync-specs/SKILL.md
  - src/controllers/activityController.js
tests:
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/scenarioBRange.test.js
-->

---
### Requirement: Scenario C slot resubmission during recruiting

The join API SHALL allow a joined participant to replace selected candidate slots for a scenario C activity while the activity status is `recruiting`.

#### Scenario: Joined participant replaces selected dates

- **WHEN** a joined participant submits new `candidateSlotIds` for a scenario C activity whose status is `recruiting`
- **THEN** the system SHALL delete that participant's previous `ActivityAvailability` rows for the activity
- **AND** the system SHALL persist the new `ActivityAvailability` rows
- **AND** the system SHALL NOT create a duplicate participant row

#### Scenario: Joined participant tries to replace after recruiting

- **WHEN** a joined participant submits new `candidateSlotIds` for a scenario C activity whose status is `voting` or `confirmed`
- **THEN** the system SHALL reject the request
- **AND** the stored `ActivityAvailability` rows SHALL remain unchanged

<!-- @trace
source: scenario-c-date-picker-api
updated: 2026-07-10
code:
  - .agents/skills/spectra-sync-specs/SKILL.md
  - src/controllers/activityController.js
tests:
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/scenarioBRange.test.js
-->
