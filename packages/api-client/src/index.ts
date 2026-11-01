import type { SmartSearchResponse } from "@localkart/shared";
export type Transport = (
  path: string,
  method?: string,
  body?: unknown,
  key?: string,
) => Promise<any>;
export function createMarketplaceClient(request: Transport) {
  return {
    search: (params: Record<string, string | number>) =>
      request(
        "/discovery/search?" +
          new URLSearchParams(
            Object.entries(params).map(([k, v]) => [k, String(v)]),
          ),
      ) as Promise<SmartSearchResponse>,
    addresses: () => request("/customers/addresses"),
    quote: (shopId: string, addressId: string) =>
      request("/delivery/quotes", "POST", { shopId, addressId }),
    offlineSale: (body: unknown, key: string) =>
      request("/merchant/offline-sales", "POST", body, key),
    report: () => request("/merchant/reports"),
  };
}
