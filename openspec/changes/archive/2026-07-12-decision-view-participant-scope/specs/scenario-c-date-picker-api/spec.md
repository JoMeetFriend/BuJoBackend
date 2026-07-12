## ADDED Requirements

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
