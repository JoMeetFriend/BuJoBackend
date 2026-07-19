# Tasks

## 1. Backend Title Validation

- [x] Add backend title normalization and 15-character validation to `createActivity`.
- [x] Persist normalized title to both activity title and chat name.
- [x] Verify Requirement: Create activity rejects titles longer than 15 characters by rejecting missing, non-string, blank, and overlong titles with 400 responses before `prisma.activity.create` is called.

## 2. Verification

- [x] Add controller tests for empty, non-string, overlong, and valid boundary titles.
- [x] Run targeted backend activity tests.
