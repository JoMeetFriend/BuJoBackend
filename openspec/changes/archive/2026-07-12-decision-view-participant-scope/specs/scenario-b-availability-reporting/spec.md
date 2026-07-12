## ADDED Requirements

### Requirement: my_ranges expose overlapping co-participants to non-creator viewers

For a `range`-mode activity, when the requesting user is not the creator, each entry in the `my_ranges` field of the activity detail response SHALL include a `co_participants` array listing every other real participant (excluding the creator and excluding the requesting user) whose own submitted range overlaps this range's time span.

#### Scenario: Overlapping submitter appears in co_participants

- **WHEN** the requesting user submitted a range of 18:00–20:00, and another real participant submitted a range of 19:00–21:00
- **THEN** the `my_ranges` entry for 18:00–20:00 SHALL include the other participant in `co_participants`

#### Scenario: Non-overlapping submitter does not appear in co_participants

- **WHEN** the requesting user submitted a range of 09:00–10:00, and another real participant submitted a range of 10:00–11:00 (a hand-off with no actual time overlap)
- **THEN** the `my_ranges` entry for 09:00–10:00 SHALL NOT include the other participant in `co_participants`

#### Scenario: The creator's own submission never appears in co_participants

- **WHEN** the activity's creator has a stored `ActivityAvailabilityRange` overlapping the requesting user's range
- **THEN** the creator SHALL NOT appear in `co_participants`

## REMOVED Requirements

### Requirement: Creator is treated as always available

**Reason**: This requirement text describes injecting a virtual full-window availability for the creator into the overlap ranking. That behavior was removed from the implementation during an earlier ghost-vote fix, and directly contradicts the "Overlap ranking computation" requirement in this same spec, which explicitly excludes the creator. The requirement text was never updated to match, leaving stale, self-contradictory spec debt.

**Migration**: See the "Overlap ranking computation" requirement, which accurately describes current behavior (the creator is excluded from all overlap ranking computation).
