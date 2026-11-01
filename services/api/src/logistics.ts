import { distanceKm } from "@localkart/shared";
import { ApiError } from "./errors.js";
import { config } from "./config.js";
import { db } from "./db.js";

export interface LogisticsProvider {
  name: string;
  checkServiceability(
    shop: { latitude: number; longitude: number; deliveryRadiusKm: number },
    address: { latitude: number; longitude: number },
  ): { serviceable: boolean; distanceKm: number };
  getQuote(distanceKm: number): { feePaise: number; estimate: string | null };
  createDelivery(orderId: string): { reference: string };
  getDeliveryStatus(
    reference: string,
  ): Promise<{ reference: string; status: string }>;
  cancelDelivery(reference: string): { reference: string; cancelled: boolean };
  verifyWebhook(payload: Buffer, signature: string): boolean;
}
class PilotProvider implements LogisticsProvider {
  constructor(public name: "MOCK" | "MANUAL") {}
  checkServiceability(
    shop: { latitude: number; longitude: number; deliveryRadiusKm: number },
    address: { latitude: number; longitude: number },
  ) {
    const distance = distanceKm(shop, address);
    return {
      serviceable: distance <= shop.deliveryRadiusKm,
      distanceKm: distance,
    };
  }
  getQuote(distance: number) {
    return { feePaise: 3000 + Math.ceil(distance) * 500, estimate: null };
  }
  createDelivery(orderId: string) {
    return { reference: this.name.toLowerCase() + ":" + orderId };
  }
  async getDeliveryStatus(reference: string) {
    const delivery = await db.delivery.findFirst({
      where: { trackingReference: reference },
    });
    if (!delivery) throw new ApiError(404, "Delivery booking not found");
    return { reference, status: delivery.status };
  }
  cancelDelivery(reference: string) {
    return { reference, cancelled: true };
  }
  // Pilot updates use authenticated/admin-audited endpoints, never public unsigned webhooks.
  verifyWebhook(_payload: Buffer, _signature: string) {
    return false;
  }
}
export function logisticsProvider() {
  if (config.NODE_ENV !== "production") return new PilotProvider("MOCK");
  if (config.ENABLE_MANUAL_DELIVERY === "true")
    return new PilotProvider("MANUAL");
  throw new ApiError(503, "Delivery is not configured");
}
