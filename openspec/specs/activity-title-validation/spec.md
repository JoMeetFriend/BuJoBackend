# activity-title-validation Specification

## Purpose

TBD - created by archiving change 'activity-title-length-validation'. Update Purpose after archive.

## Requirements

### Requirement: Create activity rejects titles longer than 15 characters

The create activity API SHALL accept only string activity titles that are non-empty after trimming and no longer than 15 characters after trimming.

#### Scenario: Empty title is rejected

- **WHEN** the create activity request omits `title` or sends a title that trims to an empty string
- **THEN** the API SHALL respond with status `400`
- **AND** no activity-related records SHALL be created

#### Scenario: Non-string title is rejected

- **WHEN** the create activity request sends a non-string `title`
- **THEN** the API SHALL respond with status `400`
- **AND** no activity-related records SHALL be created

#### Scenario: Overlong title is rejected

- **WHEN** the create activity request sends a title longer than 15 characters after trimming
- **THEN** the API SHALL respond with status `400`
- **AND** no activity-related records SHALL be created

#### Scenario: Boundary title is persisted normalized

- **WHEN** the create activity request sends a title that trims to exactly 15 characters
- **THEN** the API SHALL create the activity
- **AND** the stored activity title and chat name SHALL use the trimmed title

<!-- @trace
source: activity-title-length-validation
updated: 2026-07-19
-->
