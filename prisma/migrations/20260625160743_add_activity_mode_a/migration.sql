-- AlterTable
ALTER TABLE "activities" ALTER COLUMN "description" DROP NOT NULL,
ALTER COLUMN "location" DROP NOT NULL,
ALTER COLUMN "max_participants" DROP NOT NULL;

-- AlterTable
ALTER TABLE "activity_schedules" ADD COLUMN     "is_all_day" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "deadline_at" DROP NOT NULL;
