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
    data: { display_name: 'Alice', avatar_url: 'https://i.pravatar.cc/150?u=alice' },
  })
  const bob = await prisma.user.create({
    data: { display_name: 'Bob', avatar_url: 'https://i.pravatar.cc/150?u=bob' },
  })
  const carol = await prisma.user.create({
    data: { display_name: 'Carol', avatar_url: 'https://i.pravatar.cc/150?u=carol' },
  })
  const dave = await prisma.user.create({
    data: { display_name: 'Dave', avatar_url: 'https://i.pravatar.cc/150?u=dave' },
  })

  console.log(' Users 建立完成')
  console.log(`   Alice ID: ${alice.id}  後五碼: ${alice.id.slice(-5)}`)
  console.log(`   Bob   ID: ${bob.id}  後五碼: ${bob.id.slice(-5)}`)
  console.log(`   Carol ID: ${carol.id}  後五碼: ${carol.id.slice(-5)}`)
  console.log(`   Dave  ID: ${dave.id}  後五碼: ${dave.id.slice(-5)}`)

  // ==================
  // UserIdentities
  // 密碼統一為 password123
  // ==================
  const passwordHash = await bcrypt.hash('password123', 10)

  await prisma.userIdentity.createMany({
    data: [
      // Alice - Google + 一般登入（同帳號）
      {
        user_id: alice.id,
        provider: 'google',
        provider_user_id: 'google_alice_001',
        email: 'alice@gmail.com',
      },
      {
        user_id: alice.id,
        provider: 'local',
        provider_user_id: 'alice@gmail.com',
        email: 'alice@gmail.com',
        password_hash: passwordHash,
      },
      // Bob - LINE
      {
        user_id: bob.id,
        provider: 'line',
        provider_user_id: 'line_bob_002',
        email: 'bob@line.me',
      },
      // Carol - 一般登入  email: carol@example.com / password123
      {
        user_id: carol.id,
        provider: 'local',
        provider_user_id: 'carol@example.com',
        email: 'carol@example.com',
        password_hash: passwordHash,
      },
      // Dave - Google
      {
        user_id: dave.id,
        provider: 'google',
        provider_user_id: 'google_dave_004',
        email: 'dave@gmail.com',
      },
    ],
  })

  console.log(' UserIdentities 建立完成')
  console.log('   可登入帳號：alice@gmail.com / carol@example.com  密碼：password123')

  // ==================
  // Friendships
  // Alice & Bob: 已成為好友
  // Carol -> Dave: 邀請中（pending）
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
  // deadline_at 設為 confirmed_start 前一天同時間（預設規則）
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

          window_start: future(4),
          window_end: future(4),
          confirmed_start: future(4, 17),
          confirmed_end: future(4, 21),
          deadline_at: future(3, 17),
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
      max_participants: 10,
      status: 'confirmed',
      schedule: {
        create: {
          schedule_type: 'slot',

          window_start: future(7),
          window_end: future(7),
          confirmed_start: future(7, 8),
          confirmed_end: future(7, 12),
          deadline_at: future(6, 8),
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

          window_start: future(5),
          window_end: future(5),
          confirmed_start: future(5, 19),
          confirmed_end: future(5, 22),
          deadline_at: future(4, 19),
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

          window_start: future(3),
          window_end: future(3),
          confirmed_start: future(3, 15),
          confirmed_end: future(3, 17),
          deadline_at: future(2, 15),
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

          window_start: future(10),
          window_end: future(10),
          confirmed_start: future(10, 20),
          confirmed_end: future(10, 22),
          deadline_at: future(9, 20),
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
