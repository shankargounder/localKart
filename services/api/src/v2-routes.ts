import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { addressSchema, type OrderStatus } from "@localkart/shared";
import { db } from "./db.js";
import { config } from "./config.js";
import {
  ApiError,
  transaction,
  transitionOrder,
  presentOrder,
} from "./orders.js";
import { logisticsProvider } from "./logistics.js";
import { recordOfflineSale } from "./offline-sales.js";

export const v2Router = Router();
v2Router.get("/features", (_req, res) =>
  res.json({
    realPayments: false,
    imageUploads:
      config.NODE_ENV !== "production" || config.UPLOAD_DRIVER === "supabase",
    merchantStaff: false,
    packedWeightChanges: false,
    substitutionApproval: false,
    promotions: false,
    suppliers: false,
    purchaseOrders: false,
    barcodeScanning: true,
    barcodeCatalog: config.BARCODE_CATALOG_PROVIDER,
    csvImport: false,
    pushDispatch: config.ENABLE_EXPO_PUSH === "true",
    aiShoppingLists: false,
  }),
);
const role =
  (value: string) => (req: Request, _res: Response, next: NextFunction) =>
    next(
      req.user.role === value ? undefined : new ApiError(403, "Access denied"),
    );
const uuid = (value: unknown) => z.string().uuid().parse(value);
const limit = (req: Request) =>
  z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).max(10000).default(0),
    })
    .parse(req.query);
const key = (req: Request) =>
  z.string().min(8).max(100).parse(req.headers["idempotency-key"]);

v2Router.use("/customers", role("CUSTOMER"));
v2Router.get("/customers/addresses", async (req, res) =>
  res.json(
    await db.address.findMany({
      where: { userId: req.user.id, archived: false },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ),
);
v2Router.post("/customers/addresses", async (req, res) =>
  res.status(201).json(
    await db.address.create({
      data: { ...addressSchema.parse(req.body), userId: req.user.id },
    }),
  ),
);
v2Router.delete("/customers/addresses/:id", async (req, res) => {
  await db.address.updateMany({
    where: { id: uuid(req.params.id), userId: req.user.id },
    data: { archived: true },
  });
  res.sendStatus(204);
});
v2Router.get("/customers/favorites", async (req, res) =>
  res.json(
    await db.favorite.findMany({
      where: {
        userId: req.user.id,
        shop: { approval: "APPROVED", owner: { suspended: false } },
      },
      include: { shop: { include: { category: true } } },
      take: 100,
    }),
  ),
);
v2Router.put("/customers/favorites/:id", async (req, res) => {
  const shopId = uuid(req.params.id);
  const shop = await db.shop.findFirst({
    where: { id: shopId, approval: "APPROVED", owner: { suspended: false } },
  });
  if (!shop) throw new ApiError(404, "Shop not found");
  res.json(
    await db.favorite.upsert({
      where: { userId_shopId: { userId: req.user.id, shopId } },
      create: { userId: req.user.id, shopId },
      update: {},
    }),
  );
});
v2Router.delete("/customers/favorites/:id", async (req, res) => {
  await db.favorite.deleteMany({
    where: { userId: req.user.id, shopId: uuid(req.params.id) },
  });
  res.sendStatus(204);
});
v2Router.get("/customers/wishlist", async (req, res) =>
  res.json(
    await db.wishlistItem.findMany({
      where: {
        userId: req.user.id,
        product: { active: true, shop: { approval: "APPROVED" } },
      },
      include: { product: true },
      take: 100,
    }),
  ),
);
v2Router.put("/customers/wishlist/:id", async (req, res) => {
  const productId = uuid(req.params.id);
  if (
    !(await db.product.findFirst({
      where: { id: productId, active: true, shop: { approval: "APPROVED" } },
    }))
  )
    throw new ApiError(404, "Product not found");
  res.json(
    await db.wishlistItem.upsert({
      where: { userId_productId: { userId: req.user.id, productId } },
      create: { userId: req.user.id, productId },
      update: {},
    }),
  );
});
v2Router.delete("/customers/wishlist/:id", async (req, res) => {
  await db.wishlistItem.deleteMany({
    where: { userId: req.user.id, productId: uuid(req.params.id) },
  });
  res.sendStatus(204);
});
const listSchema = z.object({
  name: z.string().min(2).max(100),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(150),
        quantity: z.string().max(50).default("1"),
      }),
    )
    .max(100),
});
v2Router.get("/customers/shopping-lists", async (req, res) =>
  res.json(
    await db.shoppingList.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ),
);
v2Router.post("/customers/shopping-lists", async (req, res) =>
  res.status(201).json(
    await db.shoppingList.create({
      data: { ...listSchema.parse(req.body), userId: req.user.id },
    }),
  ),
);
v2Router.patch("/customers/shopping-lists/:id", async (req, res) => {
  const data = listSchema.parse(req.body);
  const changed = await db.shoppingList.updateMany({
    where: { id: uuid(req.params.id), userId: req.user.id },
    data,
  });
  if (!changed.count) throw new ApiError(404, "List not found");
  res.sendStatus(204);
});
v2Router.post("/customers/orders/:id/reorder", async (req, res) => {
  const order = await db.order.findFirst({
    where: { id: uuid(req.params.id), customerId: req.user.id },
    include: { items: true },
  });
  if (!order) throw new ApiError(404, "Order not found");
  await transaction(async (tx) => {
    for (const item of order.items) {
      const v = await tx.variant.findFirst({
        where: {
          id: item.variantId,
          product: {
            active: true,
            shop: { approval: "APPROVED", owner: { suspended: false } },
          },
        },
        include: { inventory: true },
      });
      if (
        !v?.inventory ||
        v.inventory.onHand - v.inventory.reserved < item.quantity
      )
        throw new ApiError(
          409,
          item.name + " is unavailable; current basket is unchanged",
        );
      await tx.cartItem.upsert({
        where: { userId_variantId: { userId: req.user.id, variantId: v.id } },
        create: {
          userId: req.user.id,
          variantId: v.id,
          quantity: item.quantity,
        },
        update: { quantity: item.quantity },
      });
    }
  });
  res.json({
    message: "Items added to this shop’s cart. Current prices will apply.",
  });
});
v2Router.post("/customers/reviews", async (req, res) => {
  const body = z
    .object({
      productId: z.string().uuid(),
      orderId: z.string().uuid(),
      rating: z.number().int().min(1).max(5),
      body: z.string().min(3).max(2000),
    })
    .parse(req.body);
  const order = await db.order.findFirst({
    where: { id: body.orderId, customerId: req.user.id, status: "COMPLETED" },
    include: { items: true },
  });
  if (!order) throw new ApiError(403, "A completed purchase is required");
  const variant = await db.variant.findFirst({
    where: {
      productId: body.productId,
      id: { in: order.items.map((i) => i.variantId) },
    },
  });
  if (!variant)
    throw new ApiError(403, "Product was not purchased in this order");
  res
    .status(201)
    .json(await db.review.create({ data: { ...body, userId: req.user.id } }));
});
v2Router.get("/customers/reviews", async (req, res) =>
  res.json(
    await db.review.findMany({
      where: { userId: req.user.id },
      include: { product: true },
      take: 100,
    }),
  ),
);
v2Router.patch("/users/notification-preferences", async (req, res) => {
  const data = z
    .object({
      orderUpdates: z.boolean(),
      lowStock: z.boolean(),
      marketing: z.boolean().default(false),
    })
    .parse(req.body);
  await db.user.update({
    where: { id: req.user.id },
    data: { notificationPreferences: data },
  });
  await db.notificationPreference.upsert({
    where: { userId: req.user.id },
    create: {
      userId: req.user.id,
      orderUpdates: data.orderUpdates,
      lowStock: data.lowStock,
    },
    update: { orderUpdates: data.orderUpdates, lowStock: data.lowStock },
  });
  res.json(data);
});

v2Router.post("/delivery/quotes", role("CUSTOMER"), async (req, res) => {
  const { shopId, addressId } = z
    .object({ shopId: z.string().uuid(), addressId: z.string().uuid() })
    .parse(req.body);
  const shop = await db.shop.findFirst({
    where: {
      id: shopId,
      approval: "APPROVED",
      deliveryEnabled: true,
      open: true,
      acceptingOrders: true,
      holidayMode: false,
      owner: { suspended: false },
    },
  });
  const address = await db.address.findFirst({
    where: { id: addressId, userId: req.user.id, archived: false },
  });
  if (!shop || !address)
    throw new ApiError(404, "Delivery shop or address unavailable");
  const provider = logisticsProvider();
  const service = provider.checkServiceability(shop, address);
  if (!service.serviceable)
    throw new ApiError(
      409,
      "Address is outside this shop’s straight-line delivery radius",
    );
  const quoted = provider.getQuote(service.distanceKm);
  const {
    id: _id,
    userId: _user,
    createdAt: _created,
    archived: _archived,
    ...snapshot
  } = address;
  const quote = await db.deliveryQuote.create({
    data: {
      customerId: req.user.id,
      shopId,
      addressId,
      addressSnapshot: snapshot,
      provider: provider.name,
      feePaise: quoted.feePaise,
      distanceKm: service.distanceKm,
      expiresAt: new Date(Date.now() + 10 * 60000),
    },
  });
  res.status(201).json({
    ...quote,
    estimate: quoted.estimate,
    notice:
      provider.name === "MOCK"
        ? "DEVELOPMENT SIMULATION: no real rider or delivery time is promised"
        : "Manual pilot: delivery time will be confirmed by the dispatcher",
  });
});
v2Router.post("/delivery/events", role("ADMIN"), async (req, res) => {
  const body = z
    .object({
      orderId: z.string().uuid(),
      eventId: z.string().min(8).max(150),
      status: z.enum([
        "RIDER_ASSIGNED",
        "RIDER_PICKED_UP",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "DELIVERY_FAILED",
        "CANCELLED",
      ]),
      riderName: z.string().min(2).max(100).optional(),
      note: z.string().min(5).max(500),
      code: z
        .string()
        .regex(/^\d{6}$/)
        .optional(),
      collected: z.boolean().optional(),
      returned: z.boolean().optional(),
      discardReturned: z.boolean().optional(),
    })
    .parse(req.body);
  const order = await transitionOrder(
    body.orderId,
    req.user,
    body.status as OrderStatus,
    {
      code: body.code,
      collected: body.collected,
      deliveryEvent: {
        eventId: body.eventId,
        note: body.note,
        riderName: body.riderName,
        returned: body.returned,
        discardReturned: body.discardReturned,
      },
    },
  );
  res.json(presentOrder(order, false));
});
v2Router.post("/delivery/webhook", (_req, _res) => {
  throw new ApiError(
    503,
    "No external logistics webhook is configured. Pilot events require an authenticated administrator.",
  );
});
v2Router.get("/delivery/:id/status", async (req, res) => {
  const delivery = await db.delivery.findUnique({
    where: { id: uuid(req.params.id) },
    include: { order: { include: { shop: true } } },
  });
  if (
    !delivery ||
    (req.user.role !== "ADMIN" &&
      delivery.order.customerId !== req.user.id &&
      delivery.order.shop.ownerId !== req.user.id)
  )
    throw new ApiError(404, "Delivery not found");
  res.json({
    status: delivery.status,
    provider: delivery.provider,
    trackingReference: delivery.trackingReference,
    proofReference: delivery.proofReference,
  });
});

v2Router.get("/support/tickets", async (req, res) =>
  res.json(
    await db.supportTicket.findMany({
      where: req.user.role === "ADMIN" ? {} : { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ),
);
v2Router.post("/support/tickets", async (req, res) => {
  const body = z
    .object({
      orderId: z.string().uuid().optional(),
      subject: z.string().min(3).max(150),
      body: z.string().min(10).max(3000),
    })
    .parse(req.body);
  if (
    body.orderId &&
    !(await db.order.findFirst({
      where: {
        id: body.orderId,
        ...(req.user.role === "MERCHANT"
          ? { shop: { ownerId: req.user.id } }
          : { customerId: req.user.id }),
      },
    }))
  )
    throw new ApiError(404, "Order not found");
  res
    .status(201)
    .json(
      await db.supportTicket.create({ data: { ...body, userId: req.user.id } }),
    );
});
v2Router.post("/customers/refunds", async (req, res) => {
  const body = z
    .object({
      orderId: z.string().uuid(),
      amountPaise: z.number().int().positive(),
      reason: z.string().min(5).max(1000),
    })
    .parse(req.body);
  res.status(201).json(
    await transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${body.orderId}::uuid FOR UPDATE`;
      const order = await tx.order.findFirst({
        where: { id: body.orderId, customerId: req.user.id },
        include: { payment: true, refunds: true },
      });
      if (!order) throw new ApiError(404, "Order not found");
      if (
        !["SIMULATED_PAID", "COLLECTED_AT_PICKUP", "COLLECTED_COD"].includes(
          order.payment?.status || "",
        )
      )
        throw new ApiError(409, "No refundable payment recorded");
      const claimed = order.refunds
        .filter((r) => r.status !== "REJECTED")
        .reduce((s, r) => s + r.amountPaise, 0);
      if (claimed + body.amountPaise > order.totalPaise)
        throw new ApiError(409, "Refund exceeds the remaining payment");
      return tx.refund.create({ data: { ...body, customerId: req.user.id } });
    }),
  );
});
v2Router.get("/customers/refunds", async (req, res) =>
  res.json(
    await db.refund.findMany({
      where: { customerId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ),
);

v2Router.use("/merchant", role("MERCHANT"));
v2Router.post("/merchant/offline-sales", async (req, res) =>
  res
    .status(201)
    .json(await recordOfflineSale(req.user.id, key(req), req.body)),
);
v2Router.get("/merchant/offline-sales", async (req, res) => {
  const p = limit(req);
  res.json(
    await db.offlineSale.findMany({
      where: { shop: { ownerId: req.user.id } },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: p.limit,
      skip: p.offset,
    }),
  );
});
v2Router.patch("/merchant/variants/:id", async (req, res) => {
  const data = z
    .object({
      label: z.string().min(1).max(100).optional(),
      pricePaise: z.number().int().min(1).max(100000000).optional(),
      lowStockMilli: z.number().int().min(0).max(100000000).optional(),
    })
    .parse(req.body);
  const variant = await db.variant.findFirst({
    where: {
      id: uuid(req.params.id),
      product: { shop: { ownerId: req.user.id } },
    },
  });
  if (!variant) throw new ApiError(404, "Variant not found");
  const { lowStockMilli, ...patch } = data;
  res.json(
    await db.variant.update({
      where: { id: variant.id },
      data: {
        ...patch,
        ...(lowStockMilli !== undefined
          ? { inventory: { update: { lowStock: lowStockMilli } } }
          : {}),
      },
    }),
  );
});
v2Router.post("/merchant/products/:id/variants", async (req, res) => {
  const data = z
    .object({
      label: z.string().min(1).max(100),
      pricePaise: z.number().int().positive().max(100000000),
      stockMilli: z.number().int().min(0).max(100000000),
    })
    .parse(req.body);
  const product = await db.product.findFirst({
    where: { id: uuid(req.params.id), shop: { ownerId: req.user.id } },
  });
  if (!product) throw new ApiError(404, "Product not found");
  res.status(201).json(
    await transaction(async (tx) => {
      const variant = await tx.variant.create({
        data: {
          productId: product.id,
          label: data.label,
          pricePaise: data.pricePaise,
          inventory: { create: { onHand: data.stockMilli } },
        },
      });
      await tx.inventoryMovement.create({
        data: {
          variantId: variant.id,
          onHandDelta: data.stockMilli,
          reservedDelta: 0,
          reason: "INITIAL_STOCK",
          actorId: req.user.id,
        },
      });
      return variant;
    }),
  );
});
v2Router.put("/merchant/shops/:id/hours", async (req, res) => {
  const hours = z
    .array(
      z.object({
        day: z.number().int().min(0).max(6),
        opens: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        closes: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      }),
    )
    .max(7)
    .refine((v) => new Set(v.map((h) => h.day)).size === v.length)
    .parse(req.body);
  const shop = await db.shop.findFirst({
    where: { id: uuid(req.params.id), ownerId: req.user.id },
  });
  if (!shop) throw new ApiError(404, "Shop not found");
  await transaction(async (tx) => {
    await tx.shopHour.deleteMany({ where: { shopId: shop.id } });
    await tx.shopHour.createMany({
      data: hours.map((h) => ({ ...h, shopId: shop.id })),
    });
  });
  res.json(hours);
});
v2Router.get("/merchant/reports", async (req, res) => {
  const days = z.coerce
    .number()
    .int()
    .min(1)
    .max(366)
    .default(30)
    .parse(req.query.days);
  const since = new Date(
    Math.floor((Date.now() + 330 * 60000) / 86400000) * 86400000 -
      330 * 60000 -
      (days - 1) * 86400000,
  );
  const orders = await db.order.findMany({
    where: {
      shop: { ownerId: req.user.id },
      status: "COMPLETED",
      completedAt: { gte: since },
    },
    select: {
      merchandisePaise: true,
      platformFeePaise: true,
      merchantPayablePaise: true,
      completedAt: true,
      items: true,
    },
  });
  const sales = await db.offlineSale.findMany({
    where: { shop: { ownerId: req.user.id }, createdAt: { gte: since } },
    include: { items: true },
  });
  const daily: Record<string, number> = {};
  const top: Record<
    string,
    { name: string; quantityMilli: number; totalPaise: number }
  > = {};
  for (const record of [
    ...orders.map((o) => ({
      date: o.completedAt!,
      amount: o.merchandisePaise,
      items: o.items,
    })),
    ...sales.map((s) => ({
      date: s.createdAt,
      amount: s.totalPaise,
      items: s.items,
    })),
  ]) {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
    }).format(record.date);
    daily[day] = (daily[day] || 0) + record.amount;
    for (const i of record.items) {
      const t = (top[i.variantId] ??= {
        name: i.name,
        quantityMilli: 0,
        totalPaise: 0,
      });
      t.quantityMilli += i.quantity;
      t.totalPaise += i.totalPaise;
    }
  }
  res.json({
    days,
    onlineSalesPaise: orders.reduce((s, o) => s + o.merchandisePaise, 0),
    offlineSalesPaise: sales.reduce((s, o) => s + o.totalPaise, 0),
    platformFeesPaise: orders.reduce((s, o) => s + o.platformFeePaise, 0),
    merchantPayablePaise: orders.reduce(
      (s, o) => s + o.merchantPayablePaise,
      0,
    ),
    completedOnlineOrders: orders.length,
    offlineSales: sales.length,
    daily: Object.entries(daily)
      .sort()
      .map(([date, totalPaise]) => ({ date, totalPaise })),
    topProducts: Object.values(top)
      .sort((a, b) => b.totalPaise - a.totalPaise)
      .slice(0, 10),
  });
});
v2Router.get("/merchant/reports.csv", async (req, res) => {
  const rows = await db.offlineSale.findMany({
    where: { shop: { ownerId: req.user.id } },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });
  res
    .type("text/csv")
    .attachment("offline-sales.csv")
    .send(
      "sale_id,date,total_paise,payment_method\r\n" +
        rows
          .map((r) =>
            [
              r.id,
              r.createdAt.toISOString(),
              r.totalPaise,
              r.paymentMethod,
            ].join(","),
          )
          .join("\r\n"),
    );
});

v2Router.use("/admin", role("ADMIN"));
v2Router.get("/admin/deliveries", async (req, res) => {
  const p = limit(req);
  res.json(
    await db.delivery.findMany({
      include: {
        events: { orderBy: { createdAt: "asc" } },
        order: {
          select: {
            id: true,
            status: true,
            totalPaise: true,
            shop: { select: { name: true } },
            payment: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: p.limit,
      skip: p.offset,
    }),
  );
});
v2Router.get("/admin/commissions", async (_req, res) =>
  res.json(
    await db.commissionRule.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ),
);
v2Router.post("/admin/commissions", async (req, res) => {
  const data = z
    .object({
      shopId: z.string().uuid().optional(),
      categoryId: z.string().uuid().optional(),
      basisPoints: z.number().int().min(0).max(10000),
      minimumFeePaise: z.number().int().min(0).max(1000000).default(0),
      waived: z.boolean().default(false),
    })
    .parse(req.body);
  if (
    data.shopId &&
    !(await db.shop.findUnique({ where: { id: data.shopId } }))
  )
    throw new ApiError(400, "Shop not found");
  if (
    data.categoryId &&
    !(await db.category.findUnique({ where: { id: data.categoryId } }))
  )
    throw new ApiError(400, "Category not found");
  res.status(201).json(
    await transaction(async (tx) => {
      await tx.commissionRule.updateMany({
        where: {
          shopId: data.shopId || null,
          categoryId: data.categoryId || null,
          active: true,
        },
        data: { active: false },
      });
      const rule = await tx.commissionRule.create({ data });
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "SET_COMMISSION",
          targetId: rule.id,
        },
      });
      return rule;
    }),
  );
});
v2Router.get("/admin/analytics", async (_req, res) => {
  const [
    customers,
    merchants,
    approvedShops,
    pendingApprovals,
    activeShops,
    orders,
    cancelled,
    pickup,
    delivery,
    completed,
    refunds,
    fees,
  ] = await Promise.all([
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.user.count({ where: { role: "MERCHANT" } }),
    db.shop.count({ where: { approval: "APPROVED" } }),
    db.shop.count({ where: { approval: "PENDING" } }),
    db.shop.count({
      where: {
        approval: "APPROVED",
        open: true,
        acceptingOrders: true,
        owner: { suspended: false },
      },
    }),
    db.order.count(),
    db.order.count({ where: { status: "CANCELLED" } }),
    db.order.count({ where: { fulfillmentType: "PICKUP" } }),
    db.order.count({ where: { fulfillmentType: "DELIVERY" } }),
    db.order.aggregate({
      where: { status: "COMPLETED" },
      _sum: {
        merchandisePaise: true,
        platformFeePaise: true,
        deliveryFeePaise: true,
      },
      _count: true,
    }),
    db.refund.aggregate({
      where: { status: { in: ["REFUNDED", "SIMULATED_REFUNDED"] } },
      _sum: { amountPaise: true },
    }),
    db.$queryRaw<
      { net: number }[]
    >`SELECT coalesce(sum(o."platformFeePaise"-round(o."platformFeePaise"::numeric*least(o."totalPaise",coalesce(r.amount,0))/greatest(1,o."totalPaise"))),0)::float8 AS net FROM "Order" o LEFT JOIN (SELECT "orderId",sum("amountPaise") amount FROM "Refund" WHERE status IN ('REFUNDED','SIMULATED_REFUNDED') GROUP BY "orderId") r ON r."orderId"=o.id WHERE o.status='COMPLETED'`,
  ]);
  const daily =
    await db.$queryRaw`SELECT to_char("completedAt" AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS date,sum("merchandisePaise")::float8 AS "gmvPaise",sum("platformFeePaise")::float8 AS "feesPaise" FROM "Order" WHERE status='COMPLETED' AND "completedAt">now()-interval '7 days' GROUP BY date ORDER BY date`;
  res.json({
    daily,
    customers,
    merchants,
    approvedShops,
    pendingApprovals,
    activeShops,
    totalOrders: orders,
    cancelledOrders: cancelled,
    pickupOrders: pickup,
    deliveryOrders: delivery,
    gmvPaise: completed._sum.merchandisePaise || 0,
    grossPlatformFeesPaise: completed._sum.platformFeePaise || 0,
    netPlatformRevenuePaise: fees[0]?.net || 0,
    deliveryFeesQuotedPaise: completed._sum.deliveryFeePaise || 0,
    refundsPaise: refunds._sum.amountPaise || 0,
    averageOrderValuePaise: completed._count
      ? Math.round((completed._sum.merchandisePaise || 0) / completed._count)
      : 0,
    cancellationRate: orders ? cancelled / orders : 0,
  });
});
v2Router.patch("/admin/support/:id", async (req, res) => {
  const data = z
    .object({
      status: z.enum(["IN_PROGRESS", "RESOLVED", "CLOSED"]),
      resolution: z.string().min(5).max(2000),
    })
    .parse(req.body);
  await transaction(async (tx) => {
    await tx.supportTicket.update({ where: { id: uuid(req.params.id) }, data });
    await tx.auditLog.create({
      data: {
        actorId: req.user.id,
        action: "RESOLVE_SUPPORT",
        targetId: String(req.params.id),
      },
    });
  });
  res.sendStatus(204);
});
v2Router.get("/admin/refunds", async (_req, res) =>
  res.json(
    await db.refund.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        order: { select: { id: true, totalPaise: true, payment: true } },
      },
      take: 100,
    }),
  ),
);
v2Router.patch("/admin/refunds/:id", async (req, res) => {
  const body = z
    .object({
      action: z.enum(["APPROVE", "REJECT", "CONFIRM_MANUAL_REFUND"]),
      resolution: z.string().min(8).max(1000),
    })
    .parse(req.body);
  res.json(
    await transaction(async (tx) => {
      const refund = await tx.refund.findUniqueOrThrow({
        where: { id: uuid(req.params.id) },
        include: { order: { include: { payment: true } } },
      });
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${refund.orderId}::uuid FOR UPDATE`;
      if (!["REQUESTED", "MANUAL_REQUIRED"].includes(refund.status))
        throw new ApiError(409, "Refund is already resolved");
      let status =
        body.action === "REJECT"
          ? "REJECTED"
          : body.action === "CONFIRM_MANUAL_REFUND"
            ? "REFUNDED"
            : refund.order.payment?.method === "SIMULATED"
              ? "SIMULATED_REFUNDED"
              : "MANUAL_REQUIRED";
      if (
        body.action === "CONFIRM_MANUAL_REFUND" &&
        refund.status !== "MANUAL_REQUIRED"
      )
        throw new ApiError(
          409,
          "Approve a manual refund before confirming actual reimbursement",
        );
      if (refund.status === "MANUAL_REQUIRED" && body.action === "APPROVE")
        status = "MANUAL_REQUIRED";
      const changed = await tx.refund.updateMany({
        where: { id: refund.id, status: refund.status },
        data: { status, resolution: body.resolution },
      });
      if (changed.count !== 1)
        throw new ApiError(409, "Refund changed; refresh and retry");
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "REFUND_" + status,
          targetId: refund.id,
        },
      });
      return tx.refund.findUniqueOrThrow({ where: { id: refund.id } });
    }),
  );
});
v2Router.patch("/admin/categories/:id", async (req, res) => {
  const data = z
    .object({
      name: z.string().min(2).max(80).optional(),
      restricted: z.boolean().optional(),
      parentId: z.string().uuid().nullable().optional(),
    })
    .parse(req.body);
  const categoryId = uuid(req.params.id);
  if (data.parentId) {
    let cursor: string | null = data.parentId;
    for (let n = 0; cursor; n++) {
      if (cursor === categoryId || n > 20)
        throw new ApiError(400, "Category hierarchy cannot contain cycles");
      cursor = (
        await db.category.findUniqueOrThrow({
          where: { id: cursor },
          select: { parentId: true },
        })
      ).parentId;
    }
  }
  await transaction(async (tx) => {
    await tx.category.update({ where: { id: categoryId }, data });
    await tx.auditLog.create({
      data: {
        actorId: req.user.id,
        action: "EDIT_CATEGORY",
        targetId: categoryId,
      },
    });
  });
  res.sendStatus(204);
});
v2Router.get("/admin/audit", async (_req, res) =>
  res.json(
    await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ),
);
