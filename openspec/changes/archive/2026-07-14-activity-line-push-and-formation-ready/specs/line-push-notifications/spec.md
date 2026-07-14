## ADDED Requirements

### Requirement: LINE push delivery for activity lifecycle notifications

The system SHALL attempt a LINE text push after the in-app notification for an activity lifecycle event is committed to the database, for the notification types `formation_ready`, `time_to_pick`, `activity_confirmed`, and `activity_cancelled`. The push text SHALL be identical to the in-app notification message for the same type. The system SHALL NOT send a LINE push from a request that lost the optimistic-lock status transition (the request that did not create the in-app notification), and SHALL NOT send a LINE push before the database transaction that creates the in-app notification has committed.

#### Scenario: Participant target reached pushes formation_ready to the creator

- **WHEN** a participant joins an activity and the participant count reaches `participant_target`, and the creator is eligible for LINE push delivery
- **THEN** the system sends one LINE text push to the creator with the message "「{activityTitle}」人數已滿，請確認成團"

#### Scenario: Registration deadline entering the decision buffer pushes time_to_pick to the creator

- **WHEN** a lazy status check transitions an activity from `recruiting` to `voting` because the registration deadline passed, and the creator is eligible for LINE push delivery
- **THEN** the system sends one LINE text push to the creator with the message "「{activityTitle}」候選時段票數不相上下，請選擇最終時段"

#### Scenario: Confirmed formation pushes activity_confirmed to other participants

- **WHEN** the creator successfully calls `confirmFormation` and two joined participants other than the creator are eligible for LINE push delivery
- **THEN** the system sends one LINE text push to each eligible participant with the message "「{activityTitle}」已確認成團"

#### Scenario: Cancelled activity pushes activity_cancelled to participants

- **WHEN** an activity transitions to `cancelled` (creator cancels manually, the registration deadline passes below target, or the decision buffer expires without confirmation), and joined participants are eligible for LINE push delivery
- **THEN** the system sends one LINE text push to each eligible participant with the message "「{activityTitle}」已取消"

#### Scenario: Optimistic-lock loser does not push

- **WHEN** two concurrent requests race the same status transition and one loses the optimistic lock (its `updateMany` matches zero rows)
- **THEN** the losing request SHALL NOT create in-app notifications and SHALL NOT send any LINE push for that transition

#### Scenario: Ineligible recipients only receive the in-app notification

- **WHEN** an activity lifecycle event occurs and a recipient has no LINE identity or has disabled the LINE preference for that notification type
- **THEN** the system creates the in-app notification for that recipient and skips the LINE push without error
