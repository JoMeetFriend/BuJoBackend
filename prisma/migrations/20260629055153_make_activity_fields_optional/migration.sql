-- AlterTable
ALTER TABLE "activities" ALTER COLUMN "description" DROP NOT NULL,
ALTER COLUMN "location" DROP NOT NULL,
ALTER COLUMN "max_participants" DROP NOT NULL;
