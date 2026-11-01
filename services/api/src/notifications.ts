import type { Prisma } from "@prisma/client";
import { money } from "@localkart/shared";

export async function queueNotification(
  tx: Prisma.TransactionClient,
  input: {
    eventId: string;
    userId: string;
    orderId?: string;
    type: string;
    title: string;
    body: string;
  },
) {
  const notification = await tx.notification.upsert({
    where: { eventId: input.eventId },
    create: input,
    update: {},
  });
  await tx.notificationOutbox.upsert({
    where: { notificationId: notification.id },
    create: { notificationId: notification.id },
    update: {},
  });
  return notification;
}
const names: Record<string, string> = {
  ACCEPTED: "order.accepted",
  REJECTED: "order.rejected",
  PREPARING: "order.preparing",
  READY_FOR_PICKUP: "order.ready",
  AWAITING_RIDER: "order.ready",
  RIDER_ASSIGNED: "order.rider_assigned",
  RIDER_PICKED_UP: "order.rider_picked_up",
  OUT_FOR_DELIVERY: "order.out_for_delivery",
  DELIVERED: "order.delivered",
  COMPLETED: "order.pickup_completed",
  CANCELLED: "order.cancelled",
  EXPIRED: "order.expired",
  DELIVERY_FAILED: "order.delivery_failed",
};
export async function queueOrderEvent(
  tx: Prisma.TransactionClient,
  order: any,
  state: string,
  request?: { eventId: string; requestHash: string },
) {
  const type = state === "CREATED" ? "order.created" : names[state] || state;
  const eventId = request?.eventId || `${order.id}:${order.version}:${type}`;
  await tx.realtimeEvent.upsert({
    where: { eventId },
    create: {
      eventId,
      orderId: order.id,
      type,
      version: order.version,
      requestHash: request?.requestHash,
    },
    update: {},
  });
  const short = "#" + order.id.slice(0, 8).toUpperCase();
  const shopName = order.shop.name;
  if (state === "CREATED") {
    await queueNotification(tx, {
      eventId: eventId + ":merchant",
      userId: order.shop.ownerId,
      orderId: order.id,
      type,
      title: "🛒 New Order Received!",
      body: `Order ${short} • ${order.items.length} items • ${money(order.totalPaise)}. Tap to review and accept.`,
    });
    return;
  }
  const pickup = order.fulfillmentType === "PICKUP";
  const content: Record<string, [string, string]> = {
    ACCEPTED: [
      "✅ Your Order Is Confirmed",
      `${shopName} accepted order ${short}. ${pickup ? "Estimated pickup readiness" : "Confirmed shop preparation"} in ${order.preparationDurationMinutes} minutes.`,
    ],
    PREPARING: [
      "Your order is being prepared",
      `${shopName} has started preparing order ${short}.`,
    ],
    READY_FOR_PICKUP: [
      "🎉 Your Order Is Ready!",
      `Order ${short} is ready at ${shopName}. Your order is ready for pickup. You can collect it now.`,
    ],
    AWAITING_RIDER: [
      "Your package is ready for dispatch",
      `${shopName} has prepared order ${short}. Waiting for verified rider assignment.`,
    ],
    RIDER_ASSIGNED: [
      "Delivery partner assigned",
      `A dispatcher recorded a rider for order ${short}.`,
    ],
    RIDER_PICKED_UP: [
      "Rider collected your order",
      `The handover for order ${short} was confirmed.`,
    ],
    OUT_FOR_DELIVERY: [
      "Your order is out for delivery",
      `Order ${short} is out for delivery. No live rider location is available.`,
    ],
    DELIVERED: [
      "Your order was delivered",
      `Delivery of order ${short} was verified.`,
    ],
    COMPLETED: [
      "Pickup completed",
      `Order ${short} was collected and verified at ${shopName}.`,
    ],
    CANCELLED: [
      "Order cancelled",
      `Order ${short} at ${shopName} was cancelled.`,
    ],
    REJECTED: [
      "Shop could not accept your order",
      `${shopName} rejected order ${short}. Check the order for details.`,
    ],
    EXPIRED: [
      "Order window expired",
      `Order ${short} expired before verified handover.`,
    ],
    DELIVERY_FAILED: [
      "Delivery needs attention",
      `The dispatcher recorded a failed delivery for order ${short}. Check the latest verified status.`,
    ],
    "order.pickup_eta_updated": [
      "Pickup estimate updated",
      `${shopName} updated the preparation estimate for order ${short}. Open the order for the confirmed time.`,
    ],
    "order.preparation_eta_updated": [
      "Preparation estimate updated",
      `${shopName} updated the shop preparation estimate. This is not a courier delivery ETA.`,
    ],
  };
  const [title, body] = content[state] || [
    "Order updated",
    `Order ${short} has an update.`,
  ];
  await queueNotification(tx, {
    eventId: eventId + ":customer",
    userId: order.customerId,
    orderId: order.id,
    type,
    title,
    body,
  });
  if (["CANCELLED", "RIDER_ASSIGNED", "DELIVERY_FAILED"].includes(state))
    await queueNotification(tx, {
      eventId: eventId + ":merchant",
      userId: order.shop.ownerId,
      orderId: order.id,
      type,
      title,
      body,
    });
}
