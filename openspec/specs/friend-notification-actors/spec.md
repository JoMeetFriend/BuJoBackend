# friend-notification-actors Specification

## Purpose

TBD - created by archiving change 'show-friend-notification-avatars'. Update Purpose after archive.

## Requirements

### Requirement: Notification actor response contract

The system SHALL include an `actor` field in every notification object returned by `GET /api/notifications`. A non-null actor MUST contain exactly the camelCase fields `id`, `displayName`, and `avatarUrl`, where `avatarUrl` is a string or null.

#### Scenario: Friend request created actor is the requester

- **WHEN** a `friend_request_created` notification references an existing friendship
- **THEN** the notification actor contains the friendship requester's `id`, `displayName`, and `avatarUrl`

##### Example: requester with an avatar

- **GIVEN** friendship `friendship-1` has requester `{ id: "user-a", display_name: "A", avatar_url: "https://example.com/a.png" }`
- **WHEN** the receiver lists a `friend_request_created` notification referencing `friendship-1`
- **THEN** the actor is `{ "id": "user-a", "displayName": "A", "avatarUrl": "https://example.com/a.png" }`

#### Scenario: Friend request accepted actor is the receiver

- **WHEN** a `friend_request_accepted` notification references an existing friendship
- **THEN** the notification actor contains the friendship receiver's `id`, `displayName`, and `avatarUrl`

##### Example: receiver with an avatar

- **GIVEN** friendship `friendship-1` has receiver `{ id: "user-b", display_name: "B", avatar_url: "https://example.com/b.png" }`
- **WHEN** the requester lists a `friend_request_accepted` notification referencing `friendship-1`
- **THEN** the actor is `{ "id": "user-b", "displayName": "B", "avatarUrl": "https://example.com/b.png" }`

#### Scenario: Actor retains a null avatar

- **WHEN** the selected requester, receiver, or activity creator has `avatar_url = null`
- **THEN** the system returns a non-null actor with `avatarUrl: null`
- **AND** the actor still contains the selected user's `id` and `displayName`

#### Scenario: Missing friendship returns a null actor

- **WHEN** a friendship notification has a missing reference ID or references a friendship that is not returned by the database
- **THEN** the notification actor is null
- **AND** the notification remains in the response with its existing fallback message, reference, and actions behavior

#### Scenario: Other notifications return a null actor

- **WHEN** a `formation_ready`, `time_to_pick`, `activity_confirmed`, `activity_cancelled`, or general notification is returned
- **THEN** the notification actor is null


<!-- @trace
source: show-friend-notification-avatars
updated: 2026-07-16
code:
  - API_DOCS.md
  - src/services/notificationService.js
tests:
  - src/__tests__/notificationService.test.js
  - src/__tests__/notificationController.test.js
-->

---
### Requirement: Activity-created notification actor

For an `activity_created` notification, the system SHALL use the referenced activity's creator as the actor. The system MUST map only the creator's `id`, `display_name`, and `avatar_url` to the actor's `id`, `displayName`, and `avatarUrl`, and MUST reuse the creator loaded for activity formatting without an additional activity or user query.

#### Scenario: Activity-created actor is the creator

- **WHEN** an `activity_created` notification references an existing activity with a creator
- **THEN** the notification actor contains the activity creator's `id`, `displayName`, and `avatarUrl`

##### Example: creator with an avatar

- **GIVEN** activity `activity-1` has creator `{ id: "user-a", display_name: "A", avatar_url: "https://example.com/a.png" }`
- **WHEN** a user lists an `activity_created` notification referencing `activity-1`
- **THEN** the actor is `{ "id": "user-a", "displayName": "A", "avatarUrl": "https://example.com/a.png" }`

#### Scenario: Activity creator has no avatar

- **WHEN** an `activity_created` notification references an activity whose creator has `avatar_url = null`
- **THEN** the system returns the creator actor with `avatarUrl: null`
- **AND** the actor still contains the creator's `id` and `displayName`

#### Scenario: Activity or creator is missing

- **WHEN** an `activity_created` notification has a missing reference ID, references an activity that is not returned by the database, or the loaded activity has no creator
- **THEN** the notification actor is null
- **AND** the notification remains in the response with its existing fallback message, reference, and actions behavior

#### Scenario: Other activity lifecycle notifications have no actor

- **WHEN** a `formation_ready`, `time_to_pick`, `activity_confirmed`, or `activity_cancelled` notification is returned
- **THEN** the notification actor is null


<!-- @trace
source: show-friend-notification-avatars
updated: 2026-07-16
code:
  - API_DOCS.md
  - src/services/notificationService.js
tests:
  - src/__tests__/notificationService.test.js
  - src/__tests__/notificationController.test.js
-->

---
### Requirement: Friendship actors are loaded in one batch

For each notification listing request, the system MUST deduplicate all non-null friendship reference IDs and MUST load their friendships, requesters, and receivers with at most one `friendship.findMany` query. The listing formatting path MUST NOT call `friendship.findUnique`.

#### Scenario: Multiple friend notifications use one friendship query

- **WHEN** a notification listing contains multiple friendship notifications with one or more friendship reference IDs
- **THEN** the system calls `friendship.findMany` exactly once with the deduplicated IDs
- **AND** the query loads each friendship's status, requester, and receiver
- **AND** the listing formatting path calls `friendship.findUnique` zero times

##### Example: repeated and distinct references

- **GIVEN** three friend notifications reference `friendship-1`, `friendship-1`, and `friendship-2`
- **WHEN** the notifications are listed
- **THEN** one `friendship.findMany` query receives `["friendship-1", "friendship-2"]`

#### Scenario: Listing without friendship references skips the batch query

- **WHEN** a notification listing contains no non-null friendship reference IDs
- **THEN** the system does not call `friendship.findMany`
- **AND** `activity_created` uses its creator actor while other activity lifecycle and general notifications use `actor: null`


<!-- @trace
source: show-friend-notification-avatars
updated: 2026-07-16
code:
  - API_DOCS.md
  - src/services/notificationService.js
tests:
  - src/__tests__/notificationService.test.js
  - src/__tests__/notificationController.test.js
-->

---
### Requirement: Existing notification listing behavior is preserved

Adding actor data MUST NOT change notification ordering, dismissal filtering, pagination behavior, message formatting, read state, timestamps, reference data, or actions.

#### Scenario: Existing fields remain unchanged

- **WHEN** the system enriches a notification with actor data
- **THEN** the notification retains its existing `id`, `type`, `category`, `message`, `timeText`, `isRead`, `createdAt`, `reference`, and `actions` values
- **AND** the system continues filtering with `dismissed_at: null` and ordering by `created_at` descending

#### Scenario: Missing friendship does not fail the listing

- **WHEN** a referenced friendship cannot be loaded
- **THEN** the system returns the notification instead of producing a new HTTP error
- **AND** the actor and `reference.status` are null
- **AND** the existing friend-message fallback and empty actions are preserved

<!-- @trace
source: show-friend-notification-avatars
updated: 2026-07-16
code:
  - API_DOCS.md
  - src/services/notificationService.js
tests:
  - src/__tests__/notificationService.test.js
  - src/__tests__/notificationController.test.js
-->