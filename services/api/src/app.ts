import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  normalizeBarcode,
  loginSchema,
  registerSchema,
  shopSchema,
  productSchema,
  type OrderStatus,
} from "@localkart/shared";
import { db } from "./db.js";
import { config, browserOrigins } from "./config.js";
import {
  ApiError,
  hash,
  transaction,
  createOrder,
  transitionOrder,
  presentOrder,
  orderInclude,
} from "./orders.js";
import { discoveryRouter } from "./discovery.js";
import { v2Router } from "./v2-routes.js";
import { openapi } from "./openapi.js";
import { liveRouter } from "./live-routes.js";
import { publicMedia, imageRouter } from "./images.js";
declare module "express-serve-static-core" {
  interface Request {
    user: { id: string; role: string };
  }
}
export const app = express();
app.disable("x-powered-by");
app.use(
  helmet(),
  cors({
    origin: browserOrigins,
    credentials: false,
  }),
  express.json({ limit: "100kb" }),
  pinoHttp({
    enabled: config.NODE_ENV !== "test",
    serializers: {
      req: (request) => ({
        id: request.id,
        method: request.method,
        url: request.url?.split("?")[0],
      }),
    },
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body",
      "res.headers.set-cookie",
    ],
  }),
);
app.use(rateLimit({ windowMs: 60000, limit: 300 }));
const authLimit = rateLimit({ windowMs: 15 * 60000, limit: 30 });
app.use("/media", publicMedia);
const router = express.Router();
app.use("/api/v1", router);
router.use("/discovery", discoveryRouter);
router.get("/openapi.json", (_req, res) => res.json(openapi));
const id = (value: unknown) => z.string().uuid().parse(value);
const page = (req: Request) => {
  const p = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(30),
      offset: z.coerce.number().int().min(0).max(10000).default(0),
    })
    .parse(req.query);
  return { take: p.limit, skip: p.offset };
};
const auth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    if (!token) throw new Error();
    const payload = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as jwt.JwtPayload;
    const user = await db.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.suspended) throw new Error();
    req.user = { id: user.id, role: user.role };
    next();
  } catch {
    next(new ApiError(401, "Please log in"));
  }
};
const role =
  (wanted: string) => (req: Request, _res: Response, next: NextFunction) =>
    next(
      req.user.role === wanted ? undefined : new ApiError(403, "Access denied"),
    );
const safeUser = (u: any) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});
const access = (user: { id: string; role: string }) =>
  jwt.sign({ role: user.role }, config.JWT_SECRET, {
    subject: user.id,
    expiresIn: "15m",
    algorithm: "HS256",
  });
async function newSession(user: any) {
  const refreshToken = randomBytes(48).toString("hex");
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: hash(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    },
  });
  return { accessToken: access(user), refreshToken, user: safeUser(user) };
}
router.get("/health", async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ status: "ok" });
});
router.post("/auth/register", authLimit, async (req, res) => {
  const body = registerSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await db.user.create({
    data: {
      name: body.name,
      email: body.email.toLowerCase(),
      passwordHash,
      role: body.role,
    },
  });
  res.status(201).json(await newSession(user));
});
router.post("/auth/login", authLimit, async (req, res) => {
  const body = loginSchema.parse(req.body);
  const user = await db.user.findUnique({
    where: { email: body.email.toLowerCase() },
  });
  if (
    !user ||
    user.suspended ||
    !(await bcrypt.compare(body.password, user.passwordHash))
  )
    throw new ApiError(401, "Invalid credentials");
  res.json(await newSession(user));
});
router.post("/auth/refresh", authLimit, async (req, res) => {
  const { refreshToken } = z
    .object({ refreshToken: z.string().min(32).max(200) })
    .parse(req.body);
  const result = await transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { tokenHash: hash(refreshToken) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.user.suspended
    )
      throw new ApiError(401, "Session expired");
    const changed = await tx.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (changed.count !== 1)
      throw new ApiError(401, "Session already refreshed");
    const next = randomBytes(48).toString("hex");
    await tx.session.create({
      data: {
        userId: session.userId,
        tokenHash: hash(next),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    return {
      accessToken: access(session.user),
      refreshToken: next,
      user: safeUser(session.user),
    };
  });
  res.json(result);
});
router.post("/auth/logout", async (req, res) => {
  const { refreshToken } = z
    .object({ refreshToken: z.string() })
    .parse(req.body);
  await db.session.updateMany({
    where: { tokenHash: hash(refreshToken) },
    data: { revokedAt: new Date() },
  });
  res.sendStatus(204);
});
router.post("/auth/forgot-password", authLimit, async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  let resetToken: string | undefined;
  if (user) {
    resetToken = randomBytes(32).toString("hex");
    await db.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hash(resetToken),
        expiresAt: new Date(Date.now() + 15 * 60000),
      },
    });
  }
  res.json({
    message:
      "If the account exists, a reset was requested. Contact support for delivery.",
    ...(config.NODE_ENV !== "production" && resetToken
      ? { developmentResetToken: resetToken }
      : {}),
  });
});
router.post("/auth/reset-password", authLimit, async (req, res) => {
  const body = z
    .object({ token: z.string(), password: z.string().min(10).max(128) })
    .parse(req.body);
  const passwordHash = await bcrypt.hash(body.password, 12);
  await transaction(async (tx) => {
    const reset = await tx.passwordReset.findUnique({
      where: { tokenHash: hash(body.token) },
    });
    if (!reset || reset.usedAt || reset.expiresAt < new Date())
      throw new ApiError(400, "Invalid reset token");
    const changed = await tx.passwordReset.updateMany({
      where: { id: reset.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (!changed.count) throw new ApiError(400, "Token already used");
    await tx.user.update({
      where: { id: reset.userId },
      data: { passwordHash },
    });
    await tx.session.updateMany({
      where: { userId: reset.userId },
      data: { revokedAt: new Date() },
    });
  });
  res.sendStatus(204);
});
router.get("/categories", async (_req, res) =>
  res.json(await db.category.findMany({ orderBy: { name: "asc" } })),
);
router.get("/shops/nearby", async (req, res) => {
  const q = z
    .object({
      lat: z.coerce.number().min(-85).max(85).default(17.4483),
      lng: z.coerce.number().min(-180).max(180).default(78.3915),
      radius: z.coerce.number().positive().max(50).default(5),
      q: z.string().max(100).default(""),
      categoryId: z.string().uuid().optional(),
    })
    .parse(req.query);
  const latDelta = q.radius / 111;
  const lngDelta = q.radius / (111 * Math.cos((q.lat * Math.PI) / 180));
  const shops = await db.shop.findMany({
    where: {
      approval: "APPROVED",
      owner: { suspended: false },
      latitude: { gte: q.lat - latDelta, lte: q.lat + latDelta },
      longitude: { gte: q.lng - lngDelta, lte: q.lng + lngDelta },
      categoryId: q.categoryId,
      OR: [
        { name: { contains: q.q, mode: "insensitive" } },
        {
          products: {
            some: {
              active: true,
              name: { contains: q.q, mode: "insensitive" },
            },
          },
        },
      ],
    },
    include: { category: true, hours: true },
    take: 500,
  });
  const result = shops
    .map((s) => ({
      ...s,
      distanceKm:
        6371 *
        2 *
        Math.asin(
          Math.sqrt(
            Math.sin(((s.latitude - q.lat) * Math.PI) / 360) ** 2 +
              Math.cos((q.lat * Math.PI) / 180) *
                Math.cos((s.latitude * Math.PI) / 180) *
                Math.sin(((s.longitude - q.lng) * Math.PI) / 360) ** 2,
          ),
        ),
    }))
    .filter((s) => s.distanceKm <= q.radius)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  res.json(result.slice(page(req).skip, page(req).skip + page(req).take));
});
router.get("/shops/:id", async (req, res) => {
  const shop = await db.shop.findFirst({
    where: {
      id: id(req.params.id),
      approval: "APPROVED",
      owner: { suspended: false },
    },
    include: { category: true, hours: true },
  });
  if (!shop) throw new ApiError(404, "Shop not found");
  res.json(shop);
});
const publicProduct = (p: any) => ({
  ...p,
  variants: p.variants.map((v: any) => {
    const inv = v.inventory;
    const available = inv ? inv.onHand - inv.reserved : 0;
    const { inventory: _inventory, ...variant } = v;
    return {
      ...variant,
      availability:
        available <= 0
          ? "OUT_OF_STOCK"
          : available <= inv.lowStock
            ? "LOW_STOCK"
            : "IN_STOCK",
      availableMilli: p.discloseStock ? available : undefined,
    };
  }),
});
router.get("/shops/:id/products", async (req, res) =>
  res.json(
    (
      await db.product.findMany({
        where: {
          shopId: id(req.params.id),
          active: true,
          category: { restricted: false },
          shop: { approval: "APPROVED", owner: { suspended: false } },
          name: { contains: String(req.query.q || ""), mode: "insensitive" },
        },
        include: { variants: { include: { inventory: true } }, images: true },
        orderBy: { id: "asc" },
        ...page(req),
      })
    ).map(publicProduct),
  ),
);
router.get("/products/search", async (req, res) =>
  res.json(
    (
      await db.product.findMany({
        where: {
          active: true,
          category: { restricted: false },
          shop: { approval: "APPROVED", owner: { suspended: false } },
          name: {
            contains: String(req.query.q || "").slice(0, 100),
            mode: "insensitive",
          },
        },
        include: { variants: { include: { inventory: true } }, images: true },
        ...page(req),
      })
    ).map(publicProduct),
  ),
);
router.get("/products/:id", async (req, res) => {
  const p = await db.product.findFirst({
    where: {
      id: id(req.params.id),
      active: true,
      category: { restricted: false },
      shop: { approval: "APPROVED", owner: { suspended: false } },
    },
    include: { variants: { include: { inventory: true } }, images: true },
  });
  if (!p) throw new ApiError(404, "Product not found");
  res.json(publicProduct(p));
});
router.get("/time", (_req, res) =>
  res.json({ serverTime: new Date().toISOString() }),
);
router.use(auth);
router.use(liveRouter);
router.use(imageRouter);
router.use(v2Router);
router.get("/users/me", async (req, res) =>
  res.json(
    safeUser(await db.user.findUniqueOrThrow({ where: { id: req.user.id } })),
  ),
);
router.patch("/users/me", async (req, res) =>
  res.json(
    safeUser(
      await db.user.update({
        where: { id: req.user.id },
        data: z.object({ name: z.string().min(2).max(100) }).parse(req.body),
      }),
    ),
  ),
);
router.get("/notifications", async (req, res) =>
  res.json(
    await db.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      ...page(req),
    }),
  ),
);
router.post("/notifications/devices", async (req, res) => {
  const { token } = z
    .object({
      token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[.+\]$/),
    })
    .parse(req.body);
  await db.deviceToken.upsert({
    where: { token },
    create: { token, userId: req.user.id },
    update: { userId: req.user.id },
  });
  res.sendStatus(204);
});
router.get("/cart", role("CUSTOMER"), async (req, res) =>
  res.json(
    await db.cartItem.findMany({
      where: {
        userId: req.user.id,
        ...(req.query.shopId
          ? { variant: { product: { shopId: id(req.query.shopId) } } }
          : {}),
      },
      include: {
        variant: {
          include: {
            product: {
              include: {
                images: true,
                shop: {
                  select: {
                    id: true,
                    name: true,
                    address: true,
                    preparationMinutes: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
  ),
);
router.post("/cart/items", role("CUSTOMER"), async (req, res) => {
  const body = z
    .object({
      variantId: z.string().uuid(),
      quantity: z.number().int().positive().max(1000000),
    })
    .parse(req.body);
  const item = await transaction(async (tx) => {
    const variant = await tx.variant.findFirst({
      where: {
        id: body.variantId,
        product: { active: true, shop: { approval: "APPROVED" } },
      },
      include: { product: true },
    });
    if (!variant) throw new ApiError(404, "Product unavailable");
    return tx.cartItem.upsert({
      where: {
        userId_variantId: { userId: req.user.id, variantId: body.variantId },
      },
      create: { ...body, userId: req.user.id },
      update: { quantity: body.quantity },
    });
  });
  res.status(201).json(item);
});
router.patch("/cart/items/:id", role("CUSTOMER"), async (req, res) => {
  const { quantity } = z
    .object({ quantity: z.number().int().positive().max(1000000) })
    .parse(req.body);
  const changed = await db.cartItem.updateMany({
    where: { id: id(req.params.id), userId: req.user.id },
    data: { quantity },
  });
  if (!changed.count) throw new ApiError(404, "Item not found");
  res.sendStatus(204);
});
router.delete("/cart/items/:id", role("CUSTOMER"), async (req, res) => {
  await db.cartItem.deleteMany({
    where: { id: id(req.params.id), userId: req.user.id },
  });
  res.sendStatus(204);
});
router.post("/orders", role("CUSTOMER"), async (req, res) => {
  const key = z.string().min(8).max(100).parse(req.headers["idempotency-key"]);
  res
    .status(201)
    .json(presentOrder(await createOrder(req.user.id, key, req.body), true));
});
router.get("/orders", async (req, res) => {
  const where =
    req.user.role === "ADMIN"
      ? {}
      : req.user.role === "MERCHANT"
        ? { shop: { ownerId: req.user.id } }
        : { customerId: req.user.id };
  const view =
    req.user.role === "MERCHANT"
      ? z
          .enum(["today", "pending", "preparing", "ready", "cancelled"])
          .optional()
          .parse(req.query.dashboard)
      : undefined;
  const detail: any = {};
  if (view) {
    detail.createdAt = {
      gte: new Date(
        Math.floor((Date.now() + 330 * 60000) / 86400000) * 86400000 -
          330 * 60000,
      ),
    };
    const statuses: Record<string, string[]> = {
      pending: ["PENDING_ACCEPTANCE"],
      preparing: ["PREPARING"],
      ready: ["READY_FOR_PICKUP", "AWAITING_RIDER"],
      cancelled: ["CANCELLED"],
    };
    if (statuses[view]) detail.status = { in: statuses[view] };
  }
  res.json(
    (
      await db.order.findMany({
        where: { ...where, ...detail },
        include: orderInclude,
        orderBy: { createdAt: "desc" },
        ...page(req),
      })
    ).map((o) => presentOrder(o, req.user.role === "CUSTOMER")),
  );
});
router.get("/orders/:id", async (req, res) => {
  const order = await db.order.findUnique({
    where: { id: id(req.params.id) },
    include: orderInclude,
  });
  if (!order) throw new ApiError(404, "Order not found");
  if (
    req.user.role !== "ADMIN" &&
    order.customerId !== req.user.id &&
    order.shop.ownerId !== req.user.id
  )
    throw new ApiError(403, "Access denied");
  res.json(presentOrder(order, order.customerId === req.user.id));
});
router.post("/orders/:id/cancel", role("CUSTOMER"), async (req, res) =>
  res.json(
    presentOrder(
      await transitionOrder(id(req.params.id), req.user, "CANCELLED"),
      true,
    ),
  ),
);
router.post("/payments/create", role("CUSTOMER"), async (req, res) => {
  const { orderId } = z.object({ orderId: z.string().uuid() }).parse(req.body);
  res.json(
    await transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { payment: true },
      });
      if (!order || order.customerId !== req.user.id)
        throw new ApiError(404, "Order not found");
      if (
        order.payment?.method !== "SIMULATED" ||
        config.ENABLE_SIMULATED_PAYMENTS !== "true" ||
        config.NODE_ENV === "production"
      )
        throw new ApiError(400, "Online payment provider is not configured");
      if (
        ![
          "ACCEPTED",
          "PREPARING",
          "READY_FOR_PICKUP",
          "AWAITING_RIDER",
          "RIDER_ASSIGNED",
        ].includes(order.status)
      )
        throw new ApiError(
          409,
          "Shop must reserve stock before a test payment",
        );
      const eventId = "simulated:" + order.id;
      await tx.paymentEvent.upsert({
        where: { providerEventId: eventId },
        create: { providerEventId: eventId, paymentId: order.payment.id },
        update: {},
      });
      return tx.payment.update({
        where: { orderId },
        data: { status: "SIMULATED_PAID" },
      });
    }),
  );
});
router.post("/payments/webhook", (_req, _res) => {
  throw new ApiError(
    503,
    "Real payment provider disabled; no payment accepted",
  );
});
router.use("/merchant", role("MERCHANT"));
router.get("/merchant/shops", async (req, res) =>
  res.json(
    await db.shop.findMany({
      where: { ownerId: req.user.id },
      include: { hours: true, category: true },
    }),
  ),
);
router.post("/merchant/shops", async (req, res) =>
  res.status(201).json(
    await db.shop.create({
      data: { ...shopSchema.parse(req.body), ownerId: req.user.id },
    }),
  ),
);
async function ownedShop(shopId: string, userId: string) {
  const shop = await db.shop.findFirst({
    where: { id: shopId, ownerId: userId },
  });
  if (!shop) throw new ApiError(404, "Shop not found");
  return shop;
}
router.patch("/merchant/shops/:id", async (req, res) => {
  await ownedShop(id(req.params.id), req.user.id);
  const data = z
    .object({
      name: z.string().min(2).max(120).optional(),
      description: z.string().max(2000).optional(),
      open: z.boolean().optional(),
      acceptingOrders: z.boolean().optional(),
      holidayMode: z.boolean().optional(),
      preparationMinutes: z.number().int().min(5).max(240).optional(),
      deliveryEnabled: z.boolean().optional(),
      codEnabled: z.boolean().optional(),
      deliveryRadiusKm: z.number().positive().max(25).optional(),
      pickupInstructions: z.string().max(1000).optional(),
    })
    .parse(req.body);
  res.json(await db.shop.update({ where: { id: id(req.params.id) }, data }));
});
router.get("/merchant/products", async (req, res) =>
  res.json(
    await db.product.findMany({
      where: {
        shop: { ownerId: req.user.id },
        ...(req.query.active === undefined
          ? {}
          : {
              active:
                z.enum(["true", "false"]).parse(req.query.active) === "true",
            }),
      },
      include: { variants: { include: { inventory: true } }, images: true },
      orderBy: { id: "asc" },
      ...page(req),
    }),
  ),
);
router.post("/merchant/shops/:id/products", async (req, res) => {
  const shop = await ownedShop(id(req.params.id), req.user.id);
  const body = productSchema.parse(req.body);
  if (
    (await db.category.findUnique({ where: { id: body.categoryId } }))
      ?.restricted
  )
    throw new ApiError(400, "Restricted category");
  const {
    pricePaise,
    stockMilli,
    lowStockMilli,
    label,
    barcode,
    catalogSource,
    ...product
  } = body;
  const normalizedBarcode = barcode ? normalizeBarcode(barcode) : undefined;
  res.status(201).json(
    await transaction(async (tx) => {
      if (normalizedBarcode) {
        await tx.$queryRaw`SELECT id FROM "Shop" WHERE id=${shop.id}::uuid FOR UPDATE`;
        if (
          await tx.product.findFirst({
            where: {
              shopId: shop.id,
              specifications: { path: ["barcode"], equals: normalizedBarcode },
            },
          })
        )
          throw new ApiError(
            409,
            "This barcode is already in your shop. Edit its variants or stock instead.",
          );
      }
      const created = await tx.product.create({
        data: {
          ...product,
          ...(normalizedBarcode
            ? {
                specifications: {
                  barcode: normalizedBarcode,
                  barcodeSource: catalogSource || "MANUAL",
                  ...(catalogSource === "OPENFOODFACTS"
                    ? {
                        barcodeSourceUrl:
                          "https://world.openfoodfacts.org/product/" +
                          normalizedBarcode,
                        barcodeLicense:
                          "Open Database License (ODbL) — Open Food Facts; review source before publishing",
                      }
                    : {}),
                },
              }
            : {}),
          shopId: shop.id,
          variants: {
            create: {
              label,
              pricePaise,
              inventory: {
                create: { onHand: stockMilli, lowStock: lowStockMilli },
              },
            },
          },
        },
        include: { variants: true },
      });
      await tx.inventoryMovement.create({
        data: {
          variantId: created.variants[0].id,
          onHandDelta: stockMilli,
          reservedDelta: 0,
          actorId: req.user.id,
          reason: "INITIAL_STOCK",
        },
      });
      return created;
    }),
  );
});
router.patch("/merchant/products/:id", async (req, res) => {
  const product = await db.product.findFirst({
    where: { id: id(req.params.id), shop: { ownerId: req.user.id } },
  });
  if (!product) throw new ApiError(404, "Product not found");
  const body = z
    .object({
      name: z.string().min(2).max(150).optional(),
      description: z.string().max(2000).optional(),
      active: z.boolean().optional(),
      discloseStock: z.boolean().optional(),
      brand: z.string().max(100).optional(),
      sku: z.string().max(100).optional(),
      keywords: z.string().max(500).optional(),
      freshnessInstructions: z.string().max(1000).optional(),
      specifications: z.record(z.string(), z.string().max(500)).optional(),
    })
    .parse(req.body);
  res.json(await db.product.update({ where: { id: product.id }, data: body }));
});
router.get("/merchant/inventory", async (req, res) => {
  const low =
    z.enum(["true", "false"]).optional().parse(req.query.lowStock) === "true";
  const rows = await db.inventory.findMany({
    where: { variant: { product: { shop: { ownerId: req.user.id } } } },
    include: { variant: { include: { product: true } } },
    orderBy: { variantId: "asc" },
    ...(low ? {} : page(req)),
  });
  res.json(
    low
      ? rows
          .filter((i) => i.onHand - i.reserved <= i.lowStock)
          .slice(page(req).skip, page(req).skip + page(req).take)
      : rows,
  );
});
router.get("/merchant/inventory/movements", async (req, res) =>
  res.json(
    await db.inventoryMovement.findMany({
      where: { variant: { product: { shop: { ownerId: req.user.id } } } },
      orderBy: { createdAt: "desc" },
      ...page(req),
    }),
  ),
);
router.post("/merchant/inventory/adjustments", async (req, res) => {
  const body = z
    .object({
      variantId: z.string().uuid(),
      delta: z.number().int().min(-100000000).max(100000000),
      reason: z.string().min(5).max(300),
    })
    .parse(req.body);
  await transaction(async (tx) => {
    const variant = await tx.variant.findFirst({
      where: {
        id: body.variantId,
        product: { shop: { ownerId: req.user.id } },
      },
    });
    if (!variant) throw new ApiError(404, "Variant not found");
    const count =
      await tx.$executeRaw`UPDATE "Inventory" SET "onHand"="onHand"+${body.delta} WHERE "variantId"=${body.variantId}::uuid AND "onHand"+${body.delta}>=reserved AND "onHand"+${body.delta}<=100000000`;
    if (count !== 1)
      throw new ApiError(
        409,
        "Adjustment would consume reserved stock or exceed the stock limit",
      );
    await tx.inventoryMovement.create({
      data: {
        variantId: body.variantId,
        onHandDelta: body.delta,
        reservedDelta: 0,
        reason: body.reason,
        actorId: req.user.id,
      },
    });
  });
  res.sendStatus(204);
});
const actions: Record<string, OrderStatus> = {
  accept: "ACCEPTED",
  reject: "REJECTED",
  preparing: "PREPARING",
  ready: "READY_FOR_PICKUP",
  complete: "COMPLETED",
  cancel: "CANCELLED",
};
router.post("/merchant/orders/:id/:action", async (req, res) => {
  let next = actions[String(req.params.action)];
  if (!next) throw new ApiError(404, "Action not found");
  if (next === "READY_FOR_PICKUP") {
    const order = await db.order.findUnique({
      where: { id: id(req.params.id) },
      select: { fulfillmentType: true },
    });
    if (order?.fulfillmentType === "DELIVERY") next = "AWAITING_RIDER";
  }
  const body = z
    .object({
      code: z
        .string()
        .regex(/^\d{6}$/)
        .optional(),
      reason: z.string().min(3).max(500).optional(),
      collected: z.boolean().optional(),
      preparationDurationMinutes: z.number().int().min(1).max(240).optional(),
    })
    .parse(req.body || {});
  if (next === "REJECTED" && !body.reason)
    throw new ApiError(400, "Rejection reason required");
  res.json(
    presentOrder(
      await transitionOrder(id(req.params.id), req.user, next, body),
      false,
    ),
  );
});
router.get("/merchant/dashboard", async (req, res) => {
  const since = new Date(
    Math.floor((Date.now() + 330 * 60000) / 86400000) * 86400000 - 330 * 60000,
  );
  const where = { shop: { ownerId: req.user.id } };
  const [orders, inventory, sales, offline, productCount] = await Promise.all([
    db.order.findMany({ where: { ...where, createdAt: { gte: since } } }),
    db.inventory.findMany({
      where: { variant: { product: { shop: { ownerId: req.user.id } } } },
    }),
    db.order.aggregate({
      where: { ...where, status: "COMPLETED", completedAt: { gte: since } },
      _sum: { merchandisePaise: true },
    }),
    db.offlineSale.aggregate({
      where: { ...where, createdAt: { gte: since } },
      _sum: { totalPaise: true },
    }),
    db.product.count({
      where: { shop: { ownerId: req.user.id }, active: true },
    }),
  ]);
  res.json({
    todayOrders: orders.length,
    pending: orders.filter((o) => o.status === "PENDING_ACCEPTANCE").length,
    preparing: orders.filter((o) => o.status === "PREPARING").length,
    ready: orders.filter((o) =>
      ["READY_FOR_PICKUP", "AWAITING_RIDER"].includes(o.status),
    ).length,
    cancelled: orders.filter((o) => o.status === "CANCELLED").length,
    salesPaise:
      (sales._sum.merchandisePaise || 0) + (offline._sum.totalPaise || 0),
    totalProducts: productCount,
    lowStock: inventory.filter((i) => i.onHand - i.reserved <= i.lowStock)
      .length,
  });
});
router.use("/admin", role("ADMIN"));
router.get("/admin/dashboard", async (_req, res) => {
  const [users, shops, orders, sales] = await Promise.all([
    db.user.count(),
    db.shop.count(),
    db.order.count(),
    db.order.aggregate({
      where: { status: "COMPLETED" },
      _sum: { totalPaise: true },
    }),
  ]);
  res.json({ users, shops, orders, salesPaise: sales._sum.totalPaise || 0 });
});
router.get("/admin/shops", async (req, res) =>
  res.json(
    await db.shop.findMany({
      include: {
        category: true,
        owner: { select: { name: true, email: true } },
      },
      ...page(req),
    }),
  ),
);
router.get("/admin/shops/pending", async (req, res) =>
  res.json(
    await db.shop.findMany({
      where: { approval: "PENDING" },
      include: { category: true },
      ...page(req),
    }),
  ),
);
router.post("/admin/shops/:id/:action", async (req, res) => {
  const approval = (
    { approve: "APPROVED", reject: "REJECTED", suspend: "SUSPENDED" } as Record<
      string,
      string
    >
  )[String(req.params.action)];
  if (!approval) throw new ApiError(400, "Invalid approval action");
  await transaction(async (tx) => {
    await tx.shop.update({
      where: { id: id(req.params.id) },
      data: { approval },
    });
    await tx.auditLog.create({
      data: {
        actorId: req.user.id,
        action: approval,
        targetId: String(req.params.id),
      },
    });
  });
  res.sendStatus(204);
});
router.get("/admin/users", async (req, res) =>
  res.json(
    await db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        suspended: true,
        createdAt: true,
      },
      ...page(req),
    }),
  ),
);
router.patch("/admin/users/:id", async (req, res) => {
  if (req.params.id === req.user.id)
    throw new ApiError(400, "Cannot suspend your own account");
  const { suspended } = z.object({ suspended: z.boolean() }).parse(req.body);
  await transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: id(req.params.id) },
    });
    if (user.role === "ADMIN")
      throw new ApiError(403, "Cannot modify administrator");
    await tx.user.update({ where: { id: user.id }, data: { suspended } });
    await tx.auditLog.create({
      data: {
        actorId: req.user.id,
        action: suspended ? "SUSPEND_USER" : "REACTIVATE_USER",
        targetId: user.id,
      },
    });
  });
  res.sendStatus(204);
});
router.post("/admin/categories", async (req, res) =>
  res.status(201).json(
    await db.category.create({
      data: z.object({ name: z.string().min(2).max(80) }).parse(req.body),
    }),
  ),
);
router.get("/admin/products", async (req, res) =>
  res.json(
    await db.product.findMany({
      include: { shop: { select: { name: true } }, variants: true },
      ...page(req),
    }),
  ),
);
router.patch("/admin/products/:id", async (req, res) => {
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  await transaction(async (tx) => {
    await tx.product.update({
      where: { id: id(req.params.id) },
      data: { active },
    });
    await tx.auditLog.create({
      data: {
        actorId: req.user.id,
        action: active ? "RESTORE_PRODUCT" : "HIDE_PRODUCT",
        targetId: String(req.params.id),
      },
    });
  });
  res.sendStatus(204);
});
router.get("/admin/inventory-anomalies", async (_req, res) =>
  res.json(
    await db.$queryRaw`SELECT * FROM "Inventory" WHERE reserved<0 OR "onHand"<reserved`,
  ),
);
app.use((_req, _res, next) => next(new ApiError(404, "Endpoint not found")));
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError) {
    res.status(400).json({ message: "Invalid input", issues: err.issues });
    return;
  }
  if (err.code === "P2002") {
    res.status(409).json({ message: "This record already exists" });
    return;
  }
  if (err.code === "P2025") {
    res.status(404).json({ message: "Record not found" });
    return;
  }
  if (!(err instanceof ApiError)) req.log.error({ err }, "Request failed");
  res.status(err.status || 500).json({
    message:
      err instanceof ApiError ? err.message : "An unexpected error occurred",
  });
});
