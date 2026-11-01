import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  lineTotal,
  commissionFee,
  orderSchema,
  transitions,
  type OrderStatus,
} from "@localkart/shared";
import { db } from "./db.js";
import { z } from "zod";
import { queueOrderEvent, queueNotification } from "./notifications.js";
import { config } from "./config.js";
import { ApiError } from "./errors.js";
import { logisticsProvider } from "./logistics.js";
export { ApiError } from "./errors.js";
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const pickupCode = (orderId: string, nonce: string) =>
  String(
    BigInt(
      "0x" +
        createHmac("sha256", config.PICKUP_SECRET)
          .update(orderId + nonce)
          .digest("hex")
          .slice(0, 12),
    ) % 1000000n,
  ).padStart(6, "0");
export const orderInclude = {
  items: true,
  customer: { select: { name: true } },
  payment: true,
  delivery: { include: { events: { orderBy: { createdAt: "asc" as const } } } },
  history: { orderBy: { createdAt: "asc" as const } },
  shop: { include: { category: true } },
};
export async function transaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        timeout: 15000,
      });
    } catch (e) {
      // Prisma surfaces raw-SQL serialization failures as P2010 with PostgreSQL SQLSTATE.
      const retryable =
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (["P2034", "P2002"].includes(e.code) ||
          (e.code === "P2010" &&
            ["40001", "40P01"].includes(String(e.meta?.code))));
      if (retryable && attempt < 5) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            10 * 2 ** attempt + Math.floor(Math.random() * 15),
          ),
        );
        continue;
      }
      if (retryable)
        throw new ApiError(
          409,
          "Concurrent update; retry with the same request key",
        );
      throw e;
    }
  }
}
export async function createOrder(
  customerId: string,
  key: string,
  body: unknown,
) {
  const input = orderSchema.parse(body);
  const requestHash = hash(JSON.stringify(input));
  return transaction(async (tx) => {
    const existing = await tx.order.findUnique({
      where: { customerId_idempotencyKey: { customerId, idempotencyKey: key } },
      include: orderInclude,
    });
    if (existing) {
      const legacyHash = hash(
        JSON.stringify({
          shopId: input.shopId,
          paymentMethod: input.paymentMethod,
          items: input.items,
        }),
      );
      if (
        existing.requestHash !== requestHash &&
        !(
          input.fulfillmentType === "PICKUP" &&
          !input.quoteId &&
          !input.packingPreferences &&
          existing.requestHash === legacyHash
        )
      )
        throw new ApiError(
          409,
          "Idempotency key already used with different items",
        );
      return existing;
    }
    const shop = await tx.shop.findUnique({
      where: { id: input.shopId },
      include: { owner: true },
    });
    if (
      !shop ||
      shop.approval !== "APPROVED" ||
      !shop.open ||
      !shop.acceptingOrders ||
      shop.holidayMode ||
      shop.owner.suspended
    )
      throw new ApiError(409, "Shop is not accepting orders");
    let quote = null;
    if (input.fulfillmentType === "DELIVERY") {
      if (
        !shop.deliveryEnabled ||
        (input.paymentMethod === "COD" && !shop.codEnabled)
      )
        throw new ApiError(
          409,
          "Shop has not enabled this delivery/payment option",
        );
      quote = await tx.deliveryQuote.findFirst({
        where: {
          id: input.quoteId,
          shopId: shop.id,
          customerId,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!quote)
        throw new ApiError(
          409,
          "Delivery quote expired or was used. Request a new quote.",
        );
      if (
        config.NODE_ENV === "production" &&
        (quote.provider !== "MANUAL" ||
          config.ENABLE_MANUAL_DELIVERY !== "true")
      )
        throw new ApiError(409, "Delivery provider is unavailable");
      const changed = await tx.deliveryQuote.updateMany({
        where: { id: quote.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (changed.count !== 1)
        throw new ApiError(409, "Quote already consumed");
    }
    if (
      input.paymentMethod === "SIMULATED" &&
      (config.NODE_ENV === "production" ||
        config.ENABLE_SIMULATED_PAYMENTS !== "true")
    )
      throw new ApiError(400, "Simulated payments disabled");
    const items = [];
    for (const item of input.items) {
      const variant = await tx.variant.findUnique({
        where: { id: item.variantId },
        include: {
          product: {
            include: {
              images: {
                take: 1,
                orderBy: [{ isDemo: "asc" }, { createdAt: "asc" }],
              },
            },
          },
          inventory: true,
        },
      });
      if (
        !variant ||
        variant.product.shopId !== shop.id ||
        !variant.product.active ||
        !variant.inventory
      )
        throw new ApiError(400, "Product is unavailable");
      const category = await tx.category.findUniqueOrThrow({
        where: { id: variant.product.categoryId },
      });
      if (category.restricted)
        throw new ApiError(400, "Restricted category is not available");
      if (
        ["PIECE", "PACKET"].includes(variant.product.unit) &&
        item.quantity % 1000 !== 0
      )
        throw new ApiError(400, "This product requires whole units");
      if (variant.inventory.onHand - variant.inventory.reserved < item.quantity)
        throw new ApiError(409, "Insufficient available stock");
      items.push({
        variantId: variant.id,
        name: variant.product.name + " · " + variant.label,
        description: variant.product.description,
        unit: variant.product.unit,
        quantity: item.quantity,
        pricePaise: variant.pricePaise,
        totalPaise: lineTotal(variant.pricePaise, item.quantity),
        imageUrl: variant.product.images[0]?.url,
        imageAlt: variant.product.images[0]?.alt,
      });
    }
    const merchandisePaise = items.reduce(
      (sum, item) => sum + item.totalPaise,
      0,
    );
    const deliveryFeePaise = quote?.feePaise || 0;
    const totalPaise = merchandisePaise + deliveryFeePaise;
    const rules = await tx.commissionRule.findMany({
      where: {
        active: true,
        OR: [
          { shopId: shop.id },
          { shopId: null, categoryId: shop.categoryId },
          { shopId: null, categoryId: null },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    const rule =
      rules.find((r) => r.shopId === shop.id) ||
      rules.find((r) => r.categoryId === shop.categoryId) ||
      rules.find((r) => !r.shopId && !r.categoryId);
    const platformFeePaise = commissionFee(
      merchandisePaise,
      rule?.basisPoints || 0,
      rule?.minimumFeePaise || 0,
      rule?.waived || false,
    );
    if (!Number.isSafeInteger(totalPaise) || totalPaise > 2000000000)
      throw new ApiError(400, "Order total exceeds limit");
    const order = await tx.order.create({
      data: {
        customerId,
        shopId: shop.id,
        idempotencyKey: key,
        requestHash,
        totalPaise,
        merchandisePaise,
        deliveryFeePaise,
        platformFeePaise,
        merchantPayablePaise: merchandisePaise - platformFeePaise,
        commissionBps: rule?.basisPoints || 0,
        fulfillmentType: input.fulfillmentType,
        packingPreferences: input.packingPreferences,
        ...(quote
          ? {
              delivery: {
                create: {
                  quoteId: quote.id,
                  provider: quote.provider,
                  addressSnapshot:
                    quote.addressSnapshot as Prisma.InputJsonValue,
                },
              },
            }
          : {}),
        expiresAt: new Date(Date.now() + 30 * 60000),
        items: { create: items },
        history: { create: { status: "PENDING_ACCEPTANCE" } },
        payment: {
          create: { method: input.paymentMethod, amountPaise: totalPaise },
        },
      },
      include: orderInclude,
    });
    await queueOrderEvent(tx, order, "CREATED");
    await tx.cartItem.deleteMany({
      where: { userId: customerId, variant: { product: { shopId: shop.id } } },
    });
    return order;
  });
}
export async function transitionOrder(
  id: string,
  actor: { id: string; role: string },
  next: OrderStatus,
  options: {
    code?: string;
    reason?: string;
    collected?: boolean;
    preparationDurationMinutes?: number;
    deliveryEvent?: {
      eventId: string;
      note: string;
      riderName?: string;
      returned?: boolean;
      discardReturned?: boolean;
    };
  } = {},
) {
  const result = await transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id}::uuid FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id },
      include: { ...orderInclude, reservations: true },
    });
    if (!order) throw new ApiError(404, "Order not found");
    const customer = actor.role === "CUSTOMER" && order.customerId === actor.id;
    const merchant =
      actor.role === "MERCHANT" && order.shop.ownerId === actor.id;
    const system = actor.role === "SYSTEM";
    const dispatcher = actor.role === "ADMIN" && !!options.deliveryEvent;
    if (!(
      merchant ||
      (customer && next === "CANCELLED") ||
      (system && next === "EXPIRED") ||
      dispatcher
    ))
      throw new ApiError(403, "Access denied");
    const event = options.deliveryEvent;
    const eventHash = hash(JSON.stringify({ id, next, options }));
    if (event) {
      const existing = await tx.deliveryEvent.findUnique({
        where: { eventId: event.eventId },
      });
      if (existing) {
        if (
          existing.deliveryId !== order.delivery?.id ||
          existing.requestHash !== eventHash
        )
          throw new ApiError(
            409,
            "Delivery event key reused with different data",
          );
        return { order };
      }
    }
    if (event?.discardReturned && !event.returned)
      throw new ApiError(
        400,
        "Confirm physical return before recording wastage",
      );
    if (
      event?.returned &&
      (order.status !== "DELIVERY_FAILED" || next !== "CANCELLED")
    )
      throw new ApiError(
        400,
        "Return confirmation only applies to failed-delivery cancellation",
      );
    if (
      order.fulfillmentType === "DELIVERY" &&
      ["READY_FOR_PICKUP", "PICKUP_COMPLETED"].includes(next)
    )
      throw new ApiError(409, "Use the delivery workflow for this order");
    if (
      order.fulfillmentType === "PICKUP" &&
      [
        "AWAITING_RIDER",
        "RIDER_ASSIGNED",
        "RIDER_PICKED_UP",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "DELIVERY_FAILED",
      ].includes(next)
    )
      throw new ApiError(409, "This is a pickup order");
    if (
      [
        "RIDER_ASSIGNED",
        "RIDER_PICKED_UP",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "DELIVERY_FAILED",
      ].includes(next) &&
      !dispatcher
    )
      throw new ApiError(
        403,
        "Only an authorized dispatcher can record delivery events",
      );
    if (order.fulfillmentType === "DELIVERY" && next === "COMPLETED")
      throw new ApiError(
        409,
        "Delivery completion requires verified delivery proof",
      );
    if (
      order.status === "DELIVERY_FAILED" &&
      next === "CANCELLED" &&
      (!dispatcher || !event?.returned)
    )
      throw new ApiError(
        409,
        "Confirm return to the shop before releasing stock",
      );
    if (order.status === next) {
      if (
        next === "ACCEPTED" &&
        options.preparationDurationMinutes !== undefined &&
        options.preparationDurationMinutes !== order.preparationDurationMinutes
      )
        throw new ApiError(
          409,
          "Order was already accepted with another duration; update the estimate instead",
        );
      return { order };
    }
    if (next === "ACCEPTED" && order.expiresAt <= new Date())
      throw new ApiError(409, "Order acceptance window expired");
    if (!transitions[order.status as OrderStatus]?.includes(next))
      throw new ApiError(409, "This order cannot move to " + next);
    if (customer && !["PENDING_ACCEPTANCE", "ACCEPTED"].includes(order.status))
      throw new ApiError(409, "Preparation has started; contact the shop");
    if (next === "ACCEPTED") {
      const owner = await tx.user.findUniqueOrThrow({
        where: { id: actor.id },
      });
      if (owner.suspended || order.shop.approval !== "APPROVED")
        throw new ApiError(403, "Shop is not approved");
      for (const item of [...order.items].sort((a, b) =>
        a.variantId.localeCompare(b.variantId),
      )) {
        const count =
          await tx.$executeRaw`UPDATE "Inventory" SET reserved=reserved+${item.quantity} WHERE "variantId"=${item.variantId}::uuid AND "onHand"-reserved>=${item.quantity}`;
        if (count !== 1)
          throw new ApiError(
            409,
            "Not enough stock for " +
              item.name +
              "; reject this order or adjust stock",
          );
        await tx.reservation.create({
          data: {
            orderId: id,
            variantId: item.variantId,
            quantity: item.quantity,
          },
        });
        await tx.inventoryMovement.create({
          data: {
            variantId: item.variantId,
            orderId: id,
            onHandDelta: 0,
            reservedDelta: item.quantity,
            reason: "RESERVE",
            actorId: actor.id,
          },
        });
      }
    }
    const fulfilled = next === "COMPLETED" || next === "DELIVERED";
    if (fulfilled) {
      if (order.pickupAttempts >= 5)
        return { error: "Pickup verification locked after five attempts" };
      const supplied = hash(options.code || "");
      if (
        !order.pickupHash ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(order.pickupHash))
      ) {
        await tx.order.update({
          where: { id },
          data: { pickupAttempts: { increment: 1 } },
        });
        return { error: "Invalid pickup code" };
      }
      if (
        ["PICKUP", "COD"].includes(order.payment?.method || "") &&
        !options.collected
      )
        throw new ApiError(400, "Confirm payment was collected");
      if (
        !["PICKUP", "COD"].includes(order.payment?.method || "") &&
        order.payment?.status !== "SIMULATED_PAID"
      )
        throw new ApiError(409, "Payment is not verified");
    }
    if (
      ["COMPLETED", "DELIVERED", "CANCELLED", "REJECTED", "EXPIRED"].includes(
        next,
      )
    ) {
      for (const r of order.reservations
        .filter((r) => !r.releasedAt)
        .sort((a, b) => a.variantId.localeCompare(b.variantId))) {
        const sold = fulfilled || event?.discardReturned ? r.quantity : 0;
        await tx.inventory.update({
          where: { variantId: r.variantId },
          data: {
            onHand: { decrement: sold },
            reserved: { decrement: r.quantity },
          },
        });
        await tx.reservation.update({
          where: { id: r.id },
          data: { releasedAt: new Date() },
        });
        await tx.inventoryMovement.create({
          data: {
            variantId: r.variantId,
            orderId: id,
            onHandDelta: -sold,
            reservedDelta: -r.quantity,
            reason: fulfilled
              ? "SALE"
              : event?.discardReturned
                ? "RETURN_WASTAGE"
                : "RELEASE",
            actorId: actor.id,
          },
        });
        const stock = await tx.inventory.findUniqueOrThrow({
          where: { variantId: r.variantId },
        });
        if (stock.onHand - stock.reserved <= stock.lowStock)
          await queueNotification(tx, {
            eventId: `${id}:${next}:low-stock:${r.variantId}`,
            userId: order.shop.ownerId,
            type: "LOW_STOCK",
            title: "Low stock",
            body: "Review inventory for variant " + r.variantId,
          });
      }
      if (order.payment?.status === "SIMULATED_PAID" && !fulfilled) {
        await tx.payment.update({
          where: { orderId: id },
          data: { status: "SIMULATED_REFUNDED" },
        });
        await tx.refund.create({
          data: {
            orderId: id,
            customerId: order.customerId,
            amountPaise: order.totalPaise,
            reason: "Order " + next,
            status: "SIMULATED_REFUNDED",
          },
        });
      }
      if (fulfilled && ["PICKUP", "COD"].includes(order.payment?.method || ""))
        await tx.payment.update({
          where: { orderId: id },
          data: {
            status:
              order.payment?.method === "COD"
                ? "COLLECTED_COD"
                : "COLLECTED_AT_PICKUP",
          },
        });
    }
    const nonce = ["READY_FOR_PICKUP", "AWAITING_RIDER"].includes(next)
      ? randomBytes(24).toString("hex")
      : undefined;
    if (order.delivery) {
      const deliveryStatus =
        next === "AWAITING_RIDER"
          ? "AWAITING_RIDER"
          : next === "DELIVERED"
            ? "DELIVERED"
            : ["CANCELLED", "REJECTED", "EXPIRED"].includes(next)
              ? "CANCELLED"
              : next;
      if (
        [
          "AWAITING_RIDER",
          "RIDER_ASSIGNED",
          "RIDER_PICKED_UP",
          "OUT_FOR_DELIVERY",
          "DELIVERED",
          "DELIVERY_FAILED",
          "CANCELLED",
          "REJECTED",
          "EXPIRED",
        ].includes(next)
      )
        await tx.delivery.update({
          where: { id: order.delivery.id },
          data: {
            status: deliveryStatus,
            ...(next === "AWAITING_RIDER"
              ? {
                  trackingReference:
                    logisticsProvider().createDelivery(id).reference,
                }
              : {}),
            ...(event?.riderName ? { riderName: event.riderName } : {}),
            ...(next === "DELIVERED"
              ? { proofReference: "customer-code-verified:" + event?.eventId }
              : {}),
            ...(event?.returned ? { returnedAt: new Date() } : {}),
            ...(event
              ? {
                  events: {
                    create: {
                      eventId: event.eventId,
                      requestHash: eventHash,
                      status: next,
                      actorId: actor.id,
                      note: event.note,
                    },
                  },
                }
              : {}),
          },
        });
    }
    if (dispatcher)
      await tx.auditLog.create({
        data: { actorId: actor.id, action: "DELIVERY_" + next, targetId: id },
      });
    const history = (
      next === "COMPLETED"
        ? [
            { status: "PICKUP_COMPLETED", reason: "Pickup code verified" },
            { status: "COMPLETED", reason: options.reason },
          ]
        : [
            { status: next, reason: options.reason || event?.note },
            ...(next === "DELIVERED"
              ? [{ status: "COMPLETED", reason: "Delivery proof verified" }]
              : []),
          ]
    ).map((entry, index) => ({
      ...entry,
      createdAt: new Date(Date.now() + index),
    }));
    const transitionTime = new Date();
    const updated = await tx.order.update({
      where: { id },
      data: {
        status: fulfilled ? "COMPLETED" : next,
        version: { increment: 1 },
        ...(next === "ACCEPTED"
          ? {
              acceptedAt: transitionTime,
              preparationDurationMinutes: z
                .number()
                .int()
                .min(1)
                .max(240)
                .parse(options.preparationDurationMinutes ?? 20),
              estimatedReadyAt: new Date(
                transitionTime.getTime() +
                  z
                    .number()
                    .int()
                    .min(1)
                    .max(240)
                    .parse(options.preparationDurationMinutes ?? 20) *
                    60000,
              ),
            }
          : {}),
        ...(next === "PREPARING" ? { preparationStartedAt: new Date() } : {}),
        ...(["READY_FOR_PICKUP", "AWAITING_RIDER"].includes(next)
          ? { readyAt: new Date() }
          : {}),
        ...(nonce
          ? { pickupNonce: nonce, pickupHash: hash(pickupCode(id, nonce)) }
          : {}),
        ...(next === "ACCEPTED"
          ? { expiresAt: new Date(Date.now() + 24 * 3600000) }
          : {}),
        ...(fulfilled ? { completedAt: new Date() } : {}),
        history: { create: history },
      },
      include: orderInclude,
    });
    await queueOrderEvent(tx, updated, next);
    return { order: updated };
  });
  if (result.error) throw new ApiError(429, result.error);
  return result.order;
}
export function presentOrder(order: any, customer: boolean) {
  const {
    pickupHash: _hash,
    pickupNonce,
    requestHash: _request,
    ...safe
  } = order;
  return {
    ...safe,
    serverTime: new Date().toISOString(),
    shop: order.shop
      ? {
          id: order.shop.id,
          name: order.shop.name,
          address: order.shop.address,
          latitude: order.shop.latitude,
          longitude: order.shop.longitude,
          preparationMinutes: order.shop.preparationMinutes,
          phone: order.shop.phone,
          pickupInstructions: order.shop.pickupInstructions,
        }
      : undefined,
    pickupCode:
      customer &&
      pickupNonce &&
      [
        "READY_FOR_PICKUP",
        "AWAITING_RIDER",
        "RIDER_ASSIGNED",
        "RIDER_PICKED_UP",
        "OUT_FOR_DELIVERY",
        "DELIVERY_FAILED",
      ].includes(order.status)
        ? pickupCode(order.id, pickupNonce)
        : undefined,
  };
}
