import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db.js";

const synonyms: Record<string, string> = {
  tomatoes: "tomato",
  tamatar: "tomato",
  aloo: "potato",
  potatoes: "potato",
  onions: "onion",
  notebooks: "notebook",
  chargers: "charger",
  cables: "cable",
  bhindi: "okra",
};
export function normalizeSearch(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .map((word) => synonyms[word] || word)
    .join(" ");
}
const querySchema = z.object({
  q: z.string().max(120).default(""),
  lat: z.coerce.number().min(-85).max(85),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce
    .number()
    .refine((v) => [1, 2, 5, 10, 15, 25].includes(v))
    .optional(),
  categoryId: z.string().uuid().optional(),
  available: z.enum(["true", "false"]).default("true"),
  sort: z.enum(["distance", "price-asc", "price-desc"]).default("distance"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export const discoveryRouter = Router();
discoveryRouter.get("/search", async (req, res) => {
  const q = querySchema.parse(req.query);
  const term = normalizeSearch(q.q);
  const max = q.radius || 10;
  const latDelta = max / 111;
  const lngDelta = max / (111 * Math.cos((q.lat * Math.PI) / 180));
  const sorting =
    q.sort === "price-asc"
      ? Prisma.sql`"pricePaise" ASC, "distanceKm" ASC`
      : q.sort === "price-desc"
        ? Prisma.sql`"pricePaise" DESC, "distanceKm" ASC`
        : Prisma.sql`"distanceKm" ASC, "pricePaise" ASC`;
  const rows = await db.$queryRaw<
    { results: any; total: number; radiusKm: number }[]
  >(Prisma.sql`
  WITH candidates AS (
   SELECT p.id AS "productId", v.id AS "variantId", p.name, p.brand, p.unit, v.label,
    (SELECT pi.url FROM "ProductImage" pi WHERE pi."productId"=p.id ORDER BY pi."isDemo",pi."createdAt" LIMIT 1) AS "imageUrl", (SELECT pi.alt FROM "ProductImage" pi WHERE pi."productId"=p.id ORDER BY pi."isDemo",pi."createdAt" LIMIT 1) AS "imageAlt",
    v."pricePaise", (i."onHand"-i.reserved>0) AS available,
    s.id AS "shopId",s.name AS "shopName",c.name AS "categoryName",s.latitude,s.longitude,
    6371*2*asin(least(1.0,sqrt(power(sin(radians(s.latitude-${q.lat})/2),2)+cos(radians(${q.lat}))*cos(radians(s.latitude))*power(sin(radians(s.longitude-${q.lng})/2),2)))) AS "distanceKm",
    (s.open AND s."acceptingOrders" AND NOT s."holidayMode") AS "pickupEligible",
    (s."deliveryEnabled" AND s.open AND s."acceptingOrders" AND NOT s."holidayMode") AS "deliveryEligible",s."preparationMinutes"
   FROM "Product" p JOIN "Variant" v ON v."productId"=p.id JOIN "Inventory" i ON i."variantId"=v.id
   JOIN "Shop" s ON s.id=p."shopId" JOIN "User" u ON u.id=s."ownerId" JOIN "Category" c ON c.id=p."categoryId"
   WHERE p.active AND NOT c.restricted AND s.approval='APPROVED' AND NOT u.suspended
    AND s.latitude BETWEEN ${q.lat - latDelta} AND ${q.lat + latDelta}
    AND s.longitude BETWEEN ${q.lng - lngDelta} AND ${q.lng + lngDelta}
    AND (${!q.categoryId} OR c.id=${q.categoryId || null}::uuid)
    AND (${term === ""} OR p."searchDocument" @@ websearch_to_tsquery('simple',${term}) OR v.label ILIKE ${"%" + term + "%"} OR c.name ILIKE ${"%" + term + "%"})
  ), chosen AS (
   SELECT coalesce(${q.radius || null}::float8,(SELECT min(r) FROM unnest(ARRAY[1,2,5,10]) r WHERE EXISTS(SELECT 1 FROM candidates WHERE "distanceKm"<=r AND available AND "pickupEligible")),10) AS radius
  ), filtered AS (
   SELECT candidates.* FROM candidates,chosen WHERE "distanceKm"<=chosen.radius AND (${q.available === "false"} OR available)
  ), paged AS (SELECT * FROM filtered ORDER BY ${sorting},"variantId" LIMIT ${q.limit} OFFSET ${q.offset})
  SELECT coalesce((SELECT jsonb_agg(paged) FROM paged),'[]'::jsonb) AS results,
   (SELECT count(*)::int FROM filtered) AS total,(SELECT radius FROM chosen) AS "radiusKm"
 `);
  const result = rows[0];
  res.json({
    ...result,
    expanded: !q.radius && result.radiusKm > 1,
    offset: q.offset,
    limit: q.limit,
    distanceType: "STRAIGHT_LINE",
  });
});
discoveryRouter.get("/suggestions", async (req, res) => {
  const term = normalizeSearch(
    z
      .string()
      .max(100)
      .parse(req.query.q || ""),
  );
  if (term.length < 2) {
    res.json([]);
    return;
  }
  const products = await db.product.findMany({
    where: {
      active: true,
      category: { restricted: false },
      shop: { approval: "APPROVED", owner: { suspended: false } },
      name: { contains: term, mode: "insensitive" },
    },
    select: { name: true },
    distinct: ["name"],
    take: 8,
  });
  res.json(products.map((p) => p.name));
});
