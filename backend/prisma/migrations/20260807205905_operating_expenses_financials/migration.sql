-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('rent', 'utilities', 'salaries', 'marketing', 'logistics', 'maintenance', 'software', 'other');

-- CreateEnum
CREATE TYPE "ExpenseFrequency" AS ENUM ('one_time', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly');

-- AlterTable
ALTER TABLE "store" ADD COLUMN     "financial_start_date" DATE,
ADD COLUMN     "initial_investment" DECIMAL(14,2) NOT NULL DEFAULT 0.00;

-- CreateTable
CREATE TABLE "operating_expense" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "frequency" "ExpenseFrequency" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operating_expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operating_expense_store_id_is_active_idx" ON "operating_expense"("store_id", "is_active");

-- CreateIndex
CREATE INDEX "operating_expense_start_date_idx" ON "operating_expense"("start_date");

-- AddForeignKey
ALTER TABLE "operating_expense" ADD CONSTRAINT "operating_expense_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_expense" ADD CONSTRAINT "operating_expense_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

