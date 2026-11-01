import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { db } from "./db.js";
import { config } from "./config.js";

export interface PushProvider {
  send(message: ExpoPushMessage): Promise<{
    status: "ok" | "error";
    id?: string;
    details?: { error?: string };
  }>;
  receipt(
    id: string,
  ): Promise<{ status: "ok" | "error"; details?: { error?: string } } | null>;
}
export class ExpoProvider implements PushProvider {
  private expo = new Expo({
    accessToken: config.EXPO_ACCESS_TOKEN || undefined,
  });
  async send(message: ExpoPushMessage) {
    return (await this.expo.sendPushNotificationsAsync([message]))[0];
  }
  async receipt(id: string) {
    return (await this.expo.getPushNotificationReceiptsAsync([id]))[id] || null;
  }
}
const maxAttempts = 5;
const leaseMs = 120000;
export const retryDelay = (attempt: number) =>
  Math.min(3600000, 30000 * 2 ** Math.max(0, attempt - 1));
const permanent = new Set([
  "DeviceNotRegistered",
  "MessageTooBig",
  "InvalidCredentials",
  "MismatchSenderId",
]);
function errorText(code: string) {
  return (
    (
      {
        DeviceNotRegistered: "Device is no longer registered with Expo.",
        MessageTooBig: "Notification exceeds provider limits.",
        InvalidCredentials: "Check Android FCM V1 / APNs credentials in EAS.",
        MismatchSenderId: "FCM sender configuration does not match this build.",
      } as Record<string, string>
    )[code] || "Push provider request failed; no device delivery is confirmed."
  );
}
export async function expandNotificationOutbox(now = new Date()) {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string; notificationId: string; createdAt: Date }[]
    >`SELECT id,"notificationId","createdAt" FROM "NotificationOutbox" WHERE status='PENDING' ORDER BY "createdAt" LIMIT 25 FOR UPDATE SKIP LOCKED`;
    for (const row of rows) {
      const n = await tx.notification.findUniqueOrThrow({
        where: { id: row.notificationId },
        include: { user: { include: { pushPreferences: true } } },
      });
      let status = "EXPANDED";
      const prefs = n.user.pushPreferences;
      if (now.getTime() - row.createdAt.getTime() > 24 * 3600000)
        status = "EXPIRED";
      else if (
        n.user.suspended ||
        (n.type === "LOW_STOCK" && prefs?.lowStock === false) ||
        (n.type !== "LOW_STOCK" && prefs?.orderUpdates === false)
      )
        status = "SUPPRESSED";
      else {
        const order = n.orderId
          ? await tx.order.findUnique({
              where: { id: n.orderId },
              include: { shop: true },
            })
          : null;
        const authorized =
          !order ||
          (n.user.role === "CUSTOMER" && order.customerId === n.userId) ||
          (n.user.role === "MERCHANT" && order.shop.ownerId === n.userId) ||
          n.type === "ADMIN_TEST";
        const devices = authorized
          ? await tx.deviceToken.findMany({
              where: {
                userId: n.userId,
                enabled: true,
                ...(order && n.user.role === "MERCHANT"
                  ? { OR: [{ shopId: null }, { shopId: order.shopId }] }
                  : {}),
              },
            })
          : [];
        if (!devices.length) status = "NO_ACTIVE_DEVICES";
        else
          await tx.notificationDelivery.createMany({
            data: devices.map((d) => ({
              notificationId: n.id,
              deviceTokenId: d.id,
              nextAttemptAt: now,
            })),
            skipDuplicates: true,
          });
      }
      await tx.notificationOutbox.update({
        where: { id: row.id },
        data: { status, processedAt: now },
      });
    }
    return rows.length;
  });
}
async function claim(now: Date) {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "NotificationDelivery" WHERE status IN ('PENDING','RETRY','SENDING','WAITING_RECEIPT') AND "nextAttemptAt"<=${now} AND ("leaseUntil" IS NULL OR "leaseUntil"<${now}) ORDER BY "nextAttemptAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (!rows.length) return null;
    return tx.notificationDelivery.update({
      where: { id: rows[0].id },
      data: { leaseUntil: new Date(now.getTime() + leaseMs) },
      include: {
        device: true,
        notification: {
          include: { user: { include: { pushPreferences: true } } },
        },
      },
    });
  });
}
export async function processPushJob(provider: PushProvider, now = new Date()) {
  const job = await claim(now);
  if (!job) return false;
  const notification = job.notification;
  const device = job.device;
  let authorized =
    device.enabled &&
    device.userId === notification.userId &&
    !notification.user.suspended;
  const expectedProject =
    notification.user.role === "MERCHANT"
      ? config.EXPO_MERCHANT_PROJECT_ID
      : config.EXPO_CUSTOMER_PROJECT_ID;
  if (expectedProject && device.projectId !== expectedProject)
    authorized = false;
  const pref = notification.user.pushPreferences;
  if (
    notification.type === "LOW_STOCK"
      ? pref?.lowStock === false
      : pref?.orderUpdates === false
  )
    authorized = false;
  if (notification.orderId) {
    const order = await db.order.findUnique({
      where: { id: notification.orderId },
      include: { shop: true },
    });
    authorized =
      authorized &&
      !!order &&
      (notification.user.role === "CUSTOMER"
        ? order.customerId === notification.userId
        : order.shop.ownerId === notification.userId &&
          (!device.shopId || device.shopId === order.shopId));
  }
  if (!authorized) {
    await db.notificationDelivery.update({
      where: { id: job.id },
      data: { status: "SUPPRESSED", leaseUntil: null },
    });
    return true;
  }
  const receipt = job.status === "WAITING_RECEIPT" && !!job.providerTicketId;
  if (receipt && now.getTime() - job.createdAt.getTime() > 24 * 3600000) {
    await db.notificationDelivery.update({
      where: { id: job.id },
      data: {
        status: "RECEIPT_TIMEOUT",
        receiptStatus: "UNCONFIRMED",
        leaseUntil: null,
      },
    });
    return true;
  }
  const attempt = receipt ? job.attemptCount : job.attemptCount + 1;
  if (!receipt && attempt > maxAttempts) {
    await db.notificationDelivery.update({
      where: { id: job.id },
      data: { status: "FAILED", leaseUntil: null, errorCode: "RetryLimit" },
    });
    return true;
  }
  // A durable attempt is written before external I/O. Network ambiguity can cause a
  // repeated provider submission; stable event IDs deduplicate application handling.
  if (!receipt)
    await db.$transaction([
      db.notificationDelivery.update({
        where: { id: job.id },
        data: { status: "SENDING", attemptCount: attempt },
      }),
      db.notificationDeliveryAttempt.upsert({
        where: {
          deliveryId_attemptCount: {
            deliveryId: job.id,
            attemptCount: attempt,
          },
        },
        create: {
          deliveryId: job.id,
          notificationId: notification.id,
          attemptCount: attempt,
          attemptedAt: now,
        },
        update: {},
      }),
    ]);
  try {
    if (receipt) {
      const result = await provider.receipt(job.providerTicketId!);
      if (!result) {
        const expired = now.getTime() - job.createdAt.getTime() > 24 * 3600000;
        await db.notificationDelivery.update({
          where: { id: job.id },
          data: {
            status: expired ? "RECEIPT_TIMEOUT" : "WAITING_RECEIPT",
            leaseUntil: null,
            nextAttemptAt: new Date(now.getTime() + 15 * 60000),
            receiptStatus: expired ? "UNCONFIRMED" : null,
          },
        });
        return true;
      }
      const code =
        result.status === "error"
          ? result.details?.error || "ProviderError"
          : null;
      await db.$transaction(async (tx) => {
        if (code === "DeviceNotRegistered")
          await tx.deviceToken.update({
            where: { id: device.id },
            data: { enabled: false },
          });
        await tx.notificationDelivery.update({
          where: { id: job.id },
          data: {
            status: code ? "FAILED" : "PROVIDER_RECEIPT_OK",
            receiptStatus: result.status,
            errorCode: code,
            errorMessage: code ? errorText(code) : null,
            leaseUntil: null,
          },
        });
        await tx.notificationDeliveryAttempt.updateMany({
          where: { deliveryId: job.id, attemptCount: attempt },
          data: {
            providerReceiptStatus: result.status,
            errorCode: code,
            errorMessage: code ? errorText(code) : null,
          },
        });
      });
      return true;
    }
    if (attempt > maxAttempts) {
      await db.notificationDelivery.update({
        where: { id: job.id },
        data: { status: "FAILED", leaseUntil: null, errorCode: "RetryLimit" },
      });
      return true;
    }
    const sound =
      pref?.soundEnabled === false ? undefined : ("default" as const);
    const result = await provider.send({
      to: device.token,
      title: notification.title,
      body: notification.body,
      data: {
        eventId: notification.eventId || notification.id,
        notificationId: notification.id,
        orderId: notification.orderId,
        type: notification.type,
      },
      sound,
      channelId: sound ? "orders" : "orders-silent",
      priority: "high",
    });
    if (result.status === "error" || !result.id) {
      const code = result.details?.error || "ProviderError";
      throw { providerCode: code };
    }
    await db.$transaction([
      db.notificationDelivery.update({
        where: { id: job.id },
        data: {
          status: "WAITING_RECEIPT",
          providerTicketId: result.id,
          nextAttemptAt: new Date(now.getTime() + 15 * 60000),
          leaseUntil: null,
          errorCode: null,
          errorMessage: null,
        },
      }),
      db.notificationDeliveryAttempt.update({
        where: {
          deliveryId_attemptCount: {
            deliveryId: job.id,
            attemptCount: attempt,
          },
        },
        data: { providerTicketId: result.id },
      }),
    ]);
  } catch (error) {
    const code =
      (error as { providerCode?: string }).providerCode || "NETWORK_ERROR";
    const failed = permanent.has(code) || attempt >= maxAttempts;
    await db.$transaction(async (tx) => {
      if (code === "DeviceNotRegistered")
        await tx.deviceToken.update({
          where: { id: device.id },
          data: { enabled: false },
        });
      await tx.notificationDelivery.update({
        where: { id: job.id },
        data: {
          status: receipt ? "WAITING_RECEIPT" : failed ? "FAILED" : "RETRY",
          errorCode: code,
          errorMessage: errorText(code),
          nextAttemptAt: new Date(
            now.getTime() + (receipt ? 15 * 60000 : retryDelay(attempt)),
          ),
          leaseUntil: null,
        },
      });
      if (!receipt)
        await tx.notificationDeliveryAttempt.updateMany({
          where: { deliveryId: job.id, attemptCount: attempt },
          data: { errorCode: code, errorMessage: errorText(code) },
        });
    });
  }
  return true;
}
