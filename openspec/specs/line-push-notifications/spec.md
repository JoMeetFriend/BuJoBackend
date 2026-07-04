# line-push-notifications Specification

## Purpose

TBD - created by archiving change 'add-line-push-notifications'. Update Purpose after archive.

## Requirements

### Requirement: LINE push delivery for supported notifications

The system SHALL attempt a LINE text push after creating an in-app notification for friend request created, friend request accepted, and activity created notification types.

#### Scenario: Friend request created notification is pushed

- **WHEN** user A sends a friend request to user B and user B is eligible for LINE push delivery
- **THEN** the system sends one LINE text push to user B with the message "{requesterName} 向你發送好友邀請"

#### Scenario: Friend request accepted notification is pushed

- **WHEN** user B accepts user A's friend request and user A is eligible for LINE push delivery
- **THEN** the system sends one LINE text push to user A with the message "{receiverName} 接受了你的好友邀請"

#### Scenario: Activity created notification is pushed to eligible friends

- **WHEN** user A creates an activity and two accepted friends are eligible for LINE push delivery
- **THEN** the system sends one LINE text push to each eligible friend with the message "{creatorName} 建立了新活動：{activityTitle}"


<!-- @trace
source: add-line-push-notifications
updated: 2026-07-02
code:
  - src/services/lineMessagingService.js
  - API_DOCS.md
  - .env.example
  - src/controllers/friendshipController.js
  - src/services/lineService.js
  - .spectra.yaml
  - src/services/notificationService.js
  - docs/line-official-account-setup.md
tests:
  - src/__tests__/notificationService.test.js
  - src/__tests__/lineMessagingService.test.js
-->

---
### Requirement: LINE recipient eligibility

The system SHALL send LINE push notifications only to recipients who have a LINE identity, have not disabled LINE for the notification type, and are processed while real LINE push delivery is enabled.

#### Scenario: Recipient with LINE identity and enabled preference is eligible

- **WHEN** a notification recipient has `user_identities.provider` equal to "line", has a non-empty `provider_user_id`, and has no notification preference row for the notification type
- **THEN** the system treats LINE delivery as enabled for that recipient

#### Scenario: Recipient with disabled LINE preference is skipped

- **WHEN** a notification recipient has a `notification_preferences` row for the notification type with `line` equal to false
- **THEN** the system does not send a LINE push for that recipient

#### Scenario: Recipient without LINE identity is skipped

- **WHEN** a notification recipient has no `user_identities` row with `provider` equal to "line"
- **THEN** the system does not send a LINE push for that recipient


<!-- @trace
source: add-line-push-notifications
updated: 2026-07-02
code:
  - src/services/lineMessagingService.js
  - API_DOCS.md
  - .env.example
  - src/controllers/friendshipController.js
  - src/services/lineService.js
  - .spectra.yaml
  - src/services/notificationService.js
  - docs/line-official-account-setup.md
tests:
  - src/__tests__/notificationService.test.js
  - src/__tests__/lineMessagingService.test.js
-->

---
### Requirement: LINE Messaging API request shape

The system SHALL use the LINE Messaging API push message endpoint with the configured Messaging API channel access token when real LINE push delivery is enabled.

#### Scenario: Enabled push sends a text message request

- **WHEN** `LINE_PUSH_ENABLED` equals "true", `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` is configured, and the system sends a LINE push to recipient "U123"
- **THEN** the system posts to `https://api.line.me/v2/bot/message/push` with an Authorization bearer token and JSON body `{ "to": "U123", "messages": [{ "type": "text", "text": "message text" }] }`

#### Scenario: Disabled push does not call LINE

- **WHEN** `LINE_PUSH_ENABLED` does not equal "true"
- **THEN** the system returns a skipped delivery result and does not call the LINE Messaging API endpoint


<!-- @trace
source: add-line-push-notifications
updated: 2026-07-02
code:
  - src/services/lineMessagingService.js
  - API_DOCS.md
  - .env.example
  - src/controllers/friendshipController.js
  - src/services/lineService.js
  - .spectra.yaml
  - src/services/notificationService.js
  - docs/line-official-account-setup.md
tests:
  - src/__tests__/notificationService.test.js
  - src/__tests__/lineMessagingService.test.js
-->

---
### Requirement: LINE delivery failures do not break core notification flows

The system SHALL keep the original API operation and in-app notification successful when LINE delivery cannot be completed.

#### Scenario: LINE API returns an error

- **WHEN** the LINE Messaging API returns a non-success HTTP response while sending a supported notification
- **THEN** the system records a failed delivery result and the original friend request, friend acceptance, or activity creation operation remains successful

#### Scenario: LINE push configuration is missing

- **WHEN** real LINE push delivery is enabled but `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` is missing
- **THEN** the system records a failed delivery result and the in-app notification remains created


<!-- @trace
source: add-line-push-notifications
updated: 2026-07-02
code:
  - src/services/lineMessagingService.js
  - API_DOCS.md
  - .env.example
  - src/controllers/friendshipController.js
  - src/services/lineService.js
  - .spectra.yaml
  - src/services/notificationService.js
  - docs/line-official-account-setup.md
tests:
  - src/__tests__/notificationService.test.js
  - src/__tests__/lineMessagingService.test.js
-->

---
### Requirement: LINE Official Account setup documentation

The system SHALL include operator documentation that teaches how to create and configure the LINE Official Account prerequisites required by LINE push notifications.

#### Scenario: Setup guide explains required LINE resources

- **WHEN** an implementer opens the LINE setup guide
- **THEN** the guide lists LINE Official Account creation, Messaging API enablement, same-provider selection, Messaging API channel access token creation, and local environment variable setup as required steps

#### Scenario: Setup guide explains how users add the Official Account

- **WHEN** an implementer opens the LINE setup guide
- **THEN** the guide explains QR code, add friend link, and LINE Login add friend option using `bot_prompt=normal` or `bot_prompt=aggressive` as supported ways to help users add the Official Account

#### Scenario: Setup guide separates manual LINE setup from backend code

- **WHEN** an implementer reads the LINE setup guide before running the backend
- **THEN** the guide states that the backend does not create LINE Official Accounts, providers, Messaging API channels, or channel access tokens automatically

<!-- @trace
source: add-line-push-notifications
updated: 2026-07-02
code:
  - src/services/lineMessagingService.js
  - API_DOCS.md
  - .env.example
  - src/controllers/friendshipController.js
  - src/services/lineService.js
  - .spectra.yaml
  - src/services/notificationService.js
  - docs/line-official-account-setup.md
tests:
  - src/__tests__/notificationService.test.js
  - src/__tests__/lineMessagingService.test.js
-->