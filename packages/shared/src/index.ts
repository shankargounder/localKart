import { normalizeBarcode } from "./barcodes";
export { normalizeBarcode } from "./barcodes";
import { z } from "zod";
export { clockOffset, pickupCountdown } from "./tracking";
export const roles = ["CUSTOMER", "MERCHANT", "ADMIN"] as const;
export const statuses = [
  "PENDING_ACCEPTANCE",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "PICKUP_COMPLETED",
  "AWAITING_RIDER",
  "RIDER_ASSIGNED",
  "RIDER_PICKED_UP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type OrderStatus = (typeof statuses)[number];
export const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_ACCEPTANCE: ["ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED"],
  ACCEPTED: ["PREPARING", "CANCELLED", "EXPIRED"],
  PREPARING: ["READY_FOR_PICKUP", "AWAITING_RIDER", "CANCELLED", "EXPIRED"],
  READY_FOR_PICKUP: ["PICKUP_COMPLETED", "COMPLETED", "CANCELLED", "EXPIRED"],
  PICKUP_COMPLETED: ["COMPLETED"],
  AWAITING_RIDER: ["RIDER_ASSIGNED", "CANCELLED", "EXPIRED"],
  RIDER_ASSIGNED: ["RIDER_PICKED_UP", "CANCELLED", "EXPIRED"],
  RIDER_PICKED_UP: ["OUT_FOR_DELIVERY", "DELIVERY_FAILED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERED: ["COMPLETED"],
  DELIVERY_FAILED: ["CANCELLED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
};
export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(254),
  password: z.string().min(10).max(128),
  role: z.enum(["CUSTOMER", "MERCHANT"]).default("CUSTOMER"),
});
export const loginSchema = registerSchema.pick({ email: true, password: true });
export const orderSchema = z
  .object({
    shopId: z.string().uuid(),
    paymentMethod: z.enum(["PICKUP", "COD", "SIMULATED"]).default("PICKUP"),
    fulfillmentType: z.enum(["PICKUP", "DELIVERY"]).default("PICKUP"),
    quoteId: z.string().uuid().optional(),
    packingPreferences: z.string().max(500).default(""),
    items: z
      .array(
        z.object({
          variantId: z.string().uuid(),
          quantity: z.number().int().positive().max(1000000),
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((v, c) => {
    if (new Set(v.items.map((i) => i.variantId)).size !== v.items.length)
      c.addIssue({ code: "custom", message: "Duplicate product variants" });
    if (v.fulfillmentType === "DELIVERY" && !v.quoteId)
      c.addIssue({
        code: "custom",
        message: "Delivery requires a current quote",
      });
    if (
      (v.fulfillmentType === "DELIVERY" && v.paymentMethod === "PICKUP") ||
      (v.fulfillmentType === "PICKUP" && v.paymentMethod === "COD")
    )
      c.addIssue({
        code: "custom",
        message: "Payment method does not match fulfillment",
      });
  });
// Quantities use thousandths of the displayed unit; prices are paise per unit.
export function lineTotal(pricePaise: number, quantityMilli: number) {
  return Number((BigInt(pricePaise) * BigInt(quantityMilli) + 500n) / 1000n);
}
export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    paise / 100,
  );
export const shopSchema = z.object({
  name: z.string().min(2).max(120),
  categoryId: z.string().uuid(),
  address: z.string().min(5).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  description: z.string().max(2000).default(""),
  phone: z.string().max(20).default(""),
  preparationMinutes: z.number().int().min(5).max(240).default(20),
});
export const productSchema = z.object({
  name: z.string().min(2).max(150),
  description: z.string().max(2000).default(""),
  categoryId: z.string().uuid(),
  brand: z.string().max(100).default(""),
  sku: z.string().max(100).optional(),
  barcode: z
    .string()
    .refine((value) => {
      try {
        normalizeBarcode(value);
        return true;
      } catch {
        return false;
      }
    }, "A valid retail barcode is required")
    .optional(),
  catalogSource: z.enum(["OPENFOODFACTS", "MANUAL"]).optional(),
  keywords: z.string().max(500).default(""),
  unit: z.enum(["PIECE", "PACKET", "KILOGRAM", "GRAM", "MILLILITER", "LITER"]),
  pricePaise: z.number().int().min(1).max(100000000),
  stockMilli: z.number().int().min(0).max(100000000),
  lowStockMilli: z.number().int().min(0).default(2000),
  label: z.string().min(1).max(100).default("Standard"),
});
export const addressSchema = z.object({
  label: z.string().min(1).max(50),
  recipient: z.string().min(2).max(100),
  phone: z.string().regex(/^[+\d\s-]{7,20}$/),
  line1: z.string().min(5).max(300),
  locality: z.string().min(2).max(100),
  postalCode: z.string().regex(/^\d{6}$/),
  latitude: z.number().min(-85).max(85),
  longitude: z.number().min(-180).max(180),
});
export const saleSchema = z
  .object({
    shopId: z.string().uuid(),
    paymentMethod: z.enum(["CASH", "UPI", "CARD"]),
    items: z
      .array(
        z.object({
          variantId: z.string().uuid(),
          quantity: z.number().int().positive().max(1000000),
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((v, c) => {
    if (new Set(v.items.map((i) => i.variantId)).size !== v.items.length)
      c.addIssue({ code: "custom", message: "Duplicate variants" });
  });
export function commissionFee(
  merchandisePaise: number,
  basisPoints: number,
  minimumPaise = 0,
  waived = false,
) {
  return waived
    ? 0
    : Math.min(
        merchandisePaise,
        Math.max(
          minimumPaise,
          Number(
            (BigInt(merchandisePaise) * BigInt(basisPoints) + 5000n) / 10000n,
          ),
        ),
      );
}
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = Math.PI / 180;
  return (
    6371 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(((a.latitude - b.latitude) * rad) / 2) ** 2 +
            Math.cos(a.latitude * rad) *
              Math.cos(b.latitude * rad) *
              Math.sin(((a.longitude - b.longitude) * rad) / 2) ** 2,
        ),
      ),
    )
  );
}
export interface SearchResult {
  imageUrl?: string;
  imageAlt?: string;
  productId: string;
  variantId: string;
  name: string;
  brand: string;
  label: string;
  unit: string;
  pricePaise: number;
  available: boolean;
  shopId: string;
  shopName: string;
  categoryName: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  pickupEligible: boolean;
  deliveryEligible: boolean;
  preparationMinutes: number;
}
export interface SmartSearchResponse {
  results: SearchResult[];
  radiusKm: number;
  expanded: boolean;
  total: number;
  offset: number;
  limit: number;
  distanceType: "STRAIGHT_LINE";
}
export interface PhoneOtpProvider {
  requestCode(phone: string): Promise<{ requestId: string }>;
  verifyCode(requestId: string, code: string): Promise<{ phone: string }>;
}
