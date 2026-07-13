-- CreateEnum
CREATE TYPE "AvailabilityMode" AS ENUM ('slot', 'range');

-- AlterTable
ALTER TABLE "activity_schedules" ADD COLUMN     "availability_mode" "AvailabilityMode" NOT NULL DEFAULT 'slot',
ADD COLUMN     "fixed_date" TIMESTAMPTZ,
ADD COLUMN     "time_window_end" TIMESTAMPTZ,
ADD COLUMN     "time_window_start" TIMESTAMPTZ,
ADD COLUMN     "vote_deadline_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "activity_availability_ranges" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "range_start" TIMESTAMPTZ NOT NULL,
    "range_end" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_availability_ranges_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "activity_availability_ranges" ADD CONSTRAINT "activity_availability_ranges_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_availability_ranges" ADD CONSTRAINT "activity_availability_ranges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
