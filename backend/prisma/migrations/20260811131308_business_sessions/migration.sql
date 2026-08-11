-- CreateEnum
CREATE TYPE "BusinessSessionStatus" AS ENUM ('active', 'closed');

-- AlterTable
ALTER TABLE "daily_expense" ADD COLUMN     "session_id" TEXT;

-- AlterTable
ALTER TABLE "sales_order" ADD COLUMN     "session_id" TEXT;

-- AlterTable
ALTER TABLE "sales_return" ADD COLUMN     "session_id" TEXT;

-- AlterTable
ALTER TABLE "store" ADD COLUMN     "session_seq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "business_session" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "session_number" INTEGER NOT NULL,
    "status" "BusinessSessionStatus" NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_by" TEXT NOT NULL,
    "ended_at" TIMESTAMP(3),
    "ended_by" TEXT,
    "opening_cash" DECIMAL(12,2),
    "closing_cash" DECIMAL(12,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_session_store_id_status_idx" ON "business_session"("store_id", "status");

-- CreateIndex
CREATE INDEX "business_session_store_id_started_at_idx" ON "business_session"("store_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "business_session_store_id_session_number_key" ON "business_session"("store_id", "session_number");

-- CreateIndex
CREATE INDEX "daily_expense_session_id_idx" ON "daily_expense"("session_id");

-- CreateIndex
CREATE INDEX "sales_order_session_id_idx" ON "sales_order"("session_id");

-- CreateIndex
CREATE INDEX "sales_return_session_id_idx" ON "sales_return"("session_id");

-- AddForeignKey
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "business_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "business_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_expense" ADD CONSTRAINT "daily_expense_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "business_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_session" ADD CONSTRAINT "business_session_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_session" ADD CONSTRAINT "business_session_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_session" ADD CONSTRAINT "business_session_ended_by_fkey" FOREIGN KEY ("ended_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
