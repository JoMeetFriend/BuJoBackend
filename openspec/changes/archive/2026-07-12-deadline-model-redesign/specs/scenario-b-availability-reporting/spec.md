## REMOVED Requirements

### Requirement: Vote deadline auto-cancellation

**Reason**: This requirement was scoped to `range`-mode activities only, and used `vote_deadline_at` as the trigger for auto-cancellation. It is superseded by the "Decision-buffer period expiring without confirmation cancels the activity across all scheduling scenarios" requirement in `activity-formation-confirmation`, which covers all four scheduling scenarios and uses `deadline_at` as the trigger, giving the creator the same decision-buffer window (`vote_deadline_at` to `deadline_at`) that the other three scenarios already have.

**Migration**: No client-facing migration needed. The observable behavior (a `range`-mode activity stuck in `voting` past its deadline auto-cancels) is preserved, but the trigger field changes from `vote_deadline_at` to `deadline_at`, and the same mechanism now applies to fixed-time, `find_date`, and `find_date_time` activities too. See `activity-formation-confirmation`.

#### Scenario: Range-mode auto-cancellation is now covered by the cross-scenario requirement

- **WHEN** a `range`-mode activity in `voting` status passes its `deadline_at` without the creator confirming a slot
- **THEN** the system SHALL transition the activity to `cancelled`, per "Decision-buffer period expiring without confirmation cancels the activity across all scheduling scenarios" in `activity-formation-confirmation`, rather than the removed `vote_deadline_at`-triggered check this requirement previously specified

## MODIFIED Requirements

### Requirement: Zero-submission cancellation without a participant cap

For a `range`-mode activity with no `participant_target` set, the system SHALL automatically transition the activity to `cancelled` when `vote_deadline_at` has passed and no participant other than the creator has submitted any availability.

#### Scenario: Recruiting deadline passes with no submissions and no cap

- **WHEN** a lazy status check runs for a `recruiting`, `range`-mode activity where `participant_target` is null, `vote_deadline_at < now`, and no `ActivityAvailabilityRange` record exists for any participant other than the creator
- **THEN** the system SHALL transition the activity to `cancelled` and SHALL notify the creator

<!-- @trace
source: deadline-model-redesign
code:
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/activityStateMachine.test.js
-->

---

### Requirement: Join rejects activities past their deadline

Regardless of availability mode, the system SHALL reject a join request when the activity's `vote_deadline_at` has already passed, even if the activity's stored status has not yet been transitioned by a lazy check.

#### Scenario: Joining an expired but not-yet-transitioned activity

- **WHEN** a user submits `POST /:id/join` for an activity whose `status` is still `recruiting` but `vote_deadline_at < now`
- **THEN** the system SHALL reject the request with an error indicating the activity has expired, and SHALL NOT create an `ActivityParticipant` record

<!-- @trace
source: deadline-model-redesign
code:
  - src/controllers/activityController.js
  - API_DOCS.md
tests:
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/activityStateMachine.test.js
-->
