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

---
### Requirement: candidate_slots expose same-day co-participants to non-creator viewers

For a `find_date` activity, when the requesting user is not the creator, each entry in the `candidate_slots` field of the activity detail response where `is_selected` is `true` SHALL include a `co_participants` array listing every other real participant (excluding the creator and excluding the requesting user) who also voted for this candidate slot. Entries where `is_selected` is `false` SHALL have an empty `co_participants` array.

#### Scenario: Co-participant who picked the same date appears

- **WHEN** the requesting user voted for candidate slot X, and another real participant also voted for candidate slot X
- **THEN** the `candidate_slots` entry for X SHALL include the other participant in `co_participants`

#### Scenario: Participant who picked a different date does not appear

- **WHEN** the requesting user voted for candidate slot X, and another real participant voted only for candidate slot Y
- **THEN** the `candidate_slots` entry for X SHALL NOT include that participant in `co_participants`

#### Scenario: Unselected candidate slots do not leak other participants' choices

- **WHEN** the requesting user did not vote for candidate slot Y, regardless of who else voted for it
- **THEN** the `candidate_slots` entry for Y SHALL have `co_participants: []`

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