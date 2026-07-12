## ADDED Requirements

### Requirement: Range-mode cancellation removes stored availability ranges

The system SHALL remove a participant's stored availability ranges when that participant cancels joining a range-mode activity.

#### Scenario: Participant cancels a range-mode activity

- **WHEN** a joined participant cancels joining a range-mode activity whose status is `recruiting`
- **THEN** the system SHALL mark the participant as left
- **AND** the system SHALL delete that participant's `ActivityAvailabilityRange` records for the activity

#### Scenario: Cancelled participant is excluded from range ranking

- **WHEN** range-mode decision candidates are computed after a participant has cancelled joining
- **THEN** the cancelled participant's old availability ranges SHALL NOT contribute to `perfect_overlap` or `partial_overlap`
