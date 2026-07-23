-- AlterTable
ALTER TABLE "activity_chats" ADD COLUMN     "last_message_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "activity_messages" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_messages_chat_id_created_at_idx" ON "activity_messages"("chat_id", "created_at");

-- AddForeignKey
ALTER TABLE "activity_messages" ADD CONSTRAINT "activity_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "activity_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_messages" ADD CONSTRAINT "activity_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
