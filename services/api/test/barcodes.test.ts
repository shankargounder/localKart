import { describe, it, expect } from "vitest";
import { normalizeBarcode } from "@localkart/shared";
import { lookupFoodBarcode } from "../src/barcodes.js";
describe("retail barcodes", () => {
  it("validates check digits and normalizes UPC/EAN aliases", () => {
    expect(normalizeBarcode("036000291452")).toBe("00036000291452");
    expect(normalizeBarcode("0036000291452")).toBe("00036000291452");
    expect(normalizeBarcode("4006381333931")).toBe("04006381333931");
    for (const code of [
      "4006381333932",
      "https://example.test",
      "123",
      "abc",
      "0000000000000x",
    ])
      expect(() => normalizeBarcode(code)).toThrow();
  });
  it("returns constrained metadata without copying prices/images from an external provider", async () => {
    const mock = async (url: any, options: any) => {
      expect(String(url)).toContain("04006381333931");
      expect(options.headers["User-Agent"]).toContain("LocalKart");
      return new Response(
        JSON.stringify({
          status: 1,
          product: {
            product_name: "Example food",
            brands: "Demo brand",
            quantity: "200 g",
            generic_name: "Food description",
            price: 1,
            image_url: "https://untrusted.example/image.jpg",
          },
        }),
        { status: 200 },
      );
    };
    const result = await lookupFoodBarcode(
      "4006381333931",
      mock as typeof fetch,
    );
    expect(result).toMatchObject({
      name: "Example food",
      brand: "Demo brand",
      label: "200 g",
      source: "OPENFOODFACTS",
    });
    expect(result).not.toHaveProperty("price");
    expect(result).not.toHaveProperty("image_url");
  });
  it("supports no match and fails safely when the provider is down", async () => {
    expect(
      await lookupFoodBarcode(
        "4006381333931",
        (async () =>
          new Response(JSON.stringify({ status: 0 }), {
            status: 200,
          })) as typeof fetch,
      ),
    ).toBeNull();
    await expect(
      lookupFoodBarcode(
        "4006381333931",
        (async () => new Response("", { status: 503 })) as typeof fetch,
      ),
    ).rejects.toThrow();
  });
});
