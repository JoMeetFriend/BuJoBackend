# line-oauth-onboarding-flow Specification

## Purpose

TBD - created by archiving change 'improve-line-notification-onboarding-oauth-flow'. Update Purpose after archive.

## Requirements

### Requirement: Authorization prompt is selected by OAuth entry point

The system SHALL allow `createLineAuthorizationUrl` callers to select only `normal` or `aggressive` as the LINE `bot_prompt`. The standard LINE login entry point SHALL select `normal`, and the authenticated LINE linking entry point SHALL select `aggressive`.

#### Scenario: Standard login uses normal prompt

- **WHEN** a client starts OAuth through `GET /api/auth/line`
- **THEN** the LINE authorization URL contains `bot_prompt=normal`
- **AND** the stored OAuth attempt has a null user ID

#### Scenario: Authenticated linking uses aggressive prompt

- **WHEN** an authenticated user starts OAuth through `GET /api/auth/line/link`
- **THEN** the LINE authorization URL contains `bot_prompt=aggressive`
- **AND** the stored OAuth attempt contains the authenticated BuJo user ID

#### Scenario: Unsupported prompt is rejected

- **WHEN** a caller supplies a `bot_prompt` value other than the exact string `normal` or `aggressive`
- **THEN** the authorization service rejects the request before creating an OAuth attempt


<!-- @trace
source: improve-line-notification-onboarding-oauth-flow
updated: 2026-07-17
code:
  - src/services/lineService.js
  - API_DOCS.md
  - src/controllers/lineAuthController.js
  - README.md
tests:
  - src/__tests__/lineAuthController.test.js
  - src/__tests__/lineService.test.js
-->

---
### Requirement: OAuth attempt authoritatively determines callback mode

The system MUST validate and consume the callback state before handling provider cancellation, a missing authorization code, token exchange, ID token verification, or identity resolution. A valid attempt with a null user ID SHALL be treated as login, and a valid attempt with a non-null user ID SHALL be treated as link.

#### Scenario: Valid state is consumed on provider cancellation

- **WHEN** LINE returns `error=access_denied` with a valid unconsumed state
- **THEN** the system consumes that OAuth attempt exactly once
- **AND** selects the callback outcome from the attempt user ID

#### Scenario: Valid state is consumed when code is missing

- **WHEN** LINE returns neither an authorization code nor `error=access_denied` with a valid unconsumed state
- **THEN** the system consumes that OAuth attempt exactly once
- **AND** selects the failure redirect from the attempt user ID

#### Scenario: Invalid state cannot claim link mode

- **WHEN** callback state is missing, unknown, expired, or already consumed
- **THEN** the system SHALL NOT exchange a code, verify an ID token, create an identity, or issue a login cookie
- **AND** redirects to `/login?error=line_login_failed`


<!-- @trace
source: improve-line-notification-onboarding-oauth-flow
updated: 2026-07-17
code:
  - src/services/lineService.js
  - API_DOCS.md
  - src/controllers/lineAuthController.js
  - README.md
tests:
  - src/__tests__/lineAuthController.test.js
  - src/__tests__/lineService.test.js
-->

---
### Requirement: Login callback preserves login outcomes

The system SHALL keep successful login behavior and SHALL return login cancellation or failure to the login page after a valid login attempt is consumed.

#### Scenario: Login succeeds

- **WHEN** a valid login attempt completes code exchange and LINE ID token verification
- **THEN** the system finds or creates the LINE user
- **AND** issues the existing `token` HTTP-only cookie
- **AND** redirects to the frontend root URL

#### Scenario: Login is cancelled

- **WHEN** LINE returns `error=access_denied` with a valid login attempt state
- **THEN** the system redirects to `/login?error=line_cancelled`
- **AND** does not issue a login cookie

#### Scenario: Login processing fails

- **WHEN** a valid login attempt has no code or code exchange, ID token verification, or user resolution fails
- **THEN** the system redirects to `/login?error=line_login_failed`
- **AND** does not issue a login cookie


<!-- @trace
source: improve-line-notification-onboarding-oauth-flow
updated: 2026-07-17
code:
  - src/services/lineService.js
  - API_DOCS.md
  - src/controllers/lineAuthController.js
  - README.md
tests:
  - src/__tests__/lineAuthController.test.js
  - src/__tests__/lineService.test.js
-->

---
### Requirement: Link callback remains in the authenticated settings context

The system SHALL return every outcome for a valid link attempt to the profile edit page and SHALL use the attempt user ID as the only target BuJo account for identity linking.

#### Scenario: Link succeeds

- **WHEN** a valid link attempt completes code exchange and LINE ID token verification and the LINE identity is available to the attempt user
- **THEN** the system links the identity to the attempt user ID
- **AND** redirects to `/profile/edit?linked=line`
- **AND** does not issue a new login cookie

#### Scenario: Link is cancelled

- **WHEN** LINE returns `error=access_denied` with a valid link attempt state
- **THEN** the system redirects to `/profile/edit?error=line_link_cancelled`
- **AND** does not redirect to the login page

#### Scenario: Link processing fails

- **WHEN** a valid link attempt has no code or code exchange, ID token verification, or identity linking fails
- **THEN** the system redirects to `/profile/edit?error=line_link_failed`
- **AND** does not redirect to the login page

#### Scenario: Provider identity belongs to another BuJo account

- **WHEN** a valid link attempt resolves to a LINE provider user ID already linked to a different BuJo user
- **THEN** the system does not create, move, or duplicate the identity
- **AND** redirects to `/profile/edit?error=line_link_failed`

#### Scenario: Provider identity already belongs to the current BuJo account

- **WHEN** a valid link attempt resolves to a LINE provider user ID already linked to the same BuJo user
- **THEN** the system treats the link as idempotent success without creating a duplicate identity
- **AND** redirects to `/profile/edit?linked=line`

<!-- @trace
source: improve-line-notification-onboarding-oauth-flow
updated: 2026-07-17
code:
  - src/services/lineService.js
  - API_DOCS.md
  - src/controllers/lineAuthController.js
  - README.md
tests:
  - src/__tests__/lineAuthController.test.js
  - src/__tests__/lineService.test.js
-->