## ADDED Requirements

### Requirement: Scenario D candidate dates accept only one time slot

For an activity being created with schedule variant `find_date_time`, the system SHALL reject the request with a 400 response if the submitted `dateSlots` array contains more than one entry for the same `date`.

#### Scenario: Duplicate date in dateSlots is rejected

- **WHEN** an activity is created with schedule variant `find_date_time` and `dateSlots` contains two or more entries sharing the same `date` value
- **THEN** the system SHALL reject the request with a 400 response
- **AND** the system SHALL NOT create the activity or any candidate slots

#### Scenario: One slot per date is accepted

- **WHEN** an activity is created with schedule variant `find_date_time` and every entry in `dateSlots` has a distinct `date` value
- **THEN** the system SHALL create one candidate slot per date as before

### Requirement: Scenario D computes sub-range overlap ranking per candidate slot

For a `find_date_time` activity, the system SHALL compute a per-candidate-slot overlap ranking from participants' submitted sub-ranges (`range_start`/`range_end`), using the same 60-minute segment coverage-counting approach as the scenario B range-mode ranking (`computeRangeRanking`), scoped to each candidate slot's own `slot_start`~`slot_end` window. A participant who voted for a candidate slot without submitting a sub-range SHALL be treated as covering the slot's entire window for this computation.

#### Scenario: Overlap ranking scoped to a single candidate slot's window

- **WHEN** the system computes the overlap ranking for a candidate slot with `slot_start` 09:00 and `slot_end` 12:00
- **THEN** the segments used for the ranking SHALL fall entirely within 09:00~12:00
- **AND** sub-ranges submitted for other candidate slots SHALL NOT affect this ranking

##### Example: three participants with different sub-ranges

- **GIVEN** a candidate slot 09:00~12:00 with three participants who voted for it: A submitted 09:00~10:00, B submitted 09:30~11:00, C voted without a sub-range
- **WHEN** the system computes the overlap ranking for this slot, using fixed 60-minute segments starting at 09:00
- **THEN** the segment 09:00~10:00 SHALL show count 3 (A, B, and C all cover it)
- **AND** the segment 10:00~11:00 SHALL show count 2 (B and C cover it, A does not)
- **AND** the segment 11:00~12:00 SHALL show count 1 (only C covers it)

#### Scenario: Participant without a sub-range counts as available for the whole slot

- **WHEN** a participant voted for a candidate slot and submitted no matching `candidateSlotRanges` entry for it
- **THEN** every segment within that candidate slot's window SHALL count this participant as available

### Requirement: Scenario D formation confirmation creates a slot from the computed overlap window

When confirming formation for a `find_date_time` activity, the creator SHALL select a segment from the overlap ranking of a candidate slot (computed per the previous requirement) rather than the candidate slot's original full bounds. The system SHALL create a new `ActivityCandidateSlot` at confirmation time using the selected segment's start and end, following the same on-demand slot creation pattern used by scenario B's range mode.

#### Scenario: Confirming a computed overlap segment creates the final slot

- **WHEN** the creator confirms formation for a `find_date_time` activity by submitting a candidate slot's overlap segment from `perfect_overlap` or `partial_overlap`
- **THEN** the system SHALL create a new candidate slot with `slot_start`/`slot_end` matching the selected segment
- **AND** the system SHALL set this new slot as `confirmed_slot_id`

#### Scenario: Confirming a segment not in the computed ranking is rejected

- **WHEN** the creator submits a start/end time that does not match any segment in the computed overlap ranking for the chosen candidate slot
- **THEN** the system SHALL reject the request with a 400 response
