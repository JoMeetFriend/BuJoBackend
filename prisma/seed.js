import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
const prisma = new PrismaClient()

async function main() {
  console.log('🌱 開始種入假資料...')

  // 測試帳號統一密碼：test1234
  const testHash = await bcrypt.hash('test1234', 10)

  // ==================
  // Users (4 個使用者)
  // ==================
  const alice = await prisma.user.create({
    data: { name: 'Alice', avatar_url: 'https://i.pravatar.cc/150?u=alice' }
  })
  const bob = await prisma.user.create({
    data: { name: 'Bob', avatar_url: 'https://i.pravatar.cc/150?u=bob' }
  })
  const carol = await prisma.user.create({
    data: { name: 'Carol', avatar_url: 'https://i.pravatar.cc/150?u=carol' }
  })
  const dave = await prisma.user.create({
    data: { name: 'Dave', avatar_url: 'https://i.pravatar.cc/150?u=dave' }
  })

  console.log('✅ Users 建立完成')

  // ==================
  // UserIdentities
  // Alice: Google + local（可用 alice@gmail.com / test1234 登入）
  // Bob: LINE 登入
  // Carol: local（可用 carol@example.com / test1234 登入）
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
      // Alice - local（密碼：test1234）
      {
        user_id: alice.id,
        provider: 'local',
        provider_user_id: 'alice@gmail.com',
        email: 'alice@gmail.com',
        password_hash: testHash,
      },
      // Bob - LINE
      {
        user_id: bob.id,
        provider: 'line',
        provider_user_id: 'line_bob_002',
        email: 'bob@line.me',
      },
      // Carol - local（密碼：test1234）
      {
        user_id: carol.id,
        provider: 'local',
        provider_user_id: 'carol@example.com',
        email: 'carol@example.com',
        password_hash: testHash,
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
      { requester_id: alice.id, receiver_id: bob.id, status: 'accepted' },
      { requester_id: carol.id, receiver_id: dave.id, status: 'pending' },
      { requester_id: dave.id, receiver_id: alice.id, status: 'rejected' },
    ]
  })

  console.log('✅ Friendships 建立完成')

  // ==================
  // Activities
  // 以 Alice 登入為主要測試視角
  // ==================
  const now = new Date()
  const future = (days, hour = 14) => {
    const d = new Date(now)
    d.setDate(d.getDate() + days)
    d.setHours(hour, 0, 0, 0)
    return d
  }

  // 1. Alice 建立，揪團中 → 可測「立即成團」「取消活動」
  await prisma.activity.create({
    data: {
      creator_id: alice.id,
      title: 'Alice 的烤肉趴',
      description: '自備食材，飲料共享！歡迎揪人來。',
      location: '大安森林公園',
      max_participants: 8,
      status: 'recruiting',
      schedule: {
        create: {
          schedule_type: 'slot',
          is_all_day: false,
          window_start: future(4),
          window_end: future(4),
          confirmed_start: future(4, 17),
          confirmed_end: future(4, 21),
        },
      },
      participants: { create: { user_id: alice.id } },
      chat: { create: { name: 'Alice 的烤肉趴' } },
    },
  })

  // 2. Alice 建立，已成團 → 測已成團狀態顯示
  await prisma.activity.create({
    data: {
      creator_id: alice.id,
      title: 'Alice 的爬山',
      description: '輕鬆路線，新手也可以！',
      location: '象山步道',
      status: 'confirmed',
      schedule: {
        create: {
          schedule_type: 'slot',
          is_all_day: false,
          window_start: future(7),
          window_end: future(7),
          confirmed_start: future(7, 8),
          confirmed_end: future(7, 12),
        },
      },
      participants: {
        create: [
          { user_id: alice.id },
          { user_id: bob.id },
        ],
      },
      chat: { create: { name: 'Alice 的爬山' } },
    },
  })

  // 3. Bob 建立，揪團中，Alice 未加入 → 可測「報名參加」
  await prisma.activity.create({
    data: {
      creator_id: bob.id,
      title: 'Bob 的桌遊之夜',
      description: '卡坦島、密室逃脫等，歡迎帶自己喜歡的遊戲！',
      location: '信義區桌遊店',
      max_participants: 6,
      status: 'recruiting',
      schedule: {
        create: {
          schedule_type: 'slot',
          is_all_day: false,
          window_start: future(5),
          window_end: future(5),
          confirmed_start: future(5, 19),
          confirmed_end: future(5, 22),
        },
      },
      participants: { create: { user_id: bob.id } },
      chat: { create: { name: 'Bob 的桌遊之夜' } },
    },
  })

  // 4. Bob 建立，揪團中，Alice 已加入 → 可測「取消報名」
  await prisma.activity.create({
    data: {
      creator_id: bob.id,
      title: 'Bob 的下午茶',
      description: '來聊聊最近在幹嘛，輕鬆聚聚。',
      location: '大安區某咖啡廳',
      max_participants: 5,
      status: 'recruiting',
      schedule: {
        create: {
          schedule_type: 'slot',
          is_all_day: false,
          window_start: future(3),
          window_end: future(3),
          confirmed_start: future(3, 15),
          confirmed_end: future(3, 17),
        },
      },
      participants: {
        create: [
          { user_id: bob.id },
          { user_id: alice.id },
        ],
      },
      chat: { create: { name: 'Bob 的下午茶' } },
    },
  })

  // 5. Bob 建立，已成團，Alice 已加入 → 測已成團 + 我有參加的狀態
  await prisma.activity.create({
    data: {
      creator_id: bob.id,
      title: 'Bob 的看電影',
      description: '約好要去看的那部！',
      location: '西門町某電影院',
      max_participants: 4,
      status: 'confirmed',
      schedule: {
        create: {
          schedule_type: 'slot',
          is_all_day: false,
          window_start: future(10),
          window_end: future(10),
          confirmed_start: future(10, 20),
          confirmed_end: future(10, 22),
        },
      },
      participants: {
        create: [
          { user_id: bob.id },
          { user_id: alice.id },
        ],
      },
      chat: { create: { name: 'Bob 的看電影' } },
    },
  })

  console.log('✅ Activities 建立完成')

  // ==================
  // Notifications
  // ==================
  await prisma.notification.createMany({
    data: [
      {
        user_id: bob.id,
        type: 'friendship',
        reference_id: alice.id,
        reference_type: 'user',
        is_read: true,
      },
      {
        user_id: dave.id,
        type: 'friendship',
        reference_id: carol.id,
        reference_type: 'user',
        is_read: false,
      },
    ]
  })

  console.log('✅ Notifications 建立完成')
  console.log('')
  console.log('🎉 假資料全部種入完成！')
  console.log('')
  console.log('測試帳號（密碼統一：test1234）：')
  console.log('  alice@gmail.com   → Alice，與 Bob 互為好友')
  console.log('  carol@example.com → Carol，與 Dave pending')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
