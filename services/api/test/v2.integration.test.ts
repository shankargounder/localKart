import { afterAll, beforeAll, describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { commissionFee } from "@localkart/shared";

const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "integration-only-jwt-secret-32-characters";
  process.env.PICKUP_SECRET = "integration-only-pickup-secret-32-characters";
  process.env.ENABLE_SIMULATED_PAYMENTS = "true";
}
describe("Fee snapshots", () => {
  it("rounds safely, caps at merchandise and supports waivers", () => {
    expect(commissionFee(19900, 500)).toBe(995);
    expect(commissionFee(100, 500, 200)).toBe(100);
    expect(commissionFee(19900, 500, 0, true)).toBe(0);
  });
});
describe.skipIf(!enabled)(
  "V2 persisted delivery, discovery and offline sales",
  () => {
    let app: any,
      db: any,
      createOrder: any,
      transitionOrder: any,
      pickupCode: any;
    let customer: any,
      other: any,
      merchant: any,
      admin: any,
      shop: any,
      secondShop: any,
      variant: any,
      otherVariant: any,
      address: any,
      deliveredOrder: any;
    const tag = randomBytes(6).toString("hex");
    const headers = (user: any) => ({
      Authorization:
        "Bearer " +
        jwt.sign({}, process.env.JWT_SECRET!, {
          subject: user.id,
          expiresIn: "15m",
        }),
    });
    const actor = (user: any) => ({ id: user.id, role: user.role });
    const post = (path: string, user: any, body: any) =>
      request(app)
        .post("/api/v1" + path)
        .set(headers(user))
        .send(body);
    const quote = async () => {
      const r = await post("/delivery/quotes", customer, {
        shopId: shop.id,
        addressId: address.id,
      });
      expect(r.status).toBe(201);
      return r.body;
    };
    const deliveryOrder = async () => {
      const q = await quote();
      return createOrder(customer.id, randomBytes(12).toString("hex"), {
        shopId: shop.id,
        fulfillmentType: "DELIVERY",
        paymentMethod: "COD",
        quoteId: q.id,
        items: [{ variantId: variant.id, quantity: 1000 }],
      });
    };
    const event = async (orderId: string, status: string, extra: any = {}) =>
      post("/delivery/events", admin, {
        orderId,
        status,
        eventId: randomBytes(12).toString("hex"),
        note: "Verified pilot dispatch event",
        ...extra,
      });
    beforeAll(async () => {
      ({ app } = await import("../src/app.js"));
      ({ db } = await import("../src/db.js"));
      ({ createOrder, transitionOrder, pickupCode } =
        await import("../src/orders.js"));
      const user = (role: string) =>
        db.user.create({
          data: {
            name: "V2 " + role,
            email: `v2-${role}-${tag}@example.test`,
            passwordHash: "not-used-for-token-tests",
            role,
          },
        });
      customer = await user("CUSTOMER");
      other = await db.user.create({
        data: {
          name: "Other customer",
          email: `v2-other-${tag}@example.test`,
          passwordHash: "unused",
          role: "CUSTOMER",
        },
      });
      merchant = await user("MERCHANT");
      admin = await user("ADMIN");
      const category = await db.category.create({
        data: { name: "V2 Vegetables " + tag },
      });
      shop = await db.shop.create({
        data: {
          ownerId: merchant.id,
          name: "V2 Radius Shop " + tag,
          categoryId: category.id,
          address: "Synthetic Hyderabad test address",
          latitude: 17.4753,
          longitude: 78.3915,
          approval: "APPROVED",
          deliveryEnabled: true,
          codEnabled: true,
          deliveryRadiusKm: 5,
        },
      });
      secondShop = await db.shop.create({
        data: {
          ownerId: merchant.id,
          name: "V2 Second Shop " + tag,
          categoryId: category.id,
          address: "Second synthetic address",
          latitude: 17.4754,
          longitude: 78.3915,
          approval: "APPROVED",
        },
      });
      const product = await db.product.create({
        data: {
          shopId: shop.id,
          categoryId: category.id,
          name: "Tomato " + tag,
          description: "Fresh tomato test product",
          brand: "Synthetic farm",
          keywords: "tamatar vegetable",
          unit: "KILOGRAM",
          variants: {
            create: {
              label: "Loose",
              pricePaise: 4000,
              inventory: { create: { onHand: 100000 } },
            },
          },
        },
        include: { variants: true },
      });
      variant = product.variants[0];
      const p2 = await db.product.create({
        data: {
          shopId: secondShop.id,
          categoryId: category.id,
          name: "Notebook " + tag,
          description: "Synthetic notebook",
          unit: "PIECE",
          variants: {
            create: {
              label: "A4",
              pricePaise: 6000,
              inventory: { create: { onHand: 20000 } },
            },
          },
        },
        include: { variants: true },
      });
      otherVariant = p2.variants[0];
      const saved = await post("/customers/addresses", customer, {
        label: "Home",
        recipient: "Demo Customer",
        phone: "9999999999",
        line1: "Synthetic Apartment 1",
        locality: "Hyderabad",
        postalCode: "500081",
        latitude: 17.476,
        longitude: 78.3915,
      });
      expect(saved.status).toBe(201);
      address = saved.body;
    }, 30000);
    afterAll(async () => {
      if (db) await db.$disconnect();
    });
    it("expands 1→2→5 km, normalizes synonyms and paginates the same result set", async () => {
      const r = await request(app)
        .get("/api/v1/discovery/search")
        .query({ q: "tomatoes", lat: 17.4483, lng: 78.3915 });
      expect(r.status).toBe(200);
      expect(r.body.radiusKm).toBe(5);
      expect(r.body.expanded).toBe(true);
      expect(r.body.results.some((p: any) => p.variantId === variant.id)).toBe(
        true,
      );
      expect(r.body.distanceType).toBe("STRAIGHT_LINE");
      const narrow = await request(app)
        .get("/api/v1/discovery/search")
        .query({ q: "tomatoes", lat: 17.4483, lng: 78.3915, radius: 1 });
      expect(narrow.body.total).toBe(0);
      const page = await request(app)
        .get("/api/v1/discovery/search")
        .query({ q: "tomatoes", lat: 17.4483, lng: 78.3915, offset: 100 });
      expect(page.body.results).toEqual([]);
      expect(page.body.total).toBeGreaterThan(0);
    });
    it("protects addresses and quotes, validates delivery serviceability", async () => {
      expect(
        (
          await post("/delivery/quotes", other, {
            shopId: shop.id,
            addressId: address.id,
          })
        ).status,
      ).toBe(404);
      const remote = await post("/customers/addresses", customer, {
        label: "Far",
        recipient: "Demo Customer",
        phone: "9999999999",
        line1: "Synthetic remote address",
        locality: "Hyderabad",
        postalCode: "500081",
        latitude: 18,
        longitude: 79,
      });
      expect(
        (
          await post("/delivery/quotes", customer, {
            shopId: shop.id,
            addressId: remote.body.id,
          })
        ).status,
      ).toBe(409);
      const q = await quote();
      expect(q.provider).toBe("MOCK");
      expect(q.estimate).toBeNull();
      await db.deliveryQuote.update({
        where: { id: q.id },
        data: { expiresAt: new Date(0) },
      });
      await expect(
        createOrder(customer.id, randomBytes(12).toString("hex"), {
          shopId: shop.id,
          fulfillmentType: "DELIVERY",
          paymentMethod: "COD",
          quoteId: q.id,
          items: [{ variantId: variant.id, quantity: 1000 }],
        }),
      ).rejects.toThrow("quote expired");
    });
    it("keeps separate carts and clears only the checked-out shop", async () => {
      for (const v of [variant, otherVariant])
        expect(
          (
            await post("/cart/items", customer, {
              variantId: v.id,
              quantity: 1000,
            })
          ).status,
        ).toBe(201);
      await createOrder(customer.id, randomBytes(12).toString("hex"), {
        shopId: secondShop.id,
        items: [{ variantId: otherVariant.id, quantity: 1000 }],
      });
      const cart = await request(app)
        .get("/api/v1/cart")
        .set(headers(customer));
      expect(cart.body).toHaveLength(1);
      expect(cart.body[0].variantId).toBe(variant.id);
    });
    it("completes delivery only after proof, once, while keeping stock reserved during transit", async () => {
      const before = await db.inventory.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      const order = await deliveryOrder();
      await transitionOrder(order.id, actor(merchant), "ACCEPTED");
      await transitionOrder(order.id, actor(merchant), "PREPARING");
      await transitionOrder(order.id, actor(merchant), "AWAITING_RIDER");
      expect(
        (await event(order.id, "RIDER_ASSIGNED", { riderName: "Demo Rider" }))
          .status,
      ).toBe(200);
      expect((await event(order.id, "RIDER_PICKED_UP")).status).toBe(200);
      const inTransit = await db.inventory.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(inTransit.onHand).toBe(before.onHand);
      expect(inTransit.reserved).toBe(1000);
      expect((await event(order.id, "OUT_FOR_DELIVERY")).status).toBe(200);
      expect(
        (
          await post("/merchant/orders/" + order.id + "/complete", merchant, {
            code: "123456",
            collected: true,
          })
        ).status,
      ).toBe(409);
      const row = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      const code = pickupCode(row.id, row.pickupNonce);
      const eventId = randomBytes(12).toString("hex");
      const body = {
        orderId: order.id,
        status: "DELIVERED",
        eventId,
        note: "Customer code checked at doorstep",
        code,
        collected: true,
      };
      for (let i = 0; i < 2; i++)
        expect((await post("/delivery/events", admin, body)).status).toBe(200);
      const done = await db.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { delivery: true, payment: true },
      });
      deliveredOrder = done;
      expect(done.status).toBe("COMPLETED");
      expect(done.delivery.status).toBe("DELIVERED");
      expect(done.payment.status).toBe("COLLECTED_COD");
      const stock = await db.inventory.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(stock.onHand).toBe(before.onHand - 1000);
      expect(stock.reserved).toBe(0);
      expect(
        await db.inventoryMovement.count({
          where: { orderId: order.id, reason: "SALE" },
        }),
      ).toBe(1);
    });
    it("holds failed-delivery stock until an audited return; damaged returns become wastage", async () => {
      const before = await db.inventory.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      const order = await deliveryOrder();
      for (const state of ["ACCEPTED", "PREPARING", "AWAITING_RIDER"])
        await transitionOrder(order.id, actor(merchant), state);
      for (const state of [
        "RIDER_ASSIGNED",
        "RIDER_PICKED_UP",
        "DELIVERY_FAILED",
      ])
        expect((await event(order.id, state)).status).toBe(200);
      expect(
        (await post("/orders/" + order.id + "/cancel", customer, {})).status,
      ).toBe(409);
      expect((await event(order.id, "CANCELLED")).status).toBe(409);
      expect(
        (
          await db.inventory.findUniqueOrThrow({
            where: { variantId: variant.id },
          })
        ).reserved,
      ).toBe(1000);
      const returnedEvent = {
        orderId: order.id,
        eventId: randomBytes(12).toString("hex"),
        status: "CANCELLED",
        note: "Physical return inspected and discarded",
        returned: true,
        discardReturned: true,
      };
      for (let attempt = 0; attempt < 2; attempt++)
        expect(
          (await post("/delivery/events", admin, returnedEvent)).status,
        ).toBe(200);
      const stock = await db.inventory.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(stock.onHand).toBe(before.onHand - 1000);
      expect(stock.reserved).toBe(0);
      expect(
        await db.inventoryMovement.count({
          where: { orderId: order.id, reason: "RETURN_WASTAGE" },
        }),
      ).toBe(1);
    });
    it("records fractional offline sales idempotently and cannot consume reserved stock", async () => {
      const order = await createOrder(
        customer.id,
        randomBytes(12).toString("hex"),
        {
          shopId: secondShop.id,
          items: [{ variantId: otherVariant.id, quantity: 19000 }],
        },
      );
      await transitionOrder(order.id, actor(merchant), "ACCEPTED");
      const bad = await request(app)
        .post("/api/v1/merchant/offline-sales")
        .set(headers(merchant))
        .set("Idempotency-Key", randomBytes(12).toString("hex"))
        .send({
          shopId: secondShop.id,
          paymentMethod: "CASH",
          items: [{ variantId: otherVariant.id, quantity: 2000 }],
        });
      expect(bad.status).toBe(409);
      const key = randomBytes(12).toString("hex");
      const before = await db.inventory.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      let saleId = "";
      for (let i = 0; i < 2; i++) {
        const r = await request(app)
          .post("/api/v1/merchant/offline-sales")
          .set(headers(merchant))
          .set("Idempotency-Key", key)
          .send({
            shopId: shop.id,
            paymentMethod: "UPI",
            items: [{ variantId: variant.id, quantity: 500 }],
          });
        expect(r.status).toBe(201);
        expect(r.body.totalPaise).toBe(2000);
        if (saleId) expect(r.body.id).toBe(saleId);
        saleId = r.body.id;
      }
      expect(
        (
          await db.inventory.findUniqueOrThrow({
            where: { variantId: variant.id },
          })
        ).onHand,
      ).toBe(before.onHand - 500);
      await transitionOrder(order.id, actor(merchant), "CANCELLED");
    });
    it("locks pickup after five failed codes and releases stock on merchant cancellation", async () => {
      const order = await createOrder(
        customer.id,
        randomBytes(12).toString("hex"),
        { shopId: shop.id, items: [{ variantId: variant.id, quantity: 1000 }] },
      );
      for (const state of ["ACCEPTED", "PREPARING", "READY_FOR_PICKUP"])
        await transitionOrder(order.id, actor(merchant), state);
      const row = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      const correct = pickupCode(row.id, row.pickupNonce);
      const wrong = correct === "000000" ? "000001" : "000000";
      for (let attempt = 0; attempt < 5; attempt++)
        await expect(
          transitionOrder(order.id, actor(merchant), "COMPLETED", {
            code: wrong,
            collected: true,
          }),
        ).rejects.toThrow("Invalid pickup code");
      await expect(
        transitionOrder(order.id, actor(merchant), "COMPLETED", {
          code: correct,
          collected: true,
        }),
      ).rejects.toThrow("locked after five attempts");
      await transitionOrder(order.id, actor(merchant), "CANCELLED");
      expect(
        (
          await db.inventory.findUniqueOrThrow({
            where: { variantId: variant.id },
          })
        ).reserved,
      ).toBe(0);
    });
    it("snapshots commissions, protects financial fields and separates GMV from revenue", async () => {
      expect(
        (
          await post("/admin/commissions", admin, {
            shopId: shop.id,
            basisPoints: 500,
          })
        ).status,
      ).toBe(201);
      const order = await createOrder(
        customer.id,
        randomBytes(12).toString("hex"),
        { shopId: shop.id, items: [{ variantId: variant.id, quantity: 1000 }] },
      );
      expect(order.platformFeePaise).toBe(200);
      expect(order.merchantPayablePaise).toBe(3800);
      await expect(
        db.order.update({ where: { id: order.id }, data: { totalPaise: 1 } }),
      ).rejects.toThrow();
      const report = await request(app)
        .get("/api/v1/admin/analytics")
        .set(headers(admin));
      expect(report.status).toBe(200);
      expect(report.body).toHaveProperty("gmvPaise");
      expect(report.body).toHaveProperty("netPlatformRevenuePaise");
      expect(
        (await post("/admin/commissions", customer, { basisPoints: 1000 }))
          .status,
      ).toBe(403);
    });
    it("persists lists, favorites, support, and gates reviews behind completed purchases", async () => {
      expect(
        (
          await post("/customers/shopping-lists", customer, {
            name: "Weekly vegetables",
            items: [{ name: "Tomato", quantity: "500 g" }],
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await request(app)
            .put("/api/v1/customers/favorites/" + shop.id)
            .set(headers(customer))
        ).status,
      ).toBe(200);
      const ticket = await post("/support/tickets", customer, {
        subject: "Demo support request",
        body: "Please check the packing instructions.",
      });
      expect(ticket.status).toBe(201);
      expect(
        (await request(app).get("/api/v1/support/tickets").set(headers(other)))
          .body,
      ).toEqual([]);
      const product = await db.variant.findUniqueOrThrow({
        where: { id: variant.id },
      });
      const pending = await createOrder(
        customer.id,
        randomBytes(12).toString("hex"),
        { shopId: shop.id, items: [{ variantId: variant.id, quantity: 1000 }] },
      );
      expect(
        (
          await post("/customers/reviews", customer, {
            productId: product.productId,
            orderId: pending.id,
            rating: 5,
            body: "Test review",
          })
        ).status,
      ).toBe(403);
    });
    it("requires verified purchases for reviews and records manual refunds without claiming an automatic payment", async () => {
      const product = await db.variant.findUniqueOrThrow({
        where: { id: variant.id },
      });
      expect(
        (
          await post("/customers/reviews", customer, {
            productId: product.productId,
            orderId: deliveredOrder.id,
            rating: 4,
            body: "Verified synthetic delivery review",
          })
        ).status,
      ).toBe(201);
      const body = {
        orderId: deliveredOrder.id,
        amountPaise: deliveredOrder.totalPaise,
        reason: "Synthetic full refund test",
      };
      const attempts = await Promise.all([
        post("/customers/refunds", customer, body),
        post("/customers/refunds", customer, body),
      ]);
      expect(attempts.filter((r) => r.status === 201)).toHaveLength(1);
      expect(attempts.filter((r) => r.status === 409)).toHaveLength(1);
      const refund = attempts.find((r) => r.status === 201)!.body;
      expect(
        (
          await request(app)
            .patch("/api/v1/admin/refunds/" + refund.id)
            .set(headers(admin))
            .send({
              action: "CONFIRM_MANUAL_REFUND",
              resolution: "Reference not yet paid",
            })
        ).status,
      ).toBe(409);
      const approved = await request(app)
        .patch("/api/v1/admin/refunds/" + refund.id)
        .set(headers(admin))
        .send({
          action: "APPROVE",
          resolution: "Pilot refund approved for manual reimbursement",
        });
      expect(approved.body.status).toBe("MANUAL_REQUIRED");
      const confirmed = await request(app)
        .patch("/api/v1/admin/refunds/" + refund.id)
        .set(headers(admin))
        .send({
          action: "CONFIRM_MANUAL_REFUND",
          resolution: "Synthetic reimbursement confirmed: TEST-REF-001",
        });
      expect(confirmed.body.status).toBe("REFUNDED");
      expect(
        (await db.order.findUniqueOrThrow({ where: { id: deliveredOrder.id } }))
          .status,
      ).toBe("COMPLETED");
    });
  },
);
