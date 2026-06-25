import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
 
async function main() {
  console.log('🌱 開始種入假資料...')
 
  // ==================
  // Users (4 個使用者)
  // ==================
  const alice = await prisma.user.create({
    data: { display_name: 'Alice', avatar_url: 'https://i.pravatar.cc/150?u=alice' }
  })
  const bob = await prisma.user.create({
    data: { display_name: 'Bob', avatar_url: 'https://i.pravatar.cc/150?u=bob' }
  })
  const carol = await prisma.user.create({
    data: { display_name: 'Carol', avatar_url: 'https://i.pravatar.cc/150?u=carol' }
  })
  const dave = await prisma.user.create({
    data: { display_name: 'Dave', avatar_url: 'https://i.pravatar.cc/150?u=dave' }
  })
 
  console.log('✅ Users 建立完成')
 
  // ==================
  // UserIdentities
  // Alice: Google 登入 + 一般註冊（同一個 user，兩筆 identity）
  // Bob: LINE 登入
  // Carol: 一般註冊
  // Dave: Google 登入
  // ==================
  await prisma.userIdentity.createMany({
    data: [
      // Alice - Google
      {
        user_id: alice.id,
        provider: 'google',
        provider_user_id: 'google_alice_001',
        email: 'alice@gmail.com',
      },
      // Alice - 一般註冊（同一個人）
      {
        user_id: alice.id,
        provider: 'local',
        email: 'alice@gmail.com',
        password_hash: '$2b$10$fakehashalice',
      },
      // Bob - LINE
      {
        user_id: bob.id,
        provider: 'line',
        provider_user_id: 'line_bob_002',
        email: 'bob@line.me',
      },
      // Carol - 一般註冊
      {
        user_id: carol.id,
        provider: 'local',
        email: 'carol@example.com',
        password_hash: '$2b$10$fakehashacarol',
      },
      // Dave - Google
      {
        user_id: dave.id,
        provider: 'google',
        provider_user_id: 'google_dave_004',
        email: 'dave@gmail.com',
      },
    ]
  })
 
  console.log('✅ UserIdentities 建立完成')
 
  // ==================
  // Friendships
  // Alice & Bob: 已成為好友
  // Carol -> Dave: 邀請中（pending）
  // Dave -> Alice: 被拒絕
  // ==================
  await prisma.friendship.createMany({
    data: [
      {
        requester_id: alice.id,
        receiver_id: bob.id,
        status: 'accepted',
      },
      {
        requester_id: carol.id,
        receiver_id: dave.id,
        status: 'pending',
      },
      {
        requester_id: dave.id,
        receiver_id: alice.id,
        status: 'rejected',
      },
    ]
  })
 
  console.log('✅ Friendships 建立完成')
 
  // ==================
  // Notifications
  // ==================
  await prisma.notification.createMany({
    data: [
      // Bob 收到好友邀請通知（已讀）
      {
        user_id: bob.id,
        type: 'friendship',
        reference_id: alice.id,
        reference_type: 'user',
        is_read: true,
      },
      // Dave 收到好友邀請通知（未讀）
      {
        user_id: dave.id,
        type: 'friendship',
        reference_id: carol.id,
        reference_type: 'user',
        is_read: false,
      },
      // Alice 收到活動通知（未讀）
      {
        user_id: alice.id,
        type: 'activity',
        reference_id: null,
        reference_type: 'activity',
        is_read: false,
      },
      // Carol 收到行事曆通知（已讀）
      {
        user_id: carol.id,
        type: 'calendar',
        reference_id: null,
        reference_type: 'calendar',
        is_read: true,
      },
    ]
  })
 
  console.log('✅ Notifications 建立完成')
  console.log('🎉 假資料全部種入完成！')
}
 
main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
 