-- AlterTable
ALTER TABLE "activity_availabilities" ADD COLUMN     "range_end" TIMESTAMPTZ,
ADD COLUMN     "range_start" TIMESTAMPTZ;
