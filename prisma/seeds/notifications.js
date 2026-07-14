/**
 * 建立 Demo 通知資料。
 */
export async function seedNotifications(
  prisma,
  { users, friendships, activities },
) {
  const now = Date.now();
  const minutesAgo = (minutes) => new Date(now - minutes * 60_000);

  const historicalActivityCreated = [
    activities.fixedRecruiting,
    activities.rangeVoting,
    activities.dateVoting,
    activities.dateTimeVoting,
  ].flatMap((activity, index) =>
    [users.bob, users.carol].map((recipient, recipientIndex) => ({
      user_id: recipient.id,
      type: "activity_created",
      reference_id: activity.id,
      reference_type: "activity",
      is_read: true,
      created_at: minutesAgo(2 * 24 * 60 + index * 10 + recipientIndex),
    })),
  );

  const resultActivityCreated = [
    { activity: activities.fixedConfirmed, recipient: users.alice },
    { activity: activities.dateConfirmed, recipient: users.alice },
  ].map(({ activity, recipient }, index) => ({
    user_id: recipient.id,
    type: "activity_created",
    reference_id: activity.id,
    reference_type: "activity",
    is_read: true,
    created_at: minutesAgo(36 * 60 + index * 10),
  }));

  const confirmedNotifications = [
    { activity: activities.fixedConfirmed, recipients: [users.alice] },
    { activity: activities.dateConfirmed, recipients: [users.alice, users.bob] },
    {
      activity: activities.dateTimeConfirmed,
      recipients: [users.bob, users.carol],
    },
  ].flatMap(({ activity, recipients }, activityIndex) =>
    recipients.map((recipient, recipientIndex) => ({
      user_id: recipient.id,
      type: "activity_confirmed",
      reference_id: activity.id,
      reference_type: "activity",
      is_read: false,
      created_at: minutesAgo(14 - activityIndex * 2 - recipientIndex),
    })),
  );

  return prisma.notification.createMany({
    data: [
      {
        user_id: users.bob.id,
        type: "friend_request_created",
        reference_id: friendships.aliceBob.id,
        reference_type: "friendship",
        is_read: true,
        created_at: minutesAgo(4 * 24 * 60),
      },
      {
        user_id: users.alice.id,
        type: "friend_request_accepted",
        reference_id: friendships.aliceBob.id,
        reference_type: "friendship",
        is_read: true,
        created_at: minutesAgo(3 * 24 * 60),
      },
      {
        user_id: users.alice.id,
        type: "friend_request_created",
        reference_id: friendships.carolAlice.id,
        reference_type: "friendship",
        is_read: true,
        created_at: minutesAgo(24 * 60),
      },
      {
        user_id: users.carol.id,
        type: "friend_request_accepted",
        reference_id: friendships.carolAlice.id,
        reference_type: "friendship",
        is_read: true,
        created_at: minutesAgo(12 * 60),
      },
      {
        user_id: users.alice.id,
        type: "friend_request_created",
        reference_id: friendships.daveToAlice.id,
        reference_type: "friendship",
        is_read: false,
        created_at: minutesAgo(3),
      },
      {
        user_id: users.eve.id,
        type: "friend_request_created",
        reference_id: friendships.aliceToEve.id,
        reference_type: "friendship",
        is_read: false,
        created_at: minutesAgo(30),
      },
      ...historicalActivityCreated,
      ...resultActivityCreated,
      {
        user_id: users.alice.id,
        type: "formation_ready",
        reference_id: activities.rangeVoting.id,
        reference_type: "activity",
        is_read: false,
        created_at: minutesAgo(20),
      },
      {
        user_id: users.alice.id,
        type: "time_to_pick",
        reference_id: activities.dateVoting.id,
        reference_type: "activity",
        is_read: false,
        created_at: minutesAgo(18),
      },
      {
        user_id: users.alice.id,
        type: "time_to_pick",
        reference_id: activities.dateTimeVoting.id,
        reference_type: "activity",
        is_read: false,
        created_at: minutesAgo(16),
      },
      ...confirmedNotifications,
      {
        user_id: users.alice.id,
        type: "activity_cancelled",
        reference_id: activities.cancelledActivity.id,
        reference_type: "activity",
        is_read: false,
        created_at: minutesAgo(8),
      },
    ],
  });
}
