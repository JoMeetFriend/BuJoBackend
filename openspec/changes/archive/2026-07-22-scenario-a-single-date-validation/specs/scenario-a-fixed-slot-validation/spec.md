## ADDED Requirements

### Requirement: Scenario A activity creation rejects a mismatched end date

`POST /activities` SHALL reject requests for scenario A (fixed date, fixed time — the request path where `startDate` is present and the request does not match scenario B, C, or D) when the request body includes an `endDate` value that differs from `startDate`. The response SHALL use a 400 status code, and the system SHALL NOT create any `Activity`, `ActivitySchedule`, or `ActivityCandidateSlot` record for a rejected request.

#### Scenario: Mismatched end date is rejected

- **WHEN** a creator submits `POST /activities` for scenario A with `startDate` set to one date and `endDate` set to a different date
- **THEN** the system SHALL respond with a 400 status and an error message indicating the end date must match the start date
- **AND** the system SHALL NOT create any `Activity`, `ActivitySchedule`, or `ActivityCandidateSlot` record

#### Scenario: Missing end date is treated as valid

- **WHEN** a creator submits `POST /activities` for scenario A with `startDate` set and no `endDate` field present
- **THEN** the system SHALL treat the request as valid for this requirement and proceed using `startDate` as the effective end date, unchanged from existing behavior

#### Scenario: Matching end date is treated as valid

- **WHEN** a creator submits `POST /activities` for scenario A with `startDate` and `endDate` set to the same date
- **THEN** the system SHALL treat the request as valid for this requirement and proceed with activity creation

##### Example: end date validation outcomes

| startDate | endDate | Outcome |
| --- | --- | --- |
| 2026-07-28 | 2026-07-28 | Accepted |
| 2026-07-28 | (absent) | Accepted, treated as 2026-07-28 |
| 2026-07-28 | 2026-07-31 | Rejected with 400 |
