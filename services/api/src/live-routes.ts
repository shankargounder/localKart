import { normalizeBarcode } from "@localkart/shared";
import { lookupFoodBarcode } from "./barcodes.js";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { Expo } from "expo-server-sdk";
import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { config } from "./config.js";
import {
  ApiError,
  transaction,
  presentOrder,
  orderInclude,
  hash,
} from "./orders.js";
import { queueNotification, queueOrderEvent } from "./notifications.js";
export const liveRouter = Router();
const uuid = (value: unknown) => z.string().uuid().parse(value);
const admin = (req: Request, _res: Response, next: NextFunction) =>
  next(
    req.user.role === "ADMIN" ? undefined : new ApiError(403, "Access denied"),
  );
const deviceSchema = z.object({
  deviceId: z.string().uuid(),
  token: z
    .string()
    .max(250)
    .refine(Expo.isExpoPushToken, "A valid Expo push token is required"),
  platform: z.enum(["android", "ios"]),
  projectId: z.string().uuid(),
  shopId: z.string().uuid().optional(),
  isTestDevice: z.boolean().default(false),
});
async function register(req: Request, res: Response) {
  const body = deviceSchema.parse(req.body);
  const expected =
    req.user.role === "MERCHANT"
      ? config.EXPO_MERCHANT_PROJECT_ID
      : config.EXPO_CUSTOMER_PROJECT_ID;
  if (expected && expected !== body.projectId)
    throw new ApiError(400, "Push project does not match this application");
  if (
    body.shopId &&
    (req.user.role !== "MERCHANT" ||
      !(await db.shop.findFirst({
        where: { id: body.shopId, ownerId: req.user.id },
      })))
  )
    throw new ApiError(403, "Shop device association denied");
  const device = await transaction(async (tx) => {
    const current = await tx.deviceToken.findUnique({
      where: {
        userId_deviceId: { userId: req.user.id, deviceId: body.deviceId },
      },
    });
    const tokenOwner = await tx.deviceToken.findUnique({
      where: { token: body.token },
    });
    const data = {
      ...body,
      userId: req.user.id,
      shopId: body.shopId || null,
      enabled: true,
    };
    if (tokenOwner && tokenOwner.id !== current?.id) {
      if (!current)
        return tx.deviceToken.update({ where: { id: tokenOwner.id }, data });
      await tx.deviceToken.update({
        where: { id: tokenOwner.id },
        data: { enabled: false, token: "revoked:" + tokenOwner.id },
      });
    }
    return tx.deviceToken.upsert({
      where: {
        userId_deviceId: { userId: req.user.id, deviceId: body.deviceId },
      },
      create: data,
      update: data,
    });
  });
  res.json({
    id: device.id,
    deviceId: device.deviceId,
    enabled: device.enabled,
  });
}
liveRouter.post("/devices/push-token", register);
liveRouter.delete("/devices/push-token", async (req, res) => {
  const { deviceId } = z
    .object({ deviceId: z.string().uuid() })
    .parse(req.body);
  await db.deviceToken.updateMany({
    where: { userId: req.user.id, deviceId },
    data: { enabled: false },
  });
  res.sendStatus(204);
});
liveRouter.get("/notifications/unread-count", async (req, res) => {
  const [unread, incomingOrders] = await Promise.all([
    db.notification.count({ where: { userId: req.user.id, read: false } }),
    db.notification.count({
      where: { userId: req.user.id, read: false, type: "order.created" },
    }),
  ]);
  res.json({ unread, incomingOrders });
});
liveRouter.patch("/notifications/read-all", async (req, res) => {
  await db.notification.updateMany({
    where: { userId: req.user.id, read: false },
    data: { read: true, readAt: new Date() },
  });
  res.sendStatus(204);
});
liveRouter.patch("/notifications/:id/read", async (req, res) => {
  const changed = await db.notification.updateMany({
    where: { id: uuid(req.params.id), userId: req.user.id },
    data: { read: true, readAt: new Date() },
  });
  if (!changed.count) throw new ApiError(404, "Notification not found");
  res.sendStatus(204);
});
liveRouter.get("/notifications/preferences", async (req, res) =>
  res.json(
    (await db.notificationPreference.findUnique({
      where: { userId: req.user.id },
    })) || { orderUpdates: true, lowStock: true, soundEnabled: true },
  ),
);
liveRouter.patch("/notifications/preferences", async (req, res) => {
  const body = z
    .object({
      orderUpdates: z.boolean(),
      lowStock: z.boolean(),
      soundEnabled: z.boolean(),
    })
    .parse(req.body);
  res.json(
    await db.notificationPreference.upsert({
      where: { userId: req.user.id },
      create: { ...body, userId: req.user.id },
      update: body,
    }),
  );
});
liveRouter.get("/orders/:id/timeline", async (req, res) => {
  const order = await db.order.findUnique({
    where: { id: uuid(req.params.id) },
    include: orderInclude,
  });
  if (
    !order ||
    (req.user.role !== "ADMIN" &&
      order.customerId !== req.user.id &&
      order.shop.ownerId !== req.user.id)
  )
    throw new ApiError(404, "Order not found");
  res.json({
    orderId: order.id,
    version: order.version,
    serverTime: new Date().toISOString(),
    timeline: order.history,
  });
});
liveRouter.patch("/orders/:id/notifications/read", async (req, res) => {
  const order = await db.order.findUnique({
    where: { id: uuid(req.params.id) },
    include: { shop: true },
  });
  if (
    !order ||
    (order.customerId !== req.user.id && order.shop.ownerId !== req.user.id)
  )
    throw new ApiError(404, "Order not found");
  await db.notification.updateMany({
    where: { orderId: order.id, userId: req.user.id, read: false },
    data: { read: true, readAt: new Date() },
  });
  res.sendStatus(204);
});
liveRouter.patch(
  "/merchant/orders/:id/estimated-ready-time",
  async (req, res) => {
    const body = z
      .object({ minutes: z.number().int().min(1).max(240) })
      .parse(req.body);
    const key = z
      .string()
      .min(8)
      .max(100)
      .parse(req.headers["idempotency-key"]);
    const order = await transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${uuid(req.params.id)}::uuid FOR UPDATE`;
      const current = await tx.order.findUnique({
        where: { id: uuid(req.params.id) },
        include: orderInclude,
      });
      if (
        !current ||
        req.user.role !== "MERCHANT" ||
        current.shop.ownerId !== req.user.id
      )
        throw new ApiError(403, "Access denied");
      const eventId = `eta:${current.id}:${key}`;
      const prior = await tx.realtimeEvent.findUnique({ where: { eventId } });
      if (prior) {
        if (prior.requestHash !== hash(JSON.stringify(body)))
          throw new ApiError(
            409,
            "Estimate key reused with a different duration",
          );
        return current;
      }
      if (!["ACCEPTED", "PREPARING"].includes(current.status))
        throw new ApiError(
          409,
          "Only accepted/preparing orders can change preparation estimate",
        );
      const now = new Date();
      const updated = await tx.order.update({
        where: { id: current.id },
        data: {
          estimatedReadyAt: new Date(now.getTime() + body.minutes * 60000),
          etaUpdatedAt: now,
          version: { increment: 1 },
        },
        include: orderInclude,
      });

      await queueOrderEvent(
        tx,
        updated,
        current.fulfillmentType === "PICKUP"
          ? "order.pickup_eta_updated"
          : "order.preparation_eta_updated",
        { eventId, requestHash: hash(JSON.stringify(body)) },
      );
      await tx.orderHistory.create({
        data: {
          orderId: current.id,
          status: current.status,
          reason: "Merchant updated confirmed preparation estimate",
        },
      });
      return updated;
    });
    res.json(presentOrder(order, false));
  },
);
liveRouter.get("/admin/notifications", admin, async (req, res) => {
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .parse(req.query.limit);
  res.json(
    await db.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        eventId: true,
        orderId: true,
        type: true,
        title: true,
        createdAt: true,
        user: { select: { role: true } },
        outbox: { select: { status: true } },
        deliveries: {
          select: {
            id: true,
            status: true,
            attemptCount: true,
            providerTicketId: true,
            receiptStatus: true,
            errorCode: true,
            errorMessage: true,
            nextAttemptAt: true,
            attempts: {
              select: {
                attemptCount: true,
                attemptedAt: true,
                providerTicketId: true,
                providerReceiptStatus: true,
                errorCode: true,
                errorMessage: true,
              },
            },
          },
        },
      },
    }),
  );
});
liveRouter.get("/admin/notification-test-devices", admin, async (_req, res) =>
  res.json(
    await db.deviceToken.findMany({
      where: { enabled: true, isTestDevice: true },
      select: {
        id: true,
        deviceId: true,
        platform: true,
        user: { select: { role: true, name: true } },
      },
      take: 50,
    }),
  ),
);
liveRouter.post(
  "/admin/notifications/test",
  admin,
  rateLimit({ windowMs: 60000, limit: 5 }),
  async (req, res) => {
    const { deviceId } = z
      .object({ deviceId: z.string().uuid() })
      .parse(req.body);
    const device = await db.deviceToken.findFirst({
      where: { id: deviceId, enabled: true, isTestDevice: true },
    });
    if (!device)
      throw new ApiError(404, "An opted-in registered test device is required");
    const eventId = "admin-test:" + randomUUID();
    const notification = await transaction(async (tx) => {
      const n = await queueNotification(tx, {
        eventId,
        userId: device.userId,
        type: "ADMIN_TEST",
        title: "LocalKart notification test",
        body: "This is an authorized test notification for your registered test device.",
      });
      await tx.notificationDelivery.create({
        data: { notificationId: n.id, deviceTokenId: device.id },
      });
      await tx.notificationOutbox.update({
        where: { notificationId: n.id },
        data: { status: "EXPANDED", processedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "TEST_REGISTERED_DEVICE_NOTIFICATION",
          targetId: device.id,
        },
      });
      return n;
    });
    res.status(202).json({
      id: notification.id,
      eventId,
      pushEnabled: config.ENABLE_EXPO_PUSH === "true",
      status: "QUEUED_NOT_CONFIRMED_DELIVERED",
    });
  },
);

liveRouter.get(
  "/merchant/shops/:id/barcodes/:barcode",
  rateLimit({ windowMs: 60000, limit: 20 }),
  async (req, res) => {
    const shopId = uuid(req.params.id);
    if (
      req.user.role !== "MERCHANT" ||
      !(await db.shop.findFirst({
        where: { id: shopId, ownerId: req.user.id },
      }))
    )
      throw new ApiError(403, "Shop access denied");
    let barcode: string;
    try {
      barcode = normalizeBarcode(z.string().max(30).parse(req.params.barcode));
    } catch {
      throw new ApiError(
        400,
        "Scan a valid EAN/UPC retail barcode or enter it manually.",
      );
    }
    const local = await db.product.findFirst({
      where: { shopId, specifications: { path: ["barcode"], equals: barcode } },
      select: {
        id: true,
        name: true,
        brand: true,
        description: true,
        active: true,
      },
    });
    if (local) {
      res.json({
        barcode,
        found: true,
        existing: true,
        product: local,
        source: "YOUR_SHOP",
      });
      return;
    }
    if (config.BARCODE_CATALOG_PROVIDER !== "openfoodfacts") {
      res.json({
        barcode,
        found: false,
        reason: "NO_PROVIDER",
        message:
          "No saved product details found. Enter the product name, price and stock below.",
      });
      return;
    }
    try {
      const product = await lookupFoodBarcode(barcode);
      res.json({
        barcode,
        found: !!product,
        existing: false,
        product,
        message: product
          ? "Review the suggested details. Enter your own selling price and stock."
          : "No match found. Add the product details manually; this food catalog does not cover all retail products.",
      });
    } catch {
      throw new ApiError(
        503,
        "Barcode catalog is unavailable. You can still enter the product manually.",
      );
    }
  },
);
