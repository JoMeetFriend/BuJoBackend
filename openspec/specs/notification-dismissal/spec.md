# notification-dismissal Specification

## Purpose

TBD - created by archiving change 'add-notification-soft-dismissal'. Update Purpose after archive.

## Requirements

### Requirement: Persist notification soft dismissal

The system SHALL soft dismiss an owned notification by setting `is_read` to true and `dismissed_at` to the current timestamp in one database update, and SHALL retain the notification row.

#### Scenario: Dismiss an owned visible notification

- **WHEN** an authenticated user sends `PATCH /api/notifications/:id/dismiss` for their notification whose `dismissed_at` is null
- **THEN** the system sets `is_read` to true and `dismissed_at` to a non-null timestamp
- **AND** the system returns status 200 with `{ "message": "已移除通知" }`
- **AND** the notification row remains stored


<!-- @trace
source: add-notification-soft-dismissal
updated: 2026-07-12
code:
  - .playwright-cli/page-2026-07-12T06-20-10-333Z.yml
  - prisma/migrations/20260711003217_add_availability_range_to_candidate_slot_vote/migration.sql
  - prisma/migrations/20260709133702_add_availability_range/migration.sql
  - API_DOCS.md
  - src/controllers/activityController.js
  - src/services/notificationService.js
  - .playwright-cli/page-2026-07-12T06-19-30-604Z.yml
  - .playwright-cli/console-2026-07-12T06-18-01-369Z.log
  - .playwright-cli/page-2026-07-12T06-19-20-768Z.yml
  - src/controllers/notificationController.js
  - prisma/migrations/20260712000000_add_notification_dismissed_at/migration.sql
  - src/routes/notifications.js
  - prisma/schema.prisma
  - prisma/migrations/20260710150918_add_notification_user_read_index/migration.sql
  - .playwright-cli/page-2026-07-12T06-18-01-893Z.yml
tests:
  - src/__tests__/notificationService.test.js
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/computeSlotOverlapRanking.test.js
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/computeRangeRanking.test.js
  - src/__tests__/notificationController.test.js
-->

---
### Requirement: Enforce dismissal ownership and visible-state boundaries

The system MUST restrict dismissal to the authenticated user's notification whose `dismissed_at` is null. It MUST expose nonexistent, foreign-owned, and previously dismissed notifications through the same not-found response.

#### Scenario: Notification does not exist

- **WHEN** an authenticated user dismisses an unknown notification ID
- **THEN** the system returns status 404 with `{ "message": "找不到通知" }`

#### Scenario: Notification belongs to another user

- **WHEN** an authenticated user dismisses a notification owned by another user
- **THEN** the system returns status 404 with `{ "message": "找不到通知" }`
- **AND** the system does not modify the notification

#### Scenario: Notification was already dismissed

- **WHEN** an authenticated user dismisses their notification whose `dismissed_at` is already non-null
- **THEN** the system returns status 404 with `{ "message": "找不到通知" }`
- **AND** the system does not replace the original dismissal timestamp


<!-- @trace
source: add-notification-soft-dismissal
updated: 2026-07-12
code:
  - .playwright-cli/page-2026-07-12T06-20-10-333Z.yml
  - prisma/migrations/20260711003217_add_availability_range_to_candidate_slot_vote/migration.sql
  - prisma/migrations/20260709133702_add_availability_range/migration.sql
  - API_DOCS.md
  - src/controllers/activityController.js
  - src/services/notificationService.js
  - .playwright-cli/page-2026-07-12T06-19-30-604Z.yml
  - .playwright-cli/console-2026-07-12T06-18-01-369Z.log
  - .playwright-cli/page-2026-07-12T06-19-20-768Z.yml
  - src/controllers/notificationController.js
  - prisma/migrations/20260712000000_add_notification_dismissed_at/migration.sql
  - src/routes/notifications.js
  - prisma/schema.prisma
  - prisma/migrations/20260710150918_add_notification_user_read_index/migration.sql
  - .playwright-cli/page-2026-07-12T06-18-01-893Z.yml
tests:
  - src/__tests__/notificationService.test.js
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/computeSlotOverlapRanking.test.js
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/computeRangeRanking.test.js
  - src/__tests__/notificationController.test.js
-->

---
### Requirement: Protect pending friend request notifications

The system MUST reject dismissal when an owned visible notification has type `friend_request_created`, references a friendship, and that friendship has status `pending`. The system SHALL allow dismissal after that friendship is accepted or rejected.

#### Scenario: Pending friend request is protected

- **WHEN** an authenticated user dismisses their `friend_request_created` notification whose referenced friendship has status `pending`
- **THEN** the system returns status 409 with `{ "message": "待處理的好友邀請無法移除" }`
- **AND** the system leaves `is_read` and `dismissed_at` unchanged

#### Scenario: Accepted friend request can be dismissed

- **WHEN** an authenticated user dismisses their `friend_request_created` notification whose referenced friendship has status `accepted`
- **THEN** the system soft dismisses the notification and returns status 200

#### Scenario: Rejected friend request can be dismissed

- **WHEN** an authenticated user dismisses their `friend_request_created` notification whose referenced friendship has status `rejected`
- **THEN** the system soft dismisses the notification and returns status 200


<!-- @trace
source: add-notification-soft-dismissal
updated: 2026-07-12
code:
  - .playwright-cli/page-2026-07-12T06-20-10-333Z.yml
  - prisma/migrations/20260711003217_add_availability_range_to_candidate_slot_vote/migration.sql
  - prisma/migrations/20260709133702_add_availability_range/migration.sql
  - API_DOCS.md
  - src/controllers/activityController.js
  - src/services/notificationService.js
  - .playwright-cli/page-2026-07-12T06-19-30-604Z.yml
  - .playwright-cli/console-2026-07-12T06-18-01-369Z.log
  - .playwright-cli/page-2026-07-12T06-19-20-768Z.yml
  - src/controllers/notificationController.js
  - prisma/migrations/20260712000000_add_notification_dismissed_at/migration.sql
  - src/routes/notifications.js
  - prisma/schema.prisma
  - prisma/migrations/20260710150918_add_notification_user_read_index/migration.sql
  - .playwright-cli/page-2026-07-12T06-18-01-893Z.yml
tests:
  - src/__tests__/notificationService.test.js
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/computeSlotOverlapRanking.test.js
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/computeRangeRanking.test.js
  - src/__tests__/notificationController.test.js
-->

---
### Requirement: Exclude dismissed notifications from the normal list

The system SHALL query `GET /api/notifications` by authenticated user and `dismissed_at` being null. It SHALL preserve the existing notification response shape and SHALL continue returning read notifications that have not been dismissed.

#### Scenario: Dismissed notification is hidden

- **WHEN** an authenticated user requests their notification list after a notification has been dismissed
- **THEN** the response does not contain the dismissed notification

#### Scenario: Read but visible notification remains listed

- **WHEN** an authenticated user requests their notification list and an owned notification has `is_read` true and `dismissed_at` null
- **THEN** the response contains that notification with the existing response fields


<!-- @trace
source: add-notification-soft-dismissal
updated: 2026-07-12
code:
  - .playwright-cli/page-2026-07-12T06-20-10-333Z.yml
  - prisma/migrations/20260711003217_add_availability_range_to_candidate_slot_vote/migration.sql
  - prisma/migrations/20260709133702_add_availability_range/migration.sql
  - API_DOCS.md
  - src/controllers/activityController.js
  - src/services/notificationService.js
  - .playwright-cli/page-2026-07-12T06-19-30-604Z.yml
  - .playwright-cli/console-2026-07-12T06-18-01-369Z.log
  - .playwright-cli/page-2026-07-12T06-19-20-768Z.yml
  - src/controllers/notificationController.js
  - prisma/migrations/20260712000000_add_notification_dismissed_at/migration.sql
  - src/routes/notifications.js
  - prisma/schema.prisma
  - prisma/migrations/20260710150918_add_notification_user_read_index/migration.sql
  - .playwright-cli/page-2026-07-12T06-18-01-893Z.yml
tests:
  - src/__tests__/notificationService.test.js
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/computeSlotOverlapRanking.test.js
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/computeRangeRanking.test.js
  - src/__tests__/notificationController.test.js
-->

---
### Requirement: Protect the dismissal endpoint with authentication

The system MUST apply the existing authentication middleware to `PATCH /api/notifications/:id/dismiss`.

#### Scenario: Unauthenticated dismissal request

- **WHEN** a request without valid authentication calls the dismissal endpoint
- **THEN** the authentication middleware rejects the request before the dismissal controller runs


<!-- @trace
source: add-notification-soft-dismissal
updated: 2026-07-12
code:
  - .playwright-cli/page-2026-07-12T06-20-10-333Z.yml
  - prisma/migrations/20260711003217_add_availability_range_to_candidate_slot_vote/migration.sql
  - prisma/migrations/20260709133702_add_availability_range/migration.sql
  - API_DOCS.md
  - src/controllers/activityController.js
  - src/services/notificationService.js
  - .playwright-cli/page-2026-07-12T06-19-30-604Z.yml
  - .playwright-cli/console-2026-07-12T06-18-01-369Z.log
  - .playwright-cli/page-2026-07-12T06-19-20-768Z.yml
  - src/controllers/notificationController.js
  - prisma/migrations/20260712000000_add_notification_dismissed_at/migration.sql
  - src/routes/notifications.js
  - prisma/schema.prisma
  - prisma/migrations/20260710150918_add_notification_user_read_index/migration.sql
  - .playwright-cli/page-2026-07-12T06-18-01-893Z.yml
tests:
  - src/__tests__/notificationService.test.js
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/computeSlotOverlapRanking.test.js
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/computeRangeRanking.test.js
  - src/__tests__/notificationController.test.js
-->

---
### Requirement: Return a server error for dismissal failures

The system SHALL convert unexpected dismissal service or database exceptions into the existing generic server-error response.

#### Scenario: Database update fails

- **WHEN** the notification dismissal operation throws a database exception
- **THEN** the system returns status 500 with `{ "message": "伺服器錯誤" }`

<!-- @trace
source: add-notification-soft-dismissal
updated: 2026-07-12
code:
  - .playwright-cli/page-2026-07-12T06-20-10-333Z.yml
  - prisma/migrations/20260711003217_add_availability_range_to_candidate_slot_vote/migration.sql
  - prisma/migrations/20260709133702_add_availability_range/migration.sql
  - API_DOCS.md
  - src/controllers/activityController.js
  - src/services/notificationService.js
  - .playwright-cli/page-2026-07-12T06-19-30-604Z.yml
  - .playwright-cli/console-2026-07-12T06-18-01-369Z.log
  - .playwright-cli/page-2026-07-12T06-19-20-768Z.yml
  - src/controllers/notificationController.js
  - prisma/migrations/20260712000000_add_notification_dismissed_at/migration.sql
  - src/routes/notifications.js
  - prisma/schema.prisma
  - prisma/migrations/20260710150918_add_notification_user_read_index/migration.sql
  - .playwright-cli/page-2026-07-12T06-18-01-893Z.yml
tests:
  - src/__tests__/notificationService.test.js
  - src/__tests__/scenarioBRange.test.js
  - src/__tests__/computeSlotOverlapRanking.test.js
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/computeRangeRanking.test.js
  - src/__tests__/notificationController.test.js
-->