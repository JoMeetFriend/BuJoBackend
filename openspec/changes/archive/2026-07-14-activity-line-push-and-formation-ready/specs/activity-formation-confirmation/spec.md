## MODIFIED Requirements

### Requirement: Reaching the participant target never auto-confirms an activity

When a joining participant causes an activity's participant count to reach `participant_target`, the system SHALL NOT automatically transition the activity to `confirmed` for any schedule variant. The system SHALL instead transition the activity to `voting` and notify the creator with a `formation_ready` notification (message "「{activityTitle}」人數已滿，請確認成團"), leaving the final confirmation to an explicit `confirmFormation` call. The `time_to_pick` notification type SHALL remain reserved for the registration-deadline transition into the decision buffer and SHALL NOT be used for the target-reached event. This applies uniformly to fixed-time activities (no voting), `range`-mode activities, `find_date` activities, and `find_date_time` activities.

#### Scenario: Fixed-time activity reaching target transitions to voting

- **WHEN** a participant joins a fixed-time (no voting) activity and the new participant count reaches `participant_target`
- **THEN** the activity status SHALL transition to `voting`
- **AND** the system SHALL create a `formation_ready` notification for the creator

#### Scenario: Range-mode activity reaching target transitions to voting

- **WHEN** a participant joins a `range`-mode activity and the new participant count reaches `participant_target`
- **THEN** the activity status SHALL transition to `voting`
- **AND** the system SHALL create a `formation_ready` notification for the creator

#### Scenario: Unanimous find_date vote reaching target does not auto-confirm

- **WHEN** a participant joins a `find_date` activity, the new participant count reaches `participant_target`, and all joined participants voted for the same candidate slot
- **THEN** the activity status SHALL transition to `voting`
- **AND** the system SHALL create a `formation_ready` notification for the creator, identical to the notification used for a non-unanimous outcome

#### Scenario: Registration deadline transition still uses time_to_pick

- **WHEN** a lazy status check transitions an activity from `recruiting` to `voting` because the registration deadline passed with the target met or unset
- **THEN** the system SHALL create a `time_to_pick` notification for the creator, not a `formation_ready` notification

#### Scenario: Creator confirms formation explicitly after target reached

- **WHEN** the creator calls `confirmFormation` after being notified that the participant target was reached
- **THEN** the system SHALL confirm the activity following the existing per-scenario confirmation rules
