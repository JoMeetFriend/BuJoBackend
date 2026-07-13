## MODIFIED Requirements

### Requirement: Scenario D computes sub-range overlap ranking per candidate slot

For a `find_date_time` activity, the system SHALL compute a per-candidate-slot overlap ranking from participants' submitted sub-ranges (`range_start`/`range_end`), using the same 60-minute segment coverage-counting and adjacent-equal-count merging approach as the scenario B range-mode ranking, scoped to each candidate slot's own `slot_start`~`slot_end` window. A participant who voted for a candidate slot without submitting a sub-range SHALL be treated as covering the slot's entire window for this computation. The creator SHALL NOT be counted in this ranking.

#### Scenario: Overlap ranking scoped to a single candidate slot's window

- **WHEN** the system computes the overlap ranking for a candidate slot with `slot_start` 09:00 and `slot_end` 12:00
- **THEN** the segments used for the ranking SHALL fall entirely within 09:00~12:00
- **AND** sub-ranges submitted for other candidate slots SHALL NOT affect this ranking

##### Example: three participants with different sub-ranges

- **GIVEN** a candidate slot 09:00~12:00 with three real participants who voted for it: A submitted 09:00~10:00, B submitted 09:30~11:00, C voted without a sub-range
- **WHEN** the system computes the overlap ranking for this slot, using fixed 60-minute segments starting at 09:00
- **THEN** the merged entry for 09:00~10:00 SHALL show count 3 (A, B, and C all cover it) and `is_unanimous: true`
- **AND** the entry for 10:00~11:00 SHALL show count 2 (B and C cover it, A does not) and `is_unanimous: false`
- **AND** the entry for 11:00~12:00 SHALL show count 1 (only C covers it) and `is_unanimous: false`
- **AND** each entry SHALL include a `supporters` array listing the covering participants' `user_id`, `display_name`, and `avatar_url`

#### Scenario: Participant without a sub-range counts as available for the whole slot

- **WHEN** a participant voted for a candidate slot and submitted no matching `candidateSlotRanges` entry for it
- **THEN** every segment within that candidate slot's window SHALL count this participant as available

#### Scenario: Adjacent equal-count segments within a slot are merged

- **WHEN** two or more time-adjacent 60-minute segments within the same candidate slot have exactly the same count AND the exact same set of covering participants
- **THEN** the system SHALL combine them into a single entry spanning from the earliest segment's `slot_start` to the latest segment's `slot_end`, the same merging behavior used for scenario B (including not merging same-count segments whose supporters differ)

### Requirement: Scenario D formation confirmation creates a slot from the computed overlap window

When confirming formation for a `find_date_time` activity, the creator SHALL select a segment from the merged overlap ranking of a candidate slot (computed per the previous requirement) rather than the candidate slot's original full bounds. The system SHALL create a new `ActivityCandidateSlot` at confirmation time using the selected segment's start and end, following the same on-demand slot creation pattern used by scenario B's range mode.

#### Scenario: Confirming a computed overlap segment creates the final slot

- **WHEN** the creator confirms formation for a `find_date_time` activity by submitting a candidate slot's overlap segment start/end matching one of the entries in that candidate slot's merged ranking
- **THEN** the system SHALL create a new candidate slot with `slot_start`/`slot_end` matching the selected segment
- **AND** the system SHALL set this new slot as `confirmed_slot_id`

#### Scenario: Confirming a segment not in the computed ranking is rejected

- **WHEN** the creator submits a start/end time that does not match any entry in the computed overlap ranking for the chosen candidate slot
- **THEN** the system SHALL reject the request with a 400 response

## ADDED Requirements

### Requirement: Decision candidates response groups merged segments under their candidate slot

For a `find_date_time` activity, the `getActivity` response's `decision_candidates` SHALL be an array of one entry per candidate slot, each including that slot's own `id`, `slot_start`, `slot_end`, `count` (total participants who voted for this candidate slot), and a `segments` array containing the merged overlap ranking entries for that slot (replacing the previous `perfect_overlap`/`partial_overlap` pair).

#### Scenario: Each candidate slot shows its own merged segment list

- **WHEN** the creator views a `find_date_time` activity in `voting` status with two candidate slots, each having its own submitted sub-ranges
- **THEN** the response SHALL include two `decision_candidates` entries, one per candidate slot
- **AND** each entry's `segments` array SHALL contain only the merged overlap segments computed from that candidate slot's own sub-ranges
