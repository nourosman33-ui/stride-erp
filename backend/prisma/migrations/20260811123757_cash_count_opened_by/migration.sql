-- AlterTable
ALTER TABLE "cash_count" ADD COLUMN     "opened_at" TIMESTAMP(3),
ADD COLUMN     "opened_by" TEXT;

-- AddForeignKey
ALTER TABLE "cash_count" ADD CONSTRAINT "cash_count_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
