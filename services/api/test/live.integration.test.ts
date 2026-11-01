import { beforeAll, afterAll, it, expect, describe } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { io, type Socket } from "socket.io-client";
import sharp from "sharp";
import { pickupCountdown, clockOffset } from "@localkart/shared";
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "integration-only-jwt-secret-32-characters";
  process.env.PICKUP_SECRET = "integration-only-pickup-secret-32-characters";
}
it("derives countdown from persisted absolute timestamps after restart, clock correction and expiry", () => {
  const order = {
    status: "ACCEPTED",
    fulfillmentType: "PICKUP",
    estimatedReadyAt: "2026-10-31T10:20:00Z",
  };
  const start = Date.parse("2026-10-31T10:00:00Z");
  expect(pickupCountdown(order, start).seconds).toBe(1200);
  expect(
    pickupCountdown(JSON.parse(JSON.stringify(order)), start + 7 * 60000)
      .seconds,
  ).toBe(780);
  expect(
    clockOffset(new Date(start).toISOString(), start - 5010, start - 4990),
  ).toBe(5000);
  expect(pickupCountdown(order, start + 21 * 60000)).toMatchObject({
    seconds: 0,
    label: expect.stringContaining("longer"),
  });
  expect(order.status).toBe("ACCEPTED");
  expect(
    pickupCountdown({ ...order, status: "READY_FOR_PICKUP" }, start).seconds,
  ).toBeNull();
  expect(
    pickupCountdown({ ...order, fulfillmentType: "DELIVERY" }, start).seconds,
  ).toBeNull();
  expect(
    pickupCountdown({ ...order, status: "PENDING_ACCEPTANCE" }, start).label,
  ).toContain("Waiting");
});
describe.skipIf(!enabled)("durable live order notifications", () => {
  let app: any,
    db: any,
    createOrder: any,
    transitionOrder: any,
    queueNotification: any,
    expand: any,
    work: any;
  let customer: any,
    other: any,
    merchant: any,
    admin: any,
    shop: any,
    variant: any,
    product: any,
    order: any;
  const tag = randomUUID();
  const devices: string[] = [];
  const token = (u: any) =>
    jwt.sign({}, process.env.JWT_SECRET!, { subject: u.id, expiresIn: "15m" });
  const auth = (u: any) => ({ Authorization: "Bearer " + token(u) });
  const actor = (u: any) => ({ id: u.id, role: u.role });
  const post = (path: string, u: any, body: any) =>
    request(app)
      .post("/api/v1" + path)
      .set(auth(u))
      .send(body);
  const patch = (path: string, u: any, body: any, key = "estimate-key-0001") =>
    request(app)
      .patch("/api/v1" + path)
      .set(auth(u))
      .set("Idempotency-Key", key)
      .send(body);
  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ db } = await import("../src/db.js"));
    ({ createOrder, transitionOrder } = await import("../src/orders.js"));
    ({ queueNotification } = await import("../src/notifications.js"));
    ({ expandNotificationOutbox: expand, processPushJob: work } =
      await import("../src/push-worker.js"));
    const user = (role: string) =>
      db.user.create({
        data: {
          name: "Live " + role,
          email: `live-${role}-${tag}@example.test`,
          passwordHash: "unused",
          role,
        },
      });
    customer = await user("CUSTOMER");
    merchant = await user("MERCHANT");
    admin = await user("ADMIN");
    other = await db.user.create({
      data: {
        name: "Other",
        email: `other-${tag}@example.test`,
        passwordHash: "unused",
        role: "CUSTOMER",
      },
    });
    const category = await db.category.create({
      data: { name: "Live " + tag },
    });
    shop = await db.shop.create({
      data: {
        ownerId: merchant.id,
        categoryId: category.id,
        name: "Live shop",
        address: "Synthetic address",
        latitude: 17.44,
        longitude: 78.39,
        approval: "APPROVED",
      },
    });
    product = await db.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        name: "Synthetic live product",
        description: "Synthetic test product",
        unit: "PIECE",
        variants: {
          create: {
            label: "One",
            pricePaise: 5000,
            inventory: { create: { onHand: 10000 } },
          },
        },
      },
      include: { variants: true },
    });
    variant = product.variants[0];
  }, 30000);
  afterAll(async () => {
    if (db) await db.$disconnect();
  });
  it("registers two scoped devices, rotates tokens and denies unauthorized shop association", async () => {
    for (let i = 0; i < 2; i++) {
      const deviceId = randomUUID();
      devices.push(deviceId);
      const r = await post("/devices/push-token", merchant, {
        deviceId,
        token: `ExponentPushToken[live-${tag}-${i}]`,
        projectId: randomUUID(),
        platform: "android",
        shopId: shop.id,
        isTestDevice: true,
      });
      expect(r.status).toBe(200);
    }
    const r = await post("/devices/push-token", merchant, {
      deviceId: devices[0],
      token: `ExponentPushToken[rotated-${tag}]`,
      projectId: randomUUID(),
      platform: "android",
      shopId: shop.id,
      isTestDevice: true,
    });
    expect(r.status).toBe(200);
    expect(
      await db.deviceToken.count({
        where: { userId: merchant.id, enabled: true },
      }),
    ).toBe(2);
    expect(
      (
        await post("/devices/push-token", other, {
          deviceId: randomUUID(),
          token: `ExponentPushToken[bad-${tag}]`,
          projectId: randomUUID(),
          platform: "android",
          shopId: shop.id,
        })
      ).status,
    ).toBe(403);
  });
  it("creates one committed event under duplicate checkout, pushes both authorized devices and persists a 20 minute estimate", async () => {
    const input = {
      shopId: shop.id,
      fulfillmentType: "PICKUP",
      paymentMethod: "PICKUP",
      items: [{ variantId: variant.id, quantity: 1000 }],
    };
    order = await createOrder(customer.id, tag, input);
    expect((await createOrder(customer.id, tag, input)).id).toBe(order.id);
    expect(await db.realtimeEvent.count({ where: { orderId: order.id } })).toBe(
      1,
    );
    expect(
      await db.notification.count({
        where: { orderId: order.id, type: "order.created" },
      }),
    ).toBe(1);
    for (let i = 0; i < 10; i++) {
      if (!(await expand())) break;
    }
    const notice = await db.notification.findFirstOrThrow({
      where: { orderId: order.id, type: "order.created" },
    });
    expect(
      await db.notificationDelivery.count({
        where: { notificationId: notice.id },
      }),
    ).toBe(2);
    const result = await post(`/merchant/orders/${order.id}/accept`, merchant, {
      preparationDurationMinutes: 20,
    });
    expect(result.status).toBe(200);
    order = result.body;
    expect(
      Date.parse(order.estimatedReadyAt) - Date.parse(order.acceptedAt),
    ).toBe(20 * 60000);
    expect(order.preparationDurationMinutes).toBe(20);
    expect(
      (await db.inventory.findUnique({ where: { variantId: variant.id } }))
        .reserved,
    ).toBe(1000);
    expect(
      (
        await post(`/merchant/orders/${order.id}/accept`, merchant, {
          preparationDurationMinutes: 20,
        })
      ).status,
    ).toBe(200);
    expect(await db.reservation.count({ where: { orderId: order.id } })).toBe(
      1,
    );
    expect(
      (
        await post(`/merchant/orders/${order.id}/accept`, merchant, {
          preparationDurationMinutes: 30,
        })
      ).status,
    ).toBe(409);
  });
  it("uses idempotent authorized ETA changes, protects read state and stops at ready", async () => {
    const path = `/merchant/orders/${order.id}/estimated-ready-time`;
    expect((await patch(path, other, { minutes: 15 })).status).toBe(403);
    const r = await patch(path, merchant, { minutes: 15 });
    expect(r.status).toBe(200);
    const again = await patch(path, merchant, { minutes: 15 });
    expect(again.body.version).toBe(r.body.version);
    expect((await patch(path, merchant, { minutes: 30 })).status).toBe(409);
    expect(
      (await patch(path, merchant, { minutes: 0 }, "different-key-0001"))
        .status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .get(`/api/v1/orders/${order.id}/timeline`)
          .set(auth(other))
      ).status,
    ).toBe(404);
    const notification = await db.notification.findFirstOrThrow({
      where: { orderId: order.id, userId: customer.id },
    });
    expect(
      (await patch(`/notifications/${notification.id}/read`, other, {})).status,
    ).toBe(404);
    expect(
      (await patch(`/notifications/${notification.id}/read`, customer, {}))
        .status,
    ).toBe(204);
    await transitionOrder(order.id, actor(merchant), "PREPARING");
    const ready = await transitionOrder(
      order.id,
      actor(merchant),
      "READY_FOR_PICKUP",
    );
    expect(ready.readyAt).toBeTruthy();
    expect(
      pickupCountdown(
        { ...ready, estimatedReadyAt: ready.estimatedReadyAt.toISOString() },
        Date.now(),
      ).seconds,
    ).toBeNull();
    expect(
      await db.notification.count({
        where: { orderId: order.id, type: "order.ready" },
      }),
    ).toBe(1);
  });
  it("publishes to two authenticated merchant clients and the customer while denying a different customer", async () => {
    const { attachRealtime } = await import("../src/realtime.js");
    const server = createServer(app);
    const live = attachRealtime(server);
    const sockets: Socket[] = [];
    try {
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const port = (server.address() as any).port;
      const connect = async (u: any) => {
        const s = io(`http://127.0.0.1:${port}`, {
          auth: { token: token(u) },
          transports: ["websocket"],
          reconnection: false,
        });
        sockets.push(s);
        await new Promise<void>((resolve, reject) => {
          s.once("connect", resolve);
          s.once("connect_error", reject);
        });
        return s;
      };
      const [a, b, c, d] = await Promise.all([
        connect(merchant),
        connect(merchant),
        connect(customer),
        connect(other),
      ]);
      const ack = await new Promise<any>((resolve) =>
        d.emit("subscribe.order", order.id, resolve),
      );
      expect(ack.ok).toBe(false);
      const events = [a, b, c, d].map(() => [] as any[]);
      [a, b, c, d].forEach((s, i) =>
        s.on("order.event", (event) => events[i].push(event)),
      );
      await live.publish();
      await new Promise((resolve) => setTimeout(resolve, 120));
      for (let i = 0; i < 3; i++)
        expect(events[i].some((e) => e.orderId === order.id)).toBe(true);
      expect(events[3].some((e) => e.orderId === order.id)).toBe(false);
    } finally {
      for (const socket of sockets) socket.disconnect();
      await live.close();
      if (server.listening)
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("records retry attempts, provider receipts and invalid tokens without changing stock or payments", async () => {
    const before = await db.inventory.findUnique({
      where: { variantId: variant.id },
    });
    const payBefore = await db.payment.findUnique({
      where: { orderId: order.id },
    });
    // These synthetic jobs are earlier than all other queues; the worker still executes its real durable claim path.
    const time = new Date("2000-01-01T00:00:00Z");
    const device = await db.deviceToken.findFirstOrThrow({
      where: { userId: merchant.id, enabled: true },
    });
    const makeJob = async () => {
      const n = await db.$transaction((tx: any) =>
        queueNotification(tx, {
          eventId: randomUUID(),
          userId: merchant.id,
          type: "ADMIN_TEST",
          title: "Test only",
          body: "Synthetic provider test",
        }),
      );
      await db.notificationOutbox.update({
        where: { notificationId: n.id },
        data: { status: "EXPANDED" },
      });
      return db.notificationDelivery.create({
        data: {
          notificationId: n.id,
          deviceTokenId: device.id,
          nextAttemptAt: time,
        },
      });
    };
    const job = await makeJob();
    let sends = 0;
    const fake = {
      send: async () => {
        sends++;
        if (sends === 1) throw new Error("offline");
        return { status: "ok" as const, id: "synthetic-ticket" };
      },
      receipt: async () => ({ status: "ok" as const }),
    };
    expect(await work(fake, time)).toBe(true);
    expect(
      (await db.notificationDelivery.findUnique({ where: { id: job.id } }))
        .status,
    ).toBe("RETRY");
    expect(await work(fake, new Date(time.getTime() + 10000))).toBe(false);
    await work(fake, new Date(time.getTime() + 30001));
    expect(
      (await db.notificationDelivery.findUnique({ where: { id: job.id } }))
        .status,
    ).toBe("WAITING_RECEIPT");
    await work(fake, new Date(time.getTime() + 16 * 60000));
    expect(
      (await db.notificationDelivery.findUnique({ where: { id: job.id } }))
        .status,
    ).toBe("PROVIDER_RECEIPT_OK");
    expect(
      await db.notificationDeliveryAttempt.count({
        where: { deliveryId: job.id },
      }),
    ).toBe(2);
    const bad = await makeJob();
    await work(
      {
        send: async () => ({
          status: "error",
          details: { error: "DeviceNotRegistered" },
        }),
        receipt: async () => null,
      },
      time,
    );
    expect(
      (await db.notificationDelivery.findUnique({ where: { id: bad.id } }))
        .status,
    ).toBe("FAILED");
    expect(
      (await db.deviceToken.findUnique({ where: { id: device.id } })).enabled,
    ).toBe(false);
    expect(
      await db.inventory.findUnique({ where: { variantId: variant.id } }),
    ).toEqual(before);
    expect(
      await db.payment.findUnique({ where: { orderId: order.id } }),
    ).toEqual(payBefore);
    const monitor = await request(app)
      .get("/api/v1/admin/notifications")
      .set(auth(admin));
    expect(monitor.status).toBe(200);
    expect(JSON.stringify(monitor.body)).not.toContain("ExponentPushToken");
  });
  it("disables devices at logout and suppresses opted-out notification dispatch", async () => {
    for (const deviceId of devices)
      await request(app)
        .delete("/api/v1/devices/push-token")
        .set(auth(merchant))
        .send({ deviceId })
        .expect(204);
    expect(
      await db.deviceToken.count({
        where: { userId: merchant.id, enabled: true },
      }),
    ).toBe(0);
    await patch("/notifications/preferences", merchant, {
      orderUpdates: false,
      lowStock: false,
      soundEnabled: false,
    });
    const n = await db.$transaction((tx: any) =>
      queueNotification(tx, {
        eventId: randomUUID(),
        userId: merchant.id,
        type: "order.created",
        title: "Opt out",
        body: "Test",
      }),
    );
    for (let i = 0; i < 10; i++) {
      if (!(await expand())) break;
    }
    expect(
      (
        await db.notificationOutbox.findUnique({
          where: { notificationId: n.id },
        })
      ).status,
    ).toBe("SUPPRESSED");
    expect(
      (
        await post("/admin/notifications/test", customer, {
          deviceId: randomUUID(),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post("/admin/notifications/test", admin, {
          deviceId: randomUUID(),
        })
      ).status,
    ).toBe(404);
  });
  it("validates photograph content, ownership, upload deduplication and preserves existing images", async () => {
    const bytes = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#ffc400" },
    })
      .png()
      .toBuffer();
    const path = `/api/v1/merchant/products/${product.id}/images`;
    expect(
      (
        await request(app)
          .post(path)
          .set(auth(other))
          .field("rightsConfirmed", "true")
          .attach("image", bytes, {
            filename: "test.png",
            contentType: "image/png",
          })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(path)
          .set(auth(merchant))
          .field("rightsConfirmed", "true")
          .attach("image", Buffer.from("not a png"), {
            filename: "test.png",
            contentType: "image/png",
          })
      ).status,
    ).toBe(400);
    const upload = () =>
      request(app)
        .post(path)
        .set(auth(merchant))
        .field("rightsConfirmed", "true")
        .attach("image", bytes, {
          filename: "test.png",
          contentType: "image/png",
        });
    const first = await upload();
    expect(first.status).toBe(201);
    expect(first.body.isDemo).toBe(false);
    const duplicate = await upload();
    expect(duplicate.body.id).toBe(first.body.id);
    expect(
      await db.productImage.count({ where: { productId: product.id } }),
    ).toBe(1);
    const { normalizeProductImage } = await import("../src/images.js");
    await expect(normalizeProductImage(bytes, "image/jpeg")).rejects.toThrow();
  });
  it("does not publish or reserve stock when acceptance rolls back", async () => {
    const pending = await createOrder(customer.id, randomUUID(), {
      shopId: shop.id,
      fulfillmentType: "PICKUP",
      paymentMethod: "PICKUP",
      items: [{ variantId: variant.id, quantity: 1000 }],
    });
    const stock = await db.inventory.findUnique({
      where: { variantId: variant.id },
    });
    await db.inventory.update({
      where: { variantId: variant.id },
      data: { onHand: stock.reserved },
    });
    try {
      await expect(
        transitionOrder(pending.id, actor(merchant), "ACCEPTED", {
          preparationDurationMinutes: 20,
        }),
      ).rejects.toThrow();
      expect(
        (await db.order.findUnique({ where: { id: pending.id } })).status,
      ).toBe("PENDING_ACCEPTANCE");
      expect(
        await db.realtimeEvent.count({
          where: { orderId: pending.id, type: "order.accepted" },
        }),
      ).toBe(0);
      expect(
        await db.notification.count({
          where: { orderId: pending.id, type: "order.accepted" },
        }),
      ).toBe(0);
      expect(
        await db.reservation.count({ where: { orderId: pending.id } }),
      ).toBe(0);
    } finally {
      await db.inventory.update({
        where: { variantId: variant.id },
        data: { onHand: stock.onHand },
      });
    }
  });
  it("seeds only empty demo products and preserves a merchant-uploaded photograph", async () => {
    await db.user.update({
      where: { id: merchant.id },
      data: { email: tag + "@demo.localkart.test" },
    });
    await db.product.update({
      where: { id: product.id },
      data: { name: "Wireless mouse" },
    });
    const prior = await db.productImage.findMany({
      where: { productId: product.id },
    });
    const demo = await db.product.create({
      data: {
        shopId: shop.id,
        categoryId: product.categoryId,
        name: "USB-C cable",
        description: "Synthetic demo",
        unit: "PIECE",
      },
    });
    const { seedDemoImages } =
      await import("../../../database/seeds/images.js");
    expect(await seedDemoImages(db)).toBe(1);
    expect(await seedDemoImages(db)).toBe(0);
    expect(
      await db.productImage.findMany({ where: { productId: product.id } }),
    ).toEqual(prior);
    expect(
      (
        await db.productImage.findFirstOrThrow({
          where: { productId: demo.id },
        })
      ).isDemo,
    ).toBe(true);
  });
  it("creates a reviewed barcode product, restricts lookup ownership and blocks duplicates across UPC aliases", async () => {
    const body = {
      name: "Scanned synthetic product",
      categoryId: product.categoryId,
      unit: "PIECE",
      pricePaise: 2500,
      stockMilli: 1000,
      barcode: "036000291452",
    };
    const path = "/merchant/shops/" + shop.id + "/products";
    const created = await post(path, merchant, body);
    expect(created.status).toBe(201);
    expect(created.body.specifications.barcode).toBe("00036000291452");
    const lookup =
      "/api/v1/merchant/shops/" + shop.id + "/barcodes/0036000291452";
    const found = await request(app).get(lookup).set(auth(merchant));
    expect(found.status).toBe(200);
    expect(found.body.existing).toBe(true);
    expect(found.body.product.id).toBe(created.body.id);
    expect((await request(app).get(lookup).set(auth(other))).status).toBe(403);
    expect(
      (await post(path, merchant, { ...body, barcode: "0036000291452" }))
        .status,
    ).toBe(409);
    const unknown = await request(app)
      .get("/api/v1/merchant/shops/" + shop.id + "/barcodes/4006381333931")
      .set(auth(merchant));
    expect(unknown.status).toBe(200);
    expect(unknown.body.found).toBe(false);
    expect(
      (
        await request(app)
          .get("/api/v1/merchant/shops/" + shop.id + "/barcodes/4006381333932")
          .set(auth(merchant))
      ).status,
    ).toBe(400);
  });
});
