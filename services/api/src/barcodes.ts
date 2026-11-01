import { normalizeBarcode } from "@localkart/shared";
export async function lookupFoodBarcode(
  barcode: string,
  fetcher: typeof fetch = fetch,
) {
  const normalized = normalizeBarcode(barcode);
  const response = await fetcher(
    "https://world.openfoodfacts.org/api/v2/product/" +
      normalized +
      ".json?fields=code,product_name,product_name_en,generic_name,brands,quantity",
    {
      headers: {
        "User-Agent":
          "LocalKart/0.2 (merchant barcode product lookup; development demo)",
      },
      signal: AbortSignal.timeout(5000),
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Catalog is temporarily unavailable");
  const data = (await response.json()) as any;
  if (data.status !== 1 || !data.product) return null;
  const p = data.product;
  const text = (value: unknown, max: number) =>
    typeof value === "string" ? value.trim().slice(0, max) : "";
  const name = text(p.product_name || p.product_name_en, 150);
  if (!name) return null;
  return {
    name,
    brand: text(p.brands, 100),
    description: text(p.generic_name, 2000),
    label: text(p.quantity, 100) || "Standard",
    source: "OPENFOODFACTS" as const,
    sourceUrl: "https://world.openfoodfacts.org/product/" + normalized,
    license:
      "ODbL — Open Food Facts. Review source and attribution before publishing.",
  };
}
