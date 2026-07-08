-- CreateTable
CREATE TABLE "oauth_attempts" (
    "id" TEXT NOT NULL,
    "state_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_attempts_state_hash_key" ON "oauth_attempts"("state_hash");

-- CreateIndex
CREATE INDEX "oauth_attempts_expires_at_idx" ON "oauth_attempts"("expires_at");
