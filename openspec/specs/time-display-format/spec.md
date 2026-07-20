# time-display-format Specification

## Purpose

TBD - created by archiving change 'time-picker-24-hour-format'. Update Purpose after archive.

## Requirements

### Requirement: Backend outputs displayed times in zero-padded 24-hour format

The backend SHALL format all outgoing time values (activity card candidate-slot times, scenario 2's time window) using zero-padded 24-hour format `HH:MM` (e.g. `09:00`, `23:00`), via the existing `formatHHMM` helper. It SHALL NOT include `上午`/`下午` (AM/PM) prefixes in any formatted time output. There SHALL be exactly one function responsible for this formatting — the system SHALL NOT maintain a second, duplicate formatter for the same output shape.

#### Scenario: formatHHMM produces zero-padded 24-hour output

- **WHEN** `formatHHMM` is called with a `Date` whose hour is 9 and minute is 0
- **THEN** it SHALL return `'09:00'`

##### Example: boundary hours

| Hour | Minute | Output |
| ---- | ------ | ------ |
| 0    | 0      | `00:00` |
| 9    | 0      | `09:00` |
| 23   | 0      | `23:00` |

#### Scenario: Activity card candidate-slot time display uses the shared formatter

- **WHEN** an activity card's candidate-slot time range is formatted for display
- **THEN** both the start and end time SHALL be produced by `formatHHMM`, matching the same zero-padded 24-hour format used elsewhere (e.g. scenario 2's time window)


<!-- @trace
source: time-picker-24-hour-format
updated: 2026-07-16
code:
  - src/controllers/activityController.js
tests:
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/scenarioBRange.test.js
-->

---
### Requirement: Backend accepts both legacy and new time string formats during the transition period

The backend SHALL parse incoming time strings (via `parseDateTime`) that use either the new zero-padded 24-hour format (`HH:MM`) or the legacy `上午`/`下午` format (`上午/下午 H:MM`), producing an equivalent `Date` result for the same wall-clock hour and minute. This dual-format support exists to decouple backend and frontend deployment timing; it is not a permanent contract.

#### Scenario: Both formats parse to the same result

- **GIVEN** a target date and an hour value
- **WHEN** `parseDateTime` is called once with the legacy-format string for that hour and once with the new-format string for the same hour
- **THEN** both calls SHALL produce a `Date` with the same hour and minute

##### Example: equivalent parses

| Legacy input | New-format input | Resulting hour |
| ------------- | ------------------ | ---------------- |
| `上午 9:00`   | `09:00`             | 9                |
| `下午 6:00`   | `18:00`             | 18               |
| `上午 12:00`  | `00:00`             | 0                |


<!-- @trace
source: time-picker-24-hour-format
updated: 2026-07-16
code:
  - src/controllers/activityController.js
tests:
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/scenarioBRange.test.js
-->

---
### Requirement: formatHHMM output round-trips through parseDateTime

The string produced by `formatHHMM` for any given hour and minute SHALL always be parseable by `parseDateTime`'s new-format branch back into that same hour and minute.

#### Scenario: formatHHMM output round-trips through parseDateTime

- **WHEN** `formatHHMM` formats a given `Date`'s hour and minute into a string
- **THEN** parsing that same string back with `parseDateTime`'s new-format branch SHALL yield the same hour and minute

<!-- @trace
source: time-picker-24-hour-format
updated: 2026-07-16
code:
  - src/controllers/activityController.js
tests:
  - src/__tests__/activityStateMachine.test.js
  - src/__tests__/scenarioBRange.test.js
-->