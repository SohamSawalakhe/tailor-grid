-- AlterTable
ALTER TABLE "partner_stores" ADD COLUMN     "verificationStatus" TEXT NOT NULL DEFAULT 'UNSUBMITTED',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "studio_verifications" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopFrontImage" TEXT NOT NULL,
    "interiorImage" TEXT NOT NULL,
    "machinesVideo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_stores_verificationStatus_idx" ON "partner_stores"("verificationStatus");

-- CreateIndex
CREATE INDEX "studio_verifications_storeId_idx" ON "studio_verifications"("storeId");

-- CreateIndex
CREATE INDEX "studio_verifications_status_idx" ON "studio_verifications"("status");

-- AddForeignKey
ALTER TABLE "studio_verifications" ADD CONSTRAINT "studio_verifications_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "partner_stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
