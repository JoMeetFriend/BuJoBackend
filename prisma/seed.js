import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log(' 開始種入假資料...')

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
    ],
  })

  console.log(' Friendships 建立完成')

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
    ],
  })

  console.log(' Notifications 建立完成')
  console.log(' 假資料全部種入完成！')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
