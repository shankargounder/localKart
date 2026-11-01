-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "alt" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "credit" TEXT,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "license" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MERCHANT',
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "width" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "estimatedReadyAt" TIMESTAMP(3),
ADD COLUMN     "etaUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "preparationDurationMinutes" INTEGER,
ADD COLUMN     "preparationStartedAt" TIMESTAMP(3),
ADD COLUMN     "readyAt" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "imageAlt" TEXT,
ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'LEGACY';

-- AlterTable
ALTER TABLE "DeviceToken" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isTestDevice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "platform" TEXT NOT NULL DEFAULT 'android',
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "shopId" UUID,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" UUID NOT NULL,
    "orderUpdates" BOOLEAN NOT NULL DEFAULT true,
    "lowStock" BOOLEAN NOT NULL DEFAULT true,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "deviceTokenId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "providerTicketId" TEXT,
    "receiptStatus" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDeliveryAttempt" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "attemptCount" INTEGER NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerTicketId" TEXT,
    "providerReceiptStatus" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "NotificationDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealtimeEvent" (
    "id" BIGSERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "orderId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "requestHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealtimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_notificationId_key" ON "NotificationOutbox"("notificationId");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_createdAt_idx" ON "NotificationOutbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_idx" ON "NotificationDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_deviceTokenId_key" ON "NotificationDelivery"("notificationId", "deviceTokenId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDeliveryAttempt_deliveryId_attemptCount_key" ON "NotificationDeliveryAttempt"("deliveryId", "attemptCount");

-- CreateIndex
CREATE UNIQUE INDEX "RealtimeEvent_eventId_key" ON "RealtimeEvent"("eventId");

-- CreateIndex
CREATE INDEX "RealtimeEvent_orderId_id_idx" ON "RealtimeEvent"("orderId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_productId_contentHash_key" ON "ProductImage"("productId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_eventId_key" ON "Notification"("eventId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_userId_deviceId_key" ON "DeviceToken"("userId", "deviceId");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_deviceTokenId_fkey" FOREIGN KEY ("deviceTokenId") REFERENCES "DeviceToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDeliveryAttempt" ADD CONSTRAINT "NotificationDeliveryAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "NotificationDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDeliveryAttempt" ADD CONSTRAINT "NotificationDeliveryAttempt_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve existing device registrations and read-state without inventing ETAs.
UPDATE "DeviceToken" SET "deviceId"=id::text WHERE "deviceId" IS NULL;
ALTER TABLE "DeviceToken" ALTER COLUMN "deviceId" SET NOT NULL;
UPDATE "Notification" SET "readAt"="createdAt" WHERE read=true AND "readAt" IS NULL;
INSERT INTO "NotificationPreference" ("userId","orderUpdates","lowStock","soundEnabled","updatedAt") SELECT id,coalesce(("notificationPreferences"->>'orderUpdates')::boolean,true),coalesce(("notificationPreferences"->>'lowStock')::boolean,true),true,CURRENT_TIMESTAMP FROM "User" ON CONFLICT DO NOTHING;
ALTER TABLE "Order" ADD CONSTRAINT "valid_preparation_minutes" CHECK ("preparationDurationMinutes" IS NULL OR "preparationDurationMinutes" BETWEEN 1 AND 240);
CREATE INDEX "notification_outbox_pending" ON "NotificationOutbox" ("createdAt") WHERE status='PENDING';
