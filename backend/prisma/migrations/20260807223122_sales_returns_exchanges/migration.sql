-- CreateEnum
CREATE TYPE "ReturnType" AS ENUM ('refund', 'exchange');

-- AlterTable
ALTER TABLE "store" ADD COLUMN     "return_seq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "sales_return" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "return_number" TEXT NOT NULL,
    "original_order_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "processed_by" TEXT NOT NULL,
    "return_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "ReturnType" NOT NULL,
    "reason" TEXT,
    "refund_subtotal" DECIMAL(12,2) NOT NULL,
    "refund_tax_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refund_total" DECIMAL(12,2) NOT NULL,
    "exchange_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance_due" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refund_method" "PaymentMethodType",
    "points_adjusted" INTEGER NOT NULL DEFAULT 0,
    "exchange_order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_return_line" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "order_line_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "refund_amount" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "restock" BOOLEAN NOT NULL DEFAULT true,
    "condition" TEXT,

    CONSTRAINT "sales_return_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_return_return_number_key" ON "sales_return"("return_number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_return_exchange_order_id_key" ON "sales_return"("exchange_order_id");

-- CreateIndex
CREATE INDEX "sales_return_store_id_return_date_idx" ON "sales_return"("store_id", "return_date");

-- CreateIndex
CREATE INDEX "sales_return_original_order_id_idx" ON "sales_return"("original_order_id");

-- CreateIndex
CREATE INDEX "sales_return_line_return_id_idx" ON "sales_return_line"("return_id");

-- CreateIndex
CREATE INDEX "sales_return_line_order_line_id_idx" ON "sales_return_line"("order_line_id");

-- AddForeignKey
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_original_order_id_fkey" FOREIGN KEY ("original_order_id") REFERENCES "sales_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_exchange_order_id_fkey" FOREIGN KEY ("exchange_order_id") REFERENCES "sales_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_line" ADD CONSTRAINT "sales_return_line_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "sales_return"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_line" ADD CONSTRAINT "sales_return_line_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "sales_order_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_line" ADD CONSTRAINT "sales_return_line_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

