## ADDED Requirements

### Requirement: Alice has seven confirmed calendar activities in the near-term demo window

The activity seed SHALL give Alice exactly seven confirmed activities with confirmed slots from seed day plus four days through seed day plus eight days. The confirmed activity count by Taipei calendar day SHALL be two, one, one, one, and two respectively. Every newly added activity SHALL include Alice as a joined participant.

#### Scenario: Seed runs with a fixed Taipei reference date

- **WHEN** the activity seed runs with the Taipei seed date set to 2026-07-21
- **THEN** Alice has seven confirmed-slot calendar activities from 2026-07-25 through 2026-07-29
- **AND** the daily counts from July 25 through July 29 are 2, 1, 1, 1, and 2

##### Example: Confirmed calendar distribution

| Relative day | Taipei date | Confirmed start times |
| ------------ | ----------- | --------------------- |
| +4 | 2026-07-25 | 08:00, 16:00 |
| +5 | 2026-07-26 | 12:00 |
| +6 | 2026-07-27 | 19:00 |
| +7 | 2026-07-28 | 18:30 |
| +8 | 2026-07-29 | 07:30, 19:00 |

#### Scenario: Calendar response fields remain available

- **WHEN** any of the five new activities is returned by the activity list formatter
- **THEN** its confirmed slot provides non-null date_iso and confirmed_start values

### Requirement: New demo activities use realistic non-overlapping schedules and mixed creators

The seed SHALL add the following confirmed activities with a single confirmed slot: 河濱單車晨騎 created by Bob at day +4 from 08:00 to 10:00, 黃昏咖啡散步 created by Carol at day +4 from 16:00 to 18:00, 下班小聚 created by Alice at day +6 from 19:00 to 21:00, 日式料理聚餐 created by Bob at day +7 from 18:30 to 20:30, and 早餐交流會 created by Carol at day +8 from 07:30 to 09:00. These slots SHALL NOT overlap the existing seeded slots involving Alice on the same days.

#### Scenario: Five new confirmed activities are seeded

- **WHEN** seedActivities completes successfully
- **THEN** it returns five additional named activity records
- **AND** every additional record has status confirmed, includes Alice as a joined participant, and has its schedule confirmed_slot_id linked to its only candidate slot

#### Scenario: Same-day activities remain chronologically separated

- **WHEN** the confirmed activities are sorted by confirmed_start within each Taipei calendar day
- **THEN** the two day +4 activities begin at 08:00 and 16:00
- **AND** the day +8 breakfast begins at 07:30 before the existing 桌遊之夜 activity at 19:00
