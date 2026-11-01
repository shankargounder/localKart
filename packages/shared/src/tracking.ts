export function clockOffset(
  serverTime: string,
  startedAt: number,
  receivedAt: number,
) {
  return Date.parse(serverTime) - (startedAt + receivedAt) / 2;
}
export function pickupCountdown(
  order: {
    status: string;
    fulfillmentType: string;
    estimatedReadyAt?: string | null;
  },
  nowMs: number,
) {
  if (order.fulfillmentType !== "PICKUP")
    return {
      seconds: null,
      label: "Delivery follows the most recently verified courier status.",
    };
  if (order.status === "PENDING_ACCEPTANCE")
    return { seconds: null, label: "Waiting for shop confirmation." };
  if (order.status === "READY_FOR_PICKUP")
    return { seconds: null, label: "Your order is ready for pickup." };
  if (!["ACCEPTED", "PREPARING"].includes(order.status))
    return {
      seconds: null,
      label:
        order.status === "COMPLETED"
          ? "Your order has been completed."
          : order.status.replaceAll("_", " "),
    };
  if (!order.estimatedReadyAt)
    return {
      seconds: null,
      label: "The shop has not confirmed a readiness estimate yet.",
    };
  const seconds = Math.max(
    0,
    Math.ceil((Date.parse(order.estimatedReadyAt) - nowMs) / 1000),
  );
  return {
    seconds,
    label:
      seconds === 0
        ? "Your order is taking longer than estimated. Waiting for shop update."
        : order.status === "PREPARING"
          ? "Your order is being prepared."
          : "Order accepted. This is an estimated readiness time.",
  };
}
