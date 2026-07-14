## ADDED Requirements

### Requirement: candidate_slots expose overlapping co-participants to non-creator viewers

For a `find_date_time` activity, when the requesting user is not the creator, each entry in the `candidate_slots` field of the activity detail response where `is_selected` is `true` SHALL include a `co_participants` array. This array SHALL be derived from that candidate slot's merged overlap ranking (per "Scenario D computes sub-range overlap ranking per candidate slot"): every real participant (excluding the creator and excluding the requesting user) whose covering segment overlaps the requesting user's own sub-range (`my_range`), or the candidate slot's entire window if the requesting user voted without a sub-range. Entries where `is_selected` is `false` SHALL have an empty `co_participants` array.

#### Scenario: Overlapping sub-range co-participant appears

- **WHEN** the requesting user submitted a sub-range of 09:00–10:00 for a candidate slot, and another real participant submitted 09:30–11:00 for the same slot
- **THEN** the `candidate_slots` entry for that slot SHALL include the other participant in `co_participants`

#### Scenario: Non-overlapping sub-range does not appear

- **WHEN** the requesting user submitted a sub-range of 09:00–10:00 for a candidate slot, and another real participant submitted 10:00–11:00 for the same slot (a hand-off with no actual time overlap)
- **THEN** the `candidate_slots` entry for that slot SHALL NOT include the other participant in `co_participants`

#### Scenario: No sub-range treats the whole slot window as the requesting user's own range

- **WHEN** the requesting user voted for a candidate slot without submitting a sub-range
- **THEN** `co_participants` SHALL include every other real participant whose covering segment falls anywhere within that candidate slot's `slot_start`~`slot_end` window

#### Scenario: Unselected candidate slots do not leak other participants' choices

- **WHEN** the requesting user did not vote for a candidate slot
- **THEN** that `candidate_slots` entry SHALL have `co_participants: []`
