## ADDED Requirements

### Requirement: Decision candidates are restricted to the activity creator

For a voting-based activity (schedule variant `find_date` or `find_date_time`) or a `range`-mode activity in status `recruiting` or `voting`, the `decision_candidates` field returned by the activity detail API SHALL be `null` when the requesting user is not the activity's creator. The full ranked candidate list SHALL continue to be returned, unchanged, when the requesting user is the creator.

#### Scenario: Non-creator receives null decision_candidates

- **WHEN** a joined non-creator participant requests activity detail for a `find_date_time` activity in `voting` status
- **THEN** the response's `decision_candidates` SHALL be `null`

#### Scenario: Creator still receives the full ranked list

- **WHEN** the activity's creator requests activity detail for the same activity in `voting` status
- **THEN** the response's `decision_candidates` SHALL include the full ranked list, unchanged from existing behavior
