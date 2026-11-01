import { lineTotal, saleSchema } from "@localkart/shared";
import { ApiError, hash, transaction } from "./orders.js";

export async function recordOfflineSale(
  actorId: string,
  key: string,
  body: unknown,
) {
  const input = saleSchema.parse(body);
  const requestHash = hash(JSON.stringify(input));
  return transaction(async (tx) => {
    const shop = await tx.shop.findFirst({
      where: {
        id: input.shopId,
        ownerId: actorId,
        owner: { suspended: false },
      },
    });
    if (!shop) throw new ApiError(404, "Shop not found");
    const prior = await tx.offlineSale.findUnique({
      where: {
        shopId_idempotencyKey: { shopId: shop.id, idempotencyKey: key },
      },
      include: { items: true },
    });
    if (prior) {
      if (prior.requestHash !== requestHash)
        throw new ApiError(409, "Sale key reused with different items");
      return prior;
    }
    const items = [];
    for (const item of [...input.items].sort((a, b) =>
      a.variantId.localeCompare(b.variantId),
    )) {
      const variant = await tx.variant.findFirst({
        where: {
          id: item.variantId,
          product: {
            shopId: shop.id,
            active: true,
            category: { restricted: false },
          },
        },
        include: { product: true },
      });
      if (!variant) throw new ApiError(400, "Product unavailable");
      if (
        ["PIECE", "PACKET"].includes(variant.product.unit) &&
        item.quantity % 1000 !== 0
      )
        throw new ApiError(400, "Whole units required");
      const count =
        await tx.$executeRaw`UPDATE "Inventory" SET "onHand"="onHand"-${item.quantity} WHERE "variantId"=${variant.id}::uuid AND "onHand"-reserved>=${item.quantity}`;
      if (count !== 1)
        throw new ApiError(
          409,
          "Not enough unreserved stock for " + variant.product.name,
        );
      items.push({
        variantId: variant.id,
        name: variant.product.name,
        unit: variant.product.unit,
        quantity: item.quantity,
        pricePaise: variant.pricePaise,
        totalPaise: lineTotal(variant.pricePaise, item.quantity),
      });
    }
    const totalPaise = items.reduce((sum, i) => sum + i.totalPaise, 0);
    if (totalPaise > 2000000000)
      throw new ApiError(400, "Sale exceeds total limit");
    const sale = await tx.offlineSale.create({
      data: {
        shopId: shop.id,
        actorId,
        idempotencyKey: key,
        requestHash,
        totalPaise,
        paymentMethod: input.paymentMethod,
        items: { create: items },
      },
      include: { items: true },
    });
    for (const item of items)
      await tx.inventoryMovement.create({
        data: {
          variantId: item.variantId,
          onHandDelta: -item.quantity,
          reservedDelta: 0,
          reason: "OFFLINE_SALE:" + sale.id,
          actorId,
        },
      });
    return sale;
  });
}
