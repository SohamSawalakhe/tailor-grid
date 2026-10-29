-- AlterTable
ALTER TABLE "partner_stores" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "partner_stores_status_idx" ON "partner_stores"("status");
