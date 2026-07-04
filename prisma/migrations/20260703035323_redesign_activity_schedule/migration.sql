-- DropForeignKey
ALTER TABLE "activity_availabilities" DROP CONSTRAINT "activity_availabilities_activity_id_fkey";

-- DropForeignKey
ALTER TABLE "activity_votes" DROP CONSTRAINT "activity_votes_activity_id_fkey";

-- DropForeignKey
ALTER TABLE "activity_votes" DROP CONSTRAINT "activity_votes_user_id_fkey";

-- DropIndex
DROP INDEX "activity_availabilities_activity_id_user_id_slot_start_key";

-- AlterTable
ALTER TABLE "activities" DROP COLUMN "max_participants",
ADD COLUMN     "category" TEXT,
ADD COLUMN     "participant_target" INTEGER,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "activity_availabilities" DROP COLUMN "activity_id",
DROP COLUMN "slot_end",
DROP COLUMN "slot_start",
ADD COLUMN     "candidate_slot_id" TEXT NOT NULL,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "activity_chats" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "activity_invitations" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "activity_participants" ALTER COLUMN "joined_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "activity_schedules" DROP COLUMN "confirmed_end",
DROP COLUMN "confirmed_start",
DROP COLUMN "schedule_type",
DROP COLUMN "slot_duration_min",
DROP COLUMN "time_window_end",
DROP COLUMN "time_window_start",
DROP COLUMN "vote_deadline_at",
DROP COLUMN "window_end",
DROP COLUMN "window_start",
ADD COLUMN     "confirmed_slot_id" TEXT,
ADD COLUMN     "requires_voting" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "deadline_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "friendships" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "notification_jobs" ALTER COLUMN "scheduled_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "sent_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "notification_preferences" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "oauth_attempts" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "consumed_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "user_identities" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ;

-- DropTable
DROP TABLE "activity_votes";

-- DropEnum
DROP TYPE "ActivityScheduleType";

-- CreateTable
CREATE TABLE "activity_candidate_slots" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "slot_start" TIMESTAMPTZ NOT NULL,
    "slot_end" TIMESTAMPTZ NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_candidate_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_tiebreak_votes" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "candidate_slot_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_tiebreak_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activity_tiebreak_votes_activity_id_user_id_key" ON "activity_tiebreak_votes"("activity_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_availabilities_candidate_slot_id_user_id_key" ON "activity_availabilities"("candidate_slot_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_schedules_confirmed_slot_id_key" ON "activity_schedules"("confirmed_slot_id");

-- AddForeignKey
ALTER TABLE "activity_schedules" ADD CONSTRAINT "activity_schedules_confirmed_slot_id_fkey" FOREIGN KEY ("confirmed_slot_id") REFERENCES "activity_candidate_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_candidate_slots" ADD CONSTRAINT "activity_candidate_slots_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_availabilities" ADD CONSTRAINT "activity_availabilities_candidate_slot_id_fkey" FOREIGN KEY ("candidate_slot_id") REFERENCES "activity_candidate_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_tiebreak_votes" ADD CONSTRAINT "activity_tiebreak_votes_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_tiebreak_votes" ADD CONSTRAINT "activity_tiebreak_votes_candidate_slot_id_fkey" FOREIGN KEY ("candidate_slot_id") REFERENCES "activity_candidate_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_tiebreak_votes" ADD CONSTRAINT "activity_tiebreak_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

