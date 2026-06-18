-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('draft', 'recruiting', 'voting', 'tiebreaking', 'confirmed', 'cancelled');

-- CreateEnum
CREATE TYPE "ActivityParticipantStatus" AS ENUM ('joined', 'left', 'removed');

-- CreateEnum
CREATE TYPE "ActivityInvitationStatus" AS ENUM ('pending', 'accepted', 'declined');

-- CreateEnum
CREATE TYPE "ActivityScheduleType" AS ENUM ('slot', 'range');

-- CreateEnum
CREATE TYPE "NotificationJobStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_identities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_user_id" TEXT,
    "email" TEXT,
    "password_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendships" (
    "id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "max_participants" INTEGER NOT NULL,
    "cover_image_url" TEXT,
    "status" "ActivityStatus" NOT NULL DEFAULT 'draft',
    "pre_notify_hours" INTEGER NOT NULL DEFAULT 24,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_chats" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_votes" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "slot_start" TIMESTAMP(3) NOT NULL,
    "slot_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_participants" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "ActivityParticipantStatus" NOT NULL DEFAULT 'joined',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_invitations" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "inviter_id" TEXT NOT NULL,
    "invitee_id" TEXT NOT NULL,
    "invite_token" TEXT,
    "status" "ActivityInvitationStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_availabilities" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "slot_start" TIMESTAMP(3) NOT NULL,
    "slot_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_schedules" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "schedule_type" "ActivityScheduleType" NOT NULL,
    "window_start" DATE NOT NULL,
    "window_end" DATE NOT NULL,
    "slot_duration_min" INTEGER DEFAULT 60,
    "deadline_at" TIMESTAMP(3) NOT NULL,
    "vote_deadline_at" TIMESTAMP(3),
    "confirmed_start" TIMESTAMP(3),
    "confirmed_end" TIMESTAMP(3),

    CONSTRAINT "activity_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" "NotificationJobStatus" NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "in_app" BOOLEAN NOT NULL DEFAULT true,
    "line" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_user_id_provider_key" ON "user_identities"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_provider_provider_user_id_key" ON "user_identities"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "friendships_requester_id_receiver_id_key" ON "friendships"("requester_id", "receiver_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_chats_activity_id_key" ON "activity_chats"("activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_votes_activity_id_user_id_key" ON "activity_votes"("activity_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_participants_activity_id_user_id_key" ON "activity_participants"("activity_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_invitations_invite_token_key" ON "activity_invitations"("invite_token");

-- CreateIndex
CREATE UNIQUE INDEX "activity_availabilities_activity_id_user_id_slot_start_key" ON "activity_availabilities"("activity_id", "user_id", "slot_start");

-- CreateIndex
CREATE UNIQUE INDEX "activity_schedules_activity_id_key" ON "activity_schedules"("activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_type_key" ON "notification_preferences"("user_id", "type");

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_chats" ADD CONSTRAINT "activity_chats_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_votes" ADD CONSTRAINT "activity_votes_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_votes" ADD CONSTRAINT "activity_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_invitations" ADD CONSTRAINT "activity_invitations_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_invitations" ADD CONSTRAINT "activity_invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_invitations" ADD CONSTRAINT "activity_invitations_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_availabilities" ADD CONSTRAINT "activity_availabilities_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_availabilities" ADD CONSTRAINT "activity_availabilities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_schedules" ADD CONSTRAINT "activity_schedules_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
