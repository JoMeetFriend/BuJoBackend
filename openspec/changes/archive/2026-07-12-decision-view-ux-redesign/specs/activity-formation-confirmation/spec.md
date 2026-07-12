## MODIFIED Requirements

### Requirement: Formation decision candidates are not filtered to only the leading option

For a voting-based activity (schedule variant `find_date` or `find_date_time`) in status `recruiting` or `voting`, the `decision_candidates` returned by the activity detail API SHALL include every candidate slot, not only the slot(s) tied for the highest support, sorted by support in descending order.

#### Scenario: Non-leading candidate slots remain visible to the creator

- **WHEN** an activity has candidate slot X with 3 votes and candidate slot Y with 2 votes
- **THEN** `decision_candidates` SHALL include both X and Y
- **AND** X SHALL appear before Y in the list

#### Scenario: find_date activity ranks candidates by vote count and identifies supporters

- **WHEN** the activity's schedule variant is `find_date`
- **THEN** each `decision_candidates` entry SHALL include the candidate slot's `id`, `slot_start`, `slot_end`, `count`, `is_unanimous` (whether `count` equals the number of real participants who submitted a vote, excluding the creator), and `supporters` (an array of `{user_id, display_name, avatar_url}` for every participant who voted for this slot)

## ADDED Requirements

### Requirement: Fixed-time activities expose participant headcount and avatars to the creator

For a fixed-time activity (schedule variant `fixed`, no voting), the activity detail API response SHALL include `current_count` and a `participants` array (each with `id`, `display_name`, `avatar_url`) reflecting everyone who has joined, on the same basis as voting-based activities.

#### Scenario: Creator views a fixed-time activity with joined participants

- **WHEN** the creator requests activity detail for a `fixed`-variant activity that two participants have joined
- **THEN** the response SHALL include `current_count: 2`
- **AND** the response SHALL include a `participants` array with both participants' `id`, `display_name`, and `avatar_url`
