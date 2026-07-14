## MODIFIED Requirements

### Requirement: Activity deadline must be in the future at creation time

The system SHALL reject `POST /activities` when the server-computed `deadline_at` ceiling (see "Server-computed deadline_at ceiling per scheduling scenario") resolves to a timestamp that is not strictly after the current server time, regardless of which of the four scheduling scenarios (fixed, vote-time, vote-date, vote-date-and-time) the request represents.

#### Scenario: Server-computed deadline_at already in the past is rejected

- **WHEN** a creator submits `POST /activities` and the server-computed `deadline_at` ceiling for the request's scenario resolves to a timestamp earlier than the current server time
- **THEN** the system SHALL respond with a 400 status and an error message indicating the activity time must be adjusted, and SHALL NOT create any `Activity`, `ActivitySchedule`, or related records

#### Scenario: Server-computed deadline_at equal to now is rejected

- **WHEN** a creator submits `POST /activities` and the server-computed `deadline_at` ceiling resolves to a timestamp equal to the current server time
- **THEN** the system SHALL respond with a 400 status and SHALL NOT create any records

#### Scenario: Valid future deadline_at is accepted

- **WHEN** a creator submits `POST /activities` and the server-computed `deadline_at` ceiling resolves to a timestamp strictly after the current server time, and the submitted `deadline` field satisfies the vote_deadline_at-before-deadline_at requirement
- **THEN** the system SHALL proceed with activity creation

#### Scenario: Validation applies to every scheduling scenario

- **WHEN** the request body matches any of the four scheduling scenarios (fixed date/time, fixed date with voted time, voted date with fixed time, voted date with voted time)
- **THEN** the deadline_at-in-the-future check SHALL be applied before any scenario-specific validation or record creation occurs

<!-- @trace
source: deadline-model-redesign
code:
  - src/controllers/activityController.js
tests:
  - src/__tests__/activityStateMachine.test.js
-->

## ADDED Requirements

### Requirement: Server-computed deadline_at ceiling per scheduling scenario

The system SHALL compute `deadline_at` on the server for every scheduling scenario and SHALL NOT accept a client-supplied value for `deadline_at`. The `deadline_at` value SHALL never be later than the time the activity itself would actually occur.

#### Scenario: Fixed-time scenario (no voting) deadline_at equals the activity start time

- **WHEN** a creator submits `POST /activities` for a fixed date and time (no voting)
- **THEN** the system SHALL set `deadline_at` to the activity's own `slot_start` time

#### Scenario: Range-mode scenario deadline_at equals the time window start

- **WHEN** a creator submits `POST /activities` with a fixed date and a voted time window (`singleDate` with `timeWindowStart`/`timeWindowEnd`)
- **THEN** the system SHALL set `deadline_at` to `time_window_start` when provided, or to the fixed date at midnight when no time window is provided

#### Scenario: find_date scenario deadline_at equals the latest candidate date

- **WHEN** a creator submits `POST /activities` with multiple candidate dates and a uniform time (`candidateDates`)
- **THEN** the system SHALL set `deadline_at` to the `slot_start` of the candidate slot with the latest date among all candidate slots created for the activity

#### Scenario: find_date_time scenario deadline_at equals the latest candidate slot's own start time

- **WHEN** a creator submits `POST /activities` with per-date candidate time slots (`dateSlots`)
- **THEN** the system SHALL set `deadline_at` to the `slot_start` of the candidate slot with the latest start time among all candidate slots created for the activity

##### Example: deadline_at formula by scenario

| Scenario | Input | deadline_at |
| --- | --- | --- |
| Fixed (A) | `startDate=2026-08-01`, `startTime=14:00` | `2026-08-01 14:00` |
| Range (B) | `singleDate=2026-08-01`, `timeWindowStart=09:00` | `2026-08-01 09:00` |
| find_date (C) | candidate dates `2026-08-01`, `2026-08-03`; uniform `startTime=10:00` | `2026-08-03 10:00` |
| find_date_time (D) | slots `2026-08-01 09:00`, `2026-08-03 15:00` | `2026-08-03 15:00` |

<!-- @trace
source: deadline-model-redesign
code:
  - src/controllers/activityController.js
tests:
  - src/__tests__/activityStateMachine.test.js
-->

---

### Requirement: Submitted deadline becomes vote_deadline_at and must precede deadline_at

The system SHALL treat the `deadline` field submitted in `POST /activities` as the activity's `vote_deadline_at` (registration cutoff), not as `deadline_at`. The system SHALL reject the request when the submitted `deadline` does not resolve to a timestamp strictly earlier than the server-computed `deadline_at` ceiling.

#### Scenario: vote_deadline_at not earlier than deadline_at is rejected

- **WHEN** a creator submits `POST /activities` with a `deadline` value that is equal to or later than the server-computed `deadline_at` ceiling for the request's scenario
- **THEN** the system SHALL respond with a 400 status and an error message indicating the registration deadline must be earlier than the activity's decision deadline, and SHALL NOT create any records

#### Scenario: vote_deadline_at earlier than deadline_at is accepted

- **WHEN** a creator submits `POST /activities` with a `deadline` value strictly earlier than the server-computed `deadline_at` ceiling
- **THEN** the system SHALL create the `ActivitySchedule` with `vote_deadline_at` set to the submitted `deadline` value

#### Scenario: Fixed-time scenario (A) receives a vote_deadline_at field

- **WHEN** a creator submits `POST /activities` for a fixed date and time (no voting)
- **THEN** the created `ActivitySchedule` SHALL include a non-null `vote_deadline_at` value, in addition to `deadline_at`

<!-- @trace
source: deadline-model-redesign
code:
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/activityStateMachine.test.js
-->
