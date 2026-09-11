-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "storePhone" TEXT;

-- AlterTable
ALTER TABLE "partner_stores" ADD COLUMN     "phone" TEXT DEFAULT '+44 20 7946 0912';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';
