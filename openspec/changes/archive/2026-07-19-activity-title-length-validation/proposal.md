## Why

Frontend title limits improve user experience, but the create activity API is still public to older clients, direct API calls, and tests. The backend must enforce the same 15-character product rule so newly created activity records cannot store overlong titles.

## What Changes

- `POST /api/activities` rejects missing, non-string, blank-after-trim, and over-15-character titles before creating any activity-related records.
- Accepted titles are trimmed before persistence.
- The normalized title is used consistently for both `activity.title` and the created chat name.
- Controller tests cover required, invalid, overlong, and boundary-valid title cases.

## Non-Goals

- No migration or modification of existing activity records.
- No change to schedule, deadline, join, confirmation, cancellation, notification, or LINE push behavior.
- No new database constraint is added in this change.

## Capabilities

### New Capabilities

- `activity-title-validation`: Backend create-activity title validation and normalization.

### Modified Capabilities

- None.

## Impact

- `src/controllers/activityController.js`
- `src/__tests__/activityStateMachine.test.js`
- API behavior: invalid titles now return `400` before persistence.
