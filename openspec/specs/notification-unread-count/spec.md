# notification-unread-count Specification

## Purpose

TBD - created by archiving change 'notification-unread-count'. Update Purpose after archive.

## Requirements

### Requirement: Unread notification count endpoint

The system SHALL expose `GET /api/notifications/unread-count`, protected by the same authentication middleware as the other `/api/notifications` endpoints, that returns the number of unread notifications belonging to the authenticated user as `{ "unreadCount": <integer> }`.

#### Scenario: Authenticated user with unread notifications

- **WHEN** an authenticated user with unread notifications calls `GET /api/notifications/unread-count`
- **THEN** the system responds `200` with `unreadCount` equal to the number of that user's notification rows where `is_read` is `false`

##### Example: three unread out of five total

- **GIVEN** the user has 5 notifications, 3 with `is_read = false` and 2 with `is_read = true`
- **WHEN** the user calls `GET /api/notifications/unread-count`
- **THEN** the response body is `{ "unreadCount": 3 }`

#### Scenario: No unread notifications

- **WHEN** an authenticated user has zero notifications with `is_read = false`
- **THEN** the system responds `200` with `{ "unreadCount": 0 }`

#### Scenario: Unauthenticated request rejected

- **WHEN** a request to `GET /api/notifications/unread-count` has no valid `token` cookie
- **THEN** the system responds `401` with `{ "message": "未登入" }` and does not query the database

#### Scenario: Count excludes other users' notifications

- **WHEN** the system computes the unread count for the authenticated user
- **THEN** only notification rows whose `user_id` matches the authenticated user are counted, regardless of how many unread notifications other users have


<!-- @trace
source: notification-unread-count
updated: 2026-07-11
code:
  - src/controllers/notificationController.js
  - prisma/schema.prisma
  - src/routes/notifications.js
  - src/services/notificationService.js
  - API_DOCS.md
  - prisma/migrations/20260710150918_add_notification_user_read_index/migration.sql
tests:
  - src/__tests__/notificationService.test.js
  - src/__tests__/notificationController.test.js
-->

---
### Requirement: Unread count reflects read-state changes

The system SHALL reflect the effect of the mark-read endpoints (`PATCH /api/notifications/:id/read` and `PATCH /api/notifications/read-all`) in subsequent calls to `GET /api/notifications/unread-count`, since both operations mutate `is_read` on the same `Notification` rows the count query reads.

#### Scenario: Count decreases after marking a single notification as read

- **GIVEN** the authenticated user has N unread notifications
- **WHEN** the user marks one of them as read via `PATCH /api/notifications/:id/read`
- **THEN** a subsequent `GET /api/notifications/unread-count` call returns `unreadCount` equal to N - 1

#### Scenario: Count becomes zero after marking all as read

- **GIVEN** the authenticated user has one or more unread notifications
- **WHEN** the user calls `PATCH /api/notifications/read-all`
- **THEN** a subsequent `GET /api/notifications/unread-count` call returns `{ "unreadCount": 0 }`

<!-- @trace
source: notification-unread-count
updated: 2026-07-11
code:
  - src/controllers/notificationController.js
  - prisma/schema.prisma
  - src/routes/notifications.js
  - src/services/notificationService.js
  - API_DOCS.md
  - prisma/migrations/20260710150918_add_notification_user_read_index/migration.sql
tests:
  - src/__tests__/notificationService.test.js
  - src/__tests__/notificationController.test.js
-->