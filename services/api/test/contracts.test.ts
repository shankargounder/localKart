import { describe, it, expect } from "vitest";
import { lineTotal, orderSchema, transitions } from "@localkart/shared";
describe("Checkout contracts", () => {
  it("calculates paise using decimal safe thousandths", () => {
    expect(lineTotal(19900, 1250)).toBe(24875);
    expect(lineTotal(1, 500)).toBe(1);
  });
  it("rejects duplicate variants and negative quantities", () => {
    const variantId = "00000000-0000-4000-8000-000000000001";
    expect(
      orderSchema.safeParse({
        shopId: variantId,
        items: [
          { variantId, quantity: 1000 },
          { variantId, quantity: 1000 },
        ],
      }).success,
    ).toBe(false);
    expect(
      orderSchema.safeParse({
        shopId: variantId,
        items: [{ variantId, quantity: -1 }],
      }).success,
    ).toBe(false);
  });
  it("requires preparation and pickup verification before completion", () => {
    expect(transitions.ACCEPTED).not.toContain("COMPLETED");
    expect(transitions.READY_FOR_PICKUP).toContain("COMPLETED");
    expect(transitions.COMPLETED).toEqual([]);
  });
});
