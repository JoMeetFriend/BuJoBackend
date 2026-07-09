## ADDED Requirements

### Requirement: Activity deadline must be in the future at creation time

The system SHALL reject `POST /activities` when the submitted `deadline` resolves to a timestamp that is not strictly after the current server time, regardless of which of the four scheduling scenarios (fixed, vote-time, vote-date, vote-date-and-time) the request represents.

#### Scenario: Deadline already in the past is rejected

- **WHEN** a creator submits `POST /activities` with a `deadline` value earlier than the current server time
- **THEN** the system SHALL respond with a 400 status and an error message indicating the deadline must be adjusted, and SHALL NOT create any `Activity`, `ActivitySchedule`, or related records

#### Scenario: Deadline equal to now is rejected

- **WHEN** a creator submits `POST /activities` with a `deadline` value equal to the current server time
- **THEN** the system SHALL respond with a 400 status and SHALL NOT create any records

#### Scenario: Valid future deadline is accepted

- **WHEN** a creator submits `POST /activities` with a `deadline` value strictly after the current server time
- **THEN** the system SHALL proceed with activity creation as it does today

#### Scenario: Validation applies to every scheduling scenario

- **WHEN** the request body matches any of the four scheduling scenarios (fixed date/time, fixed date with voted time, voted date with fixed time, voted date with voted time)
- **THEN** the deadline-in-the-future check SHALL be applied before any scenario-specific validation or record creation occurs
