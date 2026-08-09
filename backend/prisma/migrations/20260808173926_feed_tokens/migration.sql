-- CreateTable
CREATE TABLE "feed_token" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feed_token_token_key" ON "feed_token"("token");

-- CreateIndex
CREATE INDEX "feed_token_store_id_idx" ON "feed_token"("store_id");

-- AddForeignKey
ALTER TABLE "feed_token" ADD CONSTRAINT "feed_token_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_token" ADD CONSTRAINT "feed_token_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

