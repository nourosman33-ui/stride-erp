-- CreateEnum
CREATE TYPE "DailyExpenseStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'reject';

-- CreateTable
CREATE TABLE "daily_expense_category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_expense_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_expense" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_method" "PaymentMethodType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" "DailyExpenseStatus" NOT NULL DEFAULT 'pending',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_by" TEXT,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "receipt_original_name" TEXT,
    "receipt_stored_name" TEXT,
    "receipt_mime_type" TEXT,
    "receipt_size_bytes" INTEGER,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_modified_by" TEXT,
    "last_modified_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "deletion_reason" TEXT,

    CONSTRAINT "daily_expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_count" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "count_date" DATE NOT NULL,
    "opening_cash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "actual_closing_cash" DECIMAL(12,2),
    "counted_by" TEXT,
    "counted_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_count_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_expense_category_name_key" ON "daily_expense_category"("name");

-- CreateIndex
CREATE INDEX "daily_expense_store_id_occurred_at_idx" ON "daily_expense"("store_id", "occurred_at");

-- CreateIndex
CREATE INDEX "daily_expense_store_id_status_idx" ON "daily_expense"("store_id", "status");

-- CreateIndex
CREATE INDEX "daily_expense_store_id_deleted_at_idx" ON "daily_expense"("store_id", "deleted_at");

-- CreateIndex
CREATE INDEX "daily_expense_category_id_idx" ON "daily_expense"("category_id");

-- CreateIndex
CREATE INDEX "daily_expense_created_by_idx" ON "daily_expense"("created_by");

-- CreateIndex
CREATE INDEX "cash_count_store_id_count_date_idx" ON "cash_count"("store_id", "count_date");

-- CreateIndex
CREATE UNIQUE INDEX "cash_count_store_id_count_date_key" ON "cash_count"("store_id", "count_date");

-- AddForeignKey
ALTER TABLE "daily_expense" ADD CONSTRAINT "daily_expense_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_expense" ADD CONSTRAINT "daily_expense_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "daily_expense_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_expense" ADD CONSTRAINT "daily_expense_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_expense" ADD CONSTRAINT "daily_expense_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_expense" ADD CONSTRAINT "daily_expense_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_expense" ADD CONSTRAINT "daily_expense_last_modified_by_fkey" FOREIGN KEY ("last_modified_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_expense" ADD CONSTRAINT "daily_expense_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_count" ADD CONSTRAINT "cash_count_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_count" ADD CONSTRAINT "cash_count_counted_by_fkey" FOREIGN KEY ("counted_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_count" ADD CONSTRAINT "cash_count_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
