/*
  Warnings:

  - The primary key for the `friendships` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `notifications` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `user_identities` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `users` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[user_id,provider]` on the table `user_identities` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `friendships` DROP FOREIGN KEY `friendships_receiver_id_fkey`;

-- DropForeignKey
ALTER TABLE `friendships` DROP FOREIGN KEY `friendships_requester_id_fkey`;

-- DropForeignKey
ALTER TABLE `notifications` DROP FOREIGN KEY `notifications_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `user_identities` DROP FOREIGN KEY `user_identities_user_id_fkey`;

-- AlterTable
ALTER TABLE `friendships` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `requester_id` VARCHAR(191) NOT NULL,
    MODIFY `receiver_id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `notifications` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `user_id` VARCHAR(191) NOT NULL,
    MODIFY `reference_id` VARCHAR(191) NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `user_identities` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `user_id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `users` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- CreateIndex
CREATE UNIQUE INDEX `user_identities_user_id_provider_key` ON `user_identities`(`user_id`, `provider`);

-- AddForeignKey
ALTER TABLE `user_identities` ADD CONSTRAINT `user_identities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `friendships` ADD CONSTRAINT `friendships_requester_id_fkey` FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `friendships` ADD CONSTRAINT `friendships_receiver_id_fkey` FOREIGN KEY (`receiver_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
