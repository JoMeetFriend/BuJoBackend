## REMOVED Requirements

### Requirement: Creator is treated as always available

**Reason**: This behavior was already removed from the implementation by a prior change (the ghost-vote fix that excludes the creator from overlap ranking), but the spec was never synced at that change's archive time and kept describing the old, no-longer-true behavior. This change corrects the spec debt in the same pass as the merge/format changes below.

**Migration**: See the MODIFIED "Overlap ranking computation" requirement below, which now states that only real participants (excluding the creator) are counted.

## MODIFIED Requirements

### Requirement: Overlap ranking computation

The system SHALL compute a ranked list of candidate time slots for a `range`-mode activity by slicing the effective time window into 60-minute segments, counting for each segment how many real participants (excluding the creator) have a submitted range covering it, then merging adjacent segments that share the same count into a single entry.

#### Scenario: Ranking is a single array sorted by support

- **WHEN** the creator requests the ranked candidates for a `voting` or `recruiting` activity in `range` mode
- **THEN** the system SHALL return `decision_candidates` as a single array sorted by `count` in descending order, replacing the previous `{ perfect_overlap, partial_overlap }` structure
- **AND** each entry SHALL include a `temp-`-prefixed identifier derived from its start time (not a real `ActivityCandidateSlot.id`), `slot_start`, `slot_end`, `count`, `is_unanimous` (whether `count` equals the number of real participants who submitted a range), and `supporters` (an array of `{user_id, display_name, avatar_url}` for every participant covering this segment)

#### Scenario: Adjacent segments with equal count and identical supporters are merged

- **WHEN** two or more time-adjacent 60-minute segments have exactly the same count AND the exact same set of covering participants
- **THEN** the system SHALL combine them into a single entry spanning from the earliest segment's `slot_start` to the latest segment's `slot_end`

#### Scenario: A count change breaks the merge

- **WHEN** a segment's count differs from the immediately preceding segment's count
- **THEN** the system SHALL start a new entry at that segment, even if the preceding segments were merged together

#### Scenario: Equal count but different supporters does not merge

- **WHEN** two time-adjacent 60-minute segments have the same count but the participants covering them are not the same set of people (a hand-off, e.g. one participant's range ends exactly where a different participant's range begins)
- **THEN** the system SHALL keep them as separate entries, even though their `count` values are equal

##### Example: adjacent same-count segments from different people are not merged

| Participant | Range |
| --- | --- |
| Alice | 09:00–10:00 |
| Bob | 10:00–11:00 |

- **GIVEN** the two ranges above and a 60-minute segment size
- **WHEN** the ranking is computed
- **THEN** the entry for 09:00–10:00 SHALL have count 1 with `supporters` containing only Alice
- **AND** the entry for 10:00–11:00 SHALL have count 1 with `supporters` containing only Bob
- **AND** these two entries SHALL remain separate, not merged into a single 09:00–11:00 entry

##### Example: overlapping ranges producing count changes across the window

| Participant | Range |
| --- | --- |
| Alice | 18:00–19:00 |
| Bob | 18:00–21:00 |

- **GIVEN** the two ranges above, a 60-minute segment size, and 2 real participants total
- **WHEN** the ranking is computed
- **THEN** the entry for 18:00–19:00 SHALL have count 2 (Alice, Bob) and `is_unanimous: true`
- **AND** the entry for 19:00–21:00 SHALL have count 1 (Bob only), `is_unanimous: false`, merged into one entry since both its underlying 19:00–20:00 and 20:00–21:00 segments share count 1
- **AND** these two entries SHALL NOT be merged with each other since their counts differ (2 vs 1)

#### Scenario: Tied segments are ordered by time

- **WHEN** two or more entries have the same count after merging
- **THEN** the system SHALL order them with the earlier entry first

##### Example: two same-count entries from different participant subsets

| Participant | Range |
| --- | --- |
| Alice | 09:00–10:00 |
| Bob | 09:00–10:00 |
| Carol | 14:00–15:00 |
| Dave | 14:00–15:00 |

- **GIVEN** the four ranges above and a 60-minute segment size
- **WHEN** the ranking is computed
- **THEN** both 09:00–10:00 and 14:00–15:00 SHALL have count 2
- **AND** the entry for 09:00–10:00 SHALL appear before the entry for 14:00–15:00 in `decision_candidates`

#### Scenario: No participant has submitted availability

- **WHEN** the ranked candidates are requested and zero `ActivityAvailabilityRange` records exist for the activity
- **THEN** the system SHALL return `decision_candidates` as an empty array

#### Scenario: Submitted availability has zero overlap

- **WHEN** at least one participant submitted availability but no segment has more than 1 participant available
- **THEN** `decision_candidates` SHALL still include those single-participant segments; the system SHALL NOT filter out non-unanimous entries

### Requirement: Range-mode cancellation removes stored availability ranges

The system SHALL remove a participant's stored availability ranges when that participant cancels joining a range-mode activity.

#### Scenario: Participant cancels a range-mode activity

- **WHEN** a joined participant cancels joining a range-mode activity whose status is `recruiting`
- **THEN** the system SHALL mark the participant as left
- **AND** the system SHALL delete that participant's `ActivityAvailabilityRange` records for the activity

#### Scenario: Cancelled participant is excluded from range ranking

- **WHEN** range-mode decision candidates are computed after a participant has cancelled joining
- **THEN** the cancelled participant's old availability ranges SHALL NOT contribute to any `decision_candidates` entry
