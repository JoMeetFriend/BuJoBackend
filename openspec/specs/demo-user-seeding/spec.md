# demo-user-seeding Specification

## Purpose

TBD - created by archiving change 'seed-demo-users'. Update Purpose after archive.

## Requirements

### Requirement: Seed five fixed demo users

The demo user seed SHALL create exactly five users named Alice, Bob, Carol, Dave, and Eve in one database transaction and SHALL return them under the keys `alice`, `bob`, `carol`, `dave`, and `eve`.

#### Scenario: Seed users successfully

- **WHEN** `seedUsers(prisma)` runs against an empty migrated database
- **THEN** it creates the five fixed users and returns each created user under its matching lowercase role key


<!-- @trace
source: seed-demo-users
updated: 2026-07-14
code:
  - prisma/seeds/friendships.js
  - prisma/seed-assets/avatars/carol.png
  - prisma/seed-assets/avatars/alice.png
  - prisma/seeds/activities.js
  - prisma/seeds/notifications.js
  - prisma/seeds/legacy/seed-v1.js
  - prisma/seed.js
  - prisma/seed-assets/avatars/bob.png
  - prisma/seed-assets/avatars/dave.png
  - prisma/seeds/users.js
  - prisma/seed-assets/avatars/eve.png
  - src/services/cloudinaryAvatarService.js
  - package.json
tests:
  - src/__tests__/seedUsers.test.js
  - src/__tests__/cloudinaryAvatarService.test.js
-->

---
### Requirement: Create local-only login identities

Each demo user SHALL have exactly one nested identity with provider `local`; its `provider_user_id` and `email` SHALL both equal the role's `<name>@example.com` address. The seed MUST NOT create Google or LINE identities.

#### Scenario: Demo user authenticates locally

- **WHEN** a demo identity is created
- **THEN** it contains the matching example.com email, the local provider, and a bcrypt password hash


<!-- @trace
source: seed-demo-users
updated: 2026-07-14
code:
  - prisma/seeds/friendships.js
  - prisma/seed-assets/avatars/carol.png
  - prisma/seed-assets/avatars/alice.png
  - prisma/seeds/activities.js
  - prisma/seeds/notifications.js
  - prisma/seeds/legacy/seed-v1.js
  - prisma/seed.js
  - prisma/seed-assets/avatars/bob.png
  - prisma/seed-assets/avatars/dave.png
  - prisma/seeds/users.js
  - prisma/seed-assets/avatars/eve.png
  - src/services/cloudinaryAvatarService.js
  - package.json
tests:
  - src/__tests__/seedUsers.test.js
  - src/__tests__/cloudinaryAvatarService.test.js
-->

---
### Requirement: Share one securely generated demo password hash

The seed SHALL hash `BujoDemo#2026` exactly once with bcrypt cost 10 and SHALL store the resulting non-plaintext hash in all five local identities. The seed MUST NOT print the plaintext password.

#### Scenario: Shared password verifies

- **WHEN** any of the five stored hashes is compared with `BujoDemo#2026`
- **THEN** bcrypt verification succeeds and the stored value is not equal to the plaintext password


<!-- @trace
source: seed-demo-users
updated: 2026-07-14
code:
  - prisma/seeds/friendships.js
  - prisma/seed-assets/avatars/carol.png
  - prisma/seed-assets/avatars/alice.png
  - prisma/seeds/activities.js
  - prisma/seeds/notifications.js
  - prisma/seeds/legacy/seed-v1.js
  - prisma/seed.js
  - prisma/seed-assets/avatars/bob.png
  - prisma/seed-assets/avatars/dave.png
  - prisma/seeds/users.js
  - prisma/seed-assets/avatars/eve.png
  - src/services/cloudinaryAvatarService.js
  - package.json
tests:
  - src/__tests__/seedUsers.test.js
  - src/__tests__/cloudinaryAvatarService.test.js
-->

---
### Requirement: Preserve planned profile data

Alice, Bob, and Carol SHALL have their planned Traditional Chinese bios, while Dave and Eve SHALL have null bios.

#### Scenario: Profile fields are seeded

- **WHEN** the five user create payloads are inspected
- **THEN** each role's bio matches the planned demo profile data


<!-- @trace
source: seed-demo-users
updated: 2026-07-14
code:
  - prisma/seeds/friendships.js
  - prisma/seed-assets/avatars/carol.png
  - prisma/seed-assets/avatars/alice.png
  - prisma/seeds/activities.js
  - prisma/seeds/notifications.js
  - prisma/seeds/legacy/seed-v1.js
  - prisma/seed.js
  - prisma/seed-assets/avatars/bob.png
  - prisma/seed-assets/avatars/dave.png
  - prisma/seeds/users.js
  - prisma/seed-assets/avatars/eve.png
  - src/services/cloudinaryAvatarService.js
  - package.json
tests:
  - src/__tests__/seedUsers.test.js
  - src/__tests__/cloudinaryAvatarService.test.js
-->

---
### Requirement: Seed fixed Cloudinary avatar images

The seed SHALL read one repository-owned PNG for each demo role, upload it through the existing Cloudinary avatar service with deterministic public ID `demo-users/<key>`, and store the returned URL and public ID on the matching User.

#### Scenario: Upload all demo avatars

- **WHEN** `seedUsers(prisma)` runs with valid Cloudinary configuration and all five avatar assets
- **THEN** it uploads Alice, Bob, Carol, Dave, and Eve avatars before the User transaction and persists each matching upload result


<!-- @trace
source: seed-demo-users
updated: 2026-07-14
code:
  - prisma/seeds/friendships.js
  - prisma/seed-assets/avatars/carol.png
  - prisma/seed-assets/avatars/alice.png
  - prisma/seeds/activities.js
  - prisma/seeds/notifications.js
  - prisma/seeds/legacy/seed-v1.js
  - prisma/seed.js
  - prisma/seed-assets/avatars/bob.png
  - prisma/seed-assets/avatars/dave.png
  - prisma/seeds/users.js
  - prisma/seed-assets/avatars/eve.png
  - src/services/cloudinaryAvatarService.js
  - package.json
tests:
  - src/__tests__/seedUsers.test.js
  - src/__tests__/cloudinaryAvatarService.test.js
-->

---
### Requirement: Abort before database writes when avatar preparation fails

The seed SHALL reject with the original file or Cloudinary error and MUST NOT start the User transaction when any demo avatar cannot be read or uploaded.

#### Scenario: Cloudinary upload fails

- **WHEN** one of the five avatar uploads rejects
- **THEN** `seedUsers(prisma)` rejects with that error and the User transaction is never called


<!-- @trace
source: seed-demo-users
updated: 2026-07-14
code:
  - prisma/seeds/friendships.js
  - prisma/seed-assets/avatars/carol.png
  - prisma/seed-assets/avatars/alice.png
  - prisma/seeds/activities.js
  - prisma/seeds/notifications.js
  - prisma/seeds/legacy/seed-v1.js
  - prisma/seed.js
  - prisma/seed-assets/avatars/bob.png
  - prisma/seed-assets/avatars/dave.png
  - prisma/seeds/users.js
  - prisma/seed-assets/avatars/eve.png
  - src/services/cloudinaryAvatarService.js
  - package.json
tests:
  - src/__tests__/seedUsers.test.js
  - src/__tests__/cloudinaryAvatarService.test.js
-->

---
### Requirement: Preserve existing API avatar upload behavior

The Cloudinary avatar service SHALL accept optional deterministic public ID settings for seed callers while existing callers that omit settings SHALL retain generated Cloudinary public IDs.

#### Scenario: API caller omits deterministic public ID

- **WHEN** `uploadAvatarImage(file)` is called without options
- **THEN** the Cloudinary upload request omits `public_id`, `overwrite`, and `invalidate`

<!-- @trace
source: seed-demo-users
updated: 2026-07-14
code:
  - prisma/seeds/friendships.js
  - prisma/seed-assets/avatars/carol.png
  - prisma/seed-assets/avatars/alice.png
  - prisma/seeds/activities.js
  - prisma/seeds/notifications.js
  - prisma/seeds/legacy/seed-v1.js
  - prisma/seed.js
  - prisma/seed-assets/avatars/bob.png
  - prisma/seed-assets/avatars/dave.png
  - prisma/seeds/users.js
  - prisma/seed-assets/avatars/eve.png
  - src/services/cloudinaryAvatarService.js
  - package.json
tests:
  - src/__tests__/seedUsers.test.js
  - src/__tests__/cloudinaryAvatarService.test.js
-->