import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
// Explicit opt-in: these tests require a disposable PostgreSQL database.
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "integration-only-jwt-secret-32-characters";
  process.env.PICKUP_SECRET = "integration-only-pickup-secret-32-characters";
  process.env.ENABLE_SIMULATED_PAYMENTS = "true";
}
describe.skipIf(!enabled)("Persisted customer → merchant → pickup", () => {
  let app: any,
    db: any,
    createOrder: any,
    transitionOrder: any,
    pickupCode: any;
  let customer: any,
    merchant: any,
    admin: any,
    shop: any,
    variant: any,
    other: any;
  const tag = randomBytes(6).toString("hex");
  const password = "IntegrationPassword123!";
  const bearer = (u: any) => ({ Authorization: "Bearer " + u.accessToken });
  it("protects application tables from direct Supabase client access", async () => {
    const tables =
      await db.$queryRawUnsafe(`SELECT relname, relrowsecurity FROM pg_class
      WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname <> '_prisma_migrations'`);
    expect(tables.length).toBeGreaterThan(30);
    expect(tables.every((table: any) => table.relrowsecurity)).toBe(true);
    const grants =
      await db.$queryRawUnsafe(`SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name <> '_prisma_migrations'
      AND grantee IN ('anon','authenticated','PUBLIC')`);
    expect(grants).toHaveLength(0);
    // Even an accidental SELECT grant cannot expose rows to a non-owner client role.
    await db.$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe("CREATE ROLE localkart_rls_probe NOLOGIN");
      await tx.$executeRawUnsafe(
        "GRANT USAGE ON SCHEMA public TO localkart_rls_probe",
      );
      await tx.$executeRawUnsafe(
        'GRANT SELECT ON "User" TO localkart_rls_probe',
      );
      await tx.$executeRawUnsafe("SET LOCAL ROLE localkart_rls_probe");
      expect(await tx.$queryRawUnsafe('SELECT id FROM "User"')).toHaveLength(0);
      await tx.$executeRawUnsafe("RESET ROLE");
      await tx.$executeRawUnsafe(
        'REVOKE ALL ON "User" FROM localkart_rls_probe',
      );
      await tx.$executeRawUnsafe(
        "REVOKE USAGE ON SCHEMA public FROM localkart_rls_probe",
      );
      await tx.$executeRawUnsafe("DROP ROLE localkart_rls_probe");
    });
  });
  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ db } = await import("../src/db.js"));
    ({ createOrder, transitionOrder, pickupCode } =
      await import("../src/orders.js"));
    const register = async (role: string) => {
      const result = await request(app)
        .post("/api/v1/auth/register")
        .send({
          name: "Integration " + role,
          email: `${role}-${tag}@example.test`,
          password,
          role,
        });
      expect(result.status).toBe(201);
      return result.body;
    };
    customer = await register("CUSTOMER");
    merchant = await register("MERCHANT");
    other = (
      await request(app)
        .post("/api/v1/auth/register")
        .send({
          name: "Second Customer",
          email: `second-${tag}@example.test`,
          password,
        })
    ).body;
    const raw = await db.user.create({
      data: {
        email: `admin-${tag}@example.test`,
        name: "Test Admin",
        passwordHash: await (
          await import("bcryptjs")
        ).default.hash(password, 4),
        role: "ADMIN",
      },
    });
    admin = (
      await request(app)
        .post("/api/v1/auth/login")
        .send({ email: raw.email, password })
    ).body;
    const category = await db.category.create({
      data: { name: "Test " + tag },
    });
    const created = await request(app)
      .post("/api/v1/merchant/shops")
      .set(bearer(merchant))
      .send({
        name: "Test Shop " + tag,
        categoryId: category.id,
        address: "Test address Hyderabad",
        latitude: 17.4483,
        longitude: 78.3915,
      });
    expect(created.status).toBe(201);
    shop = created.body;
    expect(
      (
        await request(app)
          .post(`/api/v1/admin/shops/${shop.id}/approve`)
          .set(bearer(admin))
      ).status,
    ).toBe(204);
    const product = await request(app)
      .post(`/api/v1/merchant/shops/${shop.id}/products`)
      .set(bearer(merchant))
      .send({
        name: "Test rice " + tag,
        categoryId: category.id,
        unit: "PIECE",
        pricePaise: 5000,
        stockMilli: 20000,
      });
    expect(product.status).toBe(201);
    variant = product.body.variants[0];
  }, 30000);
  afterAll(async () => {
    if (db) await db.$disconnect();
  });
  const order = async (user = customer, quantity = 3000, method = "PICKUP") =>
    createOrder(user.user.id, randomBytes(12).toString("hex"), {
      shopId: shop.id,
      paymentMethod: method,
      items: [{ variantId: variant.id, quantity }],
    });
  const actor = () => ({ id: merchant.user.id, role: "MERCHANT" });
  it("authenticates, discovers approved shops and searches products", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: customer.user.email, password });
    expect(login.status).toBe(200);
    expect(
      (await request(app).get("/api/v1/shops/nearby?q=" + tag)).body.some(
        (s: any) => s.id === shop.id,
      ),
    ).toBe(true);
    expect(
      (await request(app).get("/api/v1/products/search?q=" + tag)).body.length,
    ).toBeGreaterThan(0);
  });
  it("denies customer admin access and merchant order access", async () => {
    expect(
      (await request(app).get("/api/v1/admin/users").set(bearer(customer)))
        .status,
    ).toBe(403);
    const o = await order();
    expect(
      (
        await request(app)
          .post(`/api/v1/merchant/orders/${o.id}/accept`)
          .set(bearer(customer))
      ).status,
    ).toBe(403);
    await transitionOrder(
      o.id,
      { id: customer.user.id, role: "CUSTOMER" },
      "CANCELLED",
    );
  });
  it("stores cart quantities and server prices", async () => {
    expect(
      (
        await request(app)
          .post("/api/v1/cart/items")
          .set(bearer(customer))
          .send({ variantId: variant.id, quantity: 3000 })
      ).status,
    ).toBe(201);
    const cart = await request(app).get("/api/v1/cart").set(bearer(customer));
    expect(cart.body[0].quantity).toBe(3000);
    expect(cart.body[0].variant.pricePaise).toBe(5000);
  });
  it("reserves 3 of 20, verifies pickup, and completes exactly once", async () => {
    const o = await order();
    expect(o.totalPaise).toBe(15000);
    await Promise.all([
      transitionOrder(o.id, actor(), "ACCEPTED"),
      transitionOrder(o.id, actor(), "ACCEPTED"),
    ]);
    let stock = await db.inventory.findUnique({
      where: { variantId: variant.id },
    });
    expect(stock.onHand - stock.reserved).toBe(17000);
    await transitionOrder(o.id, actor(), "PREPARING");
    await transitionOrder(o.id, actor(), "READY_FOR_PICKUP");
    const row = await db.order.findUnique({ where: { id: o.id } });
    const code = pickupCode(o.id, row.pickupNonce);
    await expect(
      transitionOrder(o.id, actor(), "COMPLETED", {
        code: "not valid",
        collected: true,
      }),
    ).rejects.toThrow("Invalid pickup code");
    expect(
      (await db.order.findUnique({ where: { id: o.id } })).pickupAttempts,
    ).toBe(1);
    await Promise.all([
      transitionOrder(o.id, actor(), "COMPLETED", { code, collected: true }),
      transitionOrder(o.id, actor(), "COMPLETED", { code, collected: true }),
    ]);
    stock = await db.inventory.findUnique({ where: { variantId: variant.id } });
    expect(stock.onHand).toBe(17000);
    expect(stock.reserved).toBe(0);
    expect(
      await db.inventoryMovement.count({
        where: { orderId: o.id, reason: "SALE" },
      }),
    ).toBe(1);
  });
  it("releases reservations on cancellation", async () => {
    const o = await order();
    await transitionOrder(o.id, actor(), "ACCEPTED");
    await transitionOrder(
      o.id,
      { id: customer.user.id, role: "CUSTOMER" },
      "CANCELLED",
    );
    const stock = await db.inventory.findUnique({
      where: { variantId: variant.id },
    });
    expect(stock.reserved).toBe(0);
    expect(stock.onHand).toBe(17000);
  });
  it("prevents two orders consuming the last available stock", async () => {
    await db.inventory.update({
      where: { variantId: variant.id },
      data: { onHand: 1000 },
    });
    const a = await order(customer, 1000);
    const b = await order(other, 1000);
    const results = await Promise.allSettled([
      transitionOrder(a.id, actor(), "ACCEPTED"),
      transitionOrder(b.id, actor(), "ACCEPTED"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const stock = await db.inventory.findUnique({
      where: { variantId: variant.id },
    });
    expect(stock.reserved).toBe(1000);
    const accepted = results[0].status === "fulfilled" ? a : b;
    await transitionOrder(accepted.id, actor(), "CANCELLED");
  });
  it("reuses order idempotency keys and rejects different requests", async () => {
    const key = randomBytes(12).toString("hex");
    const body = {
      shopId: shop.id,
      items: [{ variantId: variant.id, quantity: 1000 }],
    };
    const a = await createOrder(customer.user.id, key, body);
    const b = await createOrder(customer.user.id, key, body);
    expect(b.id).toBe(a.id);
    await expect(
      createOrder(customer.user.id, key, {
        ...body,
        items: [{ variantId: variant.id, quantity: 2000 }],
      }),
    ).rejects.toThrow("Idempotency");
  });
  it("makes simulated payment processing idempotent and refunds cancellations", async () => {
    const o = await order(customer, 1000, "SIMULATED");
    await transitionOrder(o.id, actor(), "ACCEPTED");
    for (let i = 0; i < 2; i++) {
      const response = await request(app)
        .post("/api/v1/payments/create")
        .set(bearer(customer))
        .send({ orderId: o.id });
      expect(response.status).toBe(200);
    }
    expect(
      await db.paymentEvent.count({ where: { payment: { orderId: o.id } } }),
    ).toBe(1);
    await transitionOrder(o.id, actor(), "CANCELLED");
    expect(
      (await db.payment.findUnique({ where: { orderId: o.id } })).status,
    ).toBe("SIMULATED_REFUNDED");
  });
});
