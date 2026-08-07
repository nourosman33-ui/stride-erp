-- CreateEnum
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('earn', 'redeem', 'adjustment');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('user', 'assistant', 'system');

-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "product_variant" ADD COLUMN     "sku" TEXT;

-- AlterTable
ALTER TABLE "sales_order" ADD COLUMN     "amount_tendered" DECIMAL(12,2),
ADD COLUMN     "change_due" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "points_earned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "points_redeemed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "store" ADD COLUMN     "logo_url" TEXT,
ADD COLUMN     "loyalty_gold_threshold" DECIMAL(12,2) NOT NULL DEFAULT 15000.00,
ADD COLUMN     "loyalty_platinum_threshold" DECIMAL(12,2) NOT NULL DEFAULT 40000.00,
ADD COLUMN     "loyalty_point_value" DECIMAL(6,4) NOT NULL DEFAULT 1.00,
ADD COLUMN     "loyalty_points_per_currency" DECIMAL(6,4) NOT NULL DEFAULT 0.10,
ADD COLUMN     "loyalty_silver_threshold" DECIMAL(12,2) NOT NULL DEFAULT 5000.00,
ADD COLUMN     "receipt_footer_line1" TEXT,
ADD COLUMN     "receipt_footer_line2" TEXT,
ADD COLUMN     "return_period_days" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "tax_number" TEXT;

-- CreateTable
CREATE TABLE "loyalty_transaction" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "type" "LoyaltyTransactionType" NOT NULL,
    "points_delta" INTEGER NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "performed_by" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversation" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "store_id" TEXT,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_message" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loyalty_transaction_customer_id_idx" ON "loyalty_transaction"("customer_id");

-- CreateIndex
CREATE INDEX "loyalty_transaction_store_id_idx" ON "loyalty_transaction"("store_id");

-- CreateIndex
CREATE INDEX "ai_conversation_owner_id_idx" ON "ai_conversation"("owner_id");

-- CreateIndex
CREATE INDEX "ai_message_conversation_id_idx" ON "ai_message"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_phone_key" ON "customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "product_variant_sku_key" ON "product_variant"("sku");

-- AddForeignKey
ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "loyalty_transaction_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "loyalty_transaction_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "loyalty_transaction_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

