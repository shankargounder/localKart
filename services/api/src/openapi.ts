import { z } from "zod";
import {
  addressSchema,
  orderSchema,
  productSchema,
  saleSchema,
  registerSchema,
  loginSchema,
} from "@localkart/shared";
const operations: [string, string, string, string?][] = [
  [
    "get",
    "/merchant/shops/{id}/barcodes/{barcode}",
    "Owned retail barcode lookup; optional food metadata and manual fallback",
  ],
  ["get", "/time", "Server clock for persisted ETA countdowns"],
  [
    "post",
    "/devices/push-token",
    "Register or rotate an owned Expo device token",
  ],
  [
    "delete",
    "/devices/push-token",
    "Disable an owned device push registration",
  ],
  ["get", "/notifications/unread-count", "Owned unread and new-order counts"],
  ["patch", "/notifications/read-all", "Mark owned notifications read"],
  ["patch", "/notifications/{id}/read", "Mark one owned notification read"],
  ["get", "/notifications/preferences", "Push and sound preferences"],
  ["patch", "/notifications/preferences", "Update push and sound preferences"],
  ["get", "/orders/{id}/timeline", "Authorized persisted order timeline"],
  [
    "patch",
    "/orders/{id}/notifications/read",
    "Mark owned linked notifications read",
  ],
  [
    "patch",
    "/merchant/orders/{id}/estimated-ready-time",
    "Idempotent confirmed preparation ETA update",
  ],
  [
    "post",
    "/merchant/products/{id}/images",
    "Owned multipart licensed photograph upload",
  ],
  [
    "get",
    "/admin/notifications",
    "Redacted queue, attempt and receipt monitor",
  ],
  [
    "get",
    "/admin/notification-test-devices",
    "Opted-in test devices without tokens",
  ],
  [
    "post",
    "/admin/notifications/test",
    "Queue a fixed test for one opted-in device",
  ],
  ["get", "/health", "Database readiness"],
  ["post", "/auth/register", "Register customer or merchant", "Registration"],
  ["post", "/auth/login", "Log in", "Login"],
  ["post", "/auth/refresh", "Rotate refresh token"],
  ["post", "/auth/logout", "Revoke refresh token"],
  ["post", "/auth/forgot-password", "Request password reset"],
  ["post", "/auth/reset-password", "Reset password"],
  ["get", "/categories", "List configurable categories"],
  ["get", "/shops/nearby", "Nearby approved shops"],
  ["get", "/shops/{id}", "Public shop details"],
  ["get", "/shops/{id}/products", "Shop catalogue"],
  ["get", "/products/search", "Legacy product lookup"],
  ["get", "/products/{id}", "Public product details"],
  ["get", "/discovery/search", "Full-text smart radius search"],
  ["get", "/discovery/suggestions", "Search suggestions"],
  ["get", "/users/me", "Current user"],
  ["patch", "/users/me", "Edit current user"],
  ["patch", "/users/notification-preferences", "Notification preferences"],
  ["get", "/features", "Disabled and enabled feature gates"],
  ["get", "/cart", "All shop carts; optional shopId filter"],
  ["post", "/cart/items", "Add or replace item quantity"],
  ["patch", "/cart/items/{id}", "Update owned quantity"],
  ["delete", "/cart/items/{id}", "Remove owned item"],
  ["post", "/orders", "Create idempotent order", "OrderInput"],
  ["get", "/orders", "Role-scoped orders"],
  ["get", "/orders/{id}", "Authorized order details"],
  ["post", "/orders/{id}/cancel", "Cancel eligible order"],
  [
    "post",
    "/payments/create",
    "Explicit development simulation after stock reservation",
  ],
  ["post", "/payments/webhook", "503 until an online provider is implemented"],
  ["get", "/customers/addresses", "Private address book"],
  ["post", "/customers/addresses", "Save address", "AddressInput"],
  ["delete", "/customers/addresses/{id}", "Archive owned address"],
  ["get", "/customers/favorites", "Favorite shops"],
  ["put", "/customers/favorites/{id}", "Favorite approved shop"],
  ["delete", "/customers/favorites/{id}", "Remove favorite"],
  ["get", "/customers/wishlist", "Product wishlist"],
  ["put", "/customers/wishlist/{id}", "Save product"],
  ["delete", "/customers/wishlist/{id}", "Remove product"],
  ["get", "/customers/shopping-lists", "Saved shopping lists"],
  ["post", "/customers/shopping-lists", "Save manual shopping list"],
  ["patch", "/customers/shopping-lists/{id}", "Edit owned shopping list"],
  [
    "post",
    "/customers/orders/{id}/reorder",
    "Reorder at current availability into a shop cart",
  ],
  ["post", "/customers/reviews", "Verified-purchase review"],
  ["get", "/customers/reviews", "Own reviews"],
  ["get", "/customers/refunds", "Own refund requests"],
  ["post", "/customers/refunds", "Request refund review"],
  ["post", "/delivery/quotes", "Serviceability and expiring bound quote"],
  [
    "post",
    "/delivery/events",
    "Admin-audited idempotent pilot event; delivery proof required",
  ],
  ["get", "/delivery/{id}/status", "Role-scoped delivery status"],
  ["post", "/delivery/webhook", "503; no unsigned external callback accepted"],
  ["get", "/support/tickets", "Role-scoped support tickets"],
  ["post", "/support/tickets", "Create support ticket"],
  ["get", "/merchant/shops", "Owned shops"],
  ["post", "/merchant/shops", "Merchant onboarding"],
  ["patch", "/merchant/shops/{id}", "Owned shop settings"],
  ["put", "/merchant/shops/{id}/hours", "Replace owned weekly hours"],
  ["get", "/merchant/products", "Owned catalogue"],
  [
    "post",
    "/merchant/shops/{id}/products",
    "Create stock-tracked product",
    "ProductInput",
  ],
  ["patch", "/merchant/products/{id}", "Edit or archive owned product"],
  ["post", "/merchant/products/{id}/variants", "Add stocked variant"],
  ["patch", "/merchant/variants/{id}", "Daily price and threshold changes"],
  ["get", "/merchant/inventory", "Owned inventory"],
  ["get", "/merchant/inventory/movements", "Immutable movement history"],
  ["post", "/merchant/inventory/adjustments", "Record stock adjustment"],
  [
    "post",
    "/merchant/offline-sales",
    "Idempotent in-store billing",
    "OfflineSaleInput",
  ],
  ["get", "/merchant/offline-sales", "Owned offline sales"],
  ["get", "/merchant/dashboard", "India business-day dashboard"],
  ["get", "/merchant/reports", "Online/offline report"],
  ["get", "/merchant/reports.csv", "Offline sale CSV export"],
  ...["accept", "reject", "preparing", "ready", "complete", "cancel"].map(
    (action) =>
      [
        "post",
        `/merchant/orders/{id}/${action}`,
        `Owned order action: ${action}`,
      ] as [string, string, string],
  ),
  ["get", "/notifications", "Owned database notifications"],
  ["post", "/notifications/devices", "Register Expo device token"],
  ["get", "/admin/dashboard", "Legacy marketplace counts"],
  ["get", "/admin/analytics", "GMV, fees, refunds and daily series"],
  ["get", "/admin/shops", "Inspect shops"],
  ["get", "/admin/shops/pending", "Approval queue"],
  ...["approve", "reject", "suspend"].map(
    (action) =>
      ["post", `/admin/shops/{id}/${action}`, `Audited shop ${action}`] as [
        string,
        string,
        string,
      ],
  ),
  ["get", "/admin/users", "Inspect users"],
  ["patch", "/admin/users/{id}", "Suspend/reactivate non-admin"],
  ["post", "/admin/categories", "Create category"],
  ["patch", "/admin/categories/{id}", "Hierarchy and restricted flag"],
  ["get", "/admin/products", "Moderation catalogue"],
  ["patch", "/admin/products/{id}", "Hide or restore product"],
  ["get", "/admin/inventory-anomalies", "Inventory invariant violations"],
  ["get", "/admin/deliveries", "Pilot delivery monitor and events"],
  ["get", "/admin/commissions", "Commission rule history"],
  ["post", "/admin/commissions", "Create future-order commission rule"],
  ["patch", "/admin/support/{id}", "Audited support resolution"],
  ["get", "/admin/refunds", "Inspect refunds"],
  [
    "patch",
    "/admin/refunds/{id}",
    "Approve/reject or confirm actual manual reimbursement",
  ],
  ["get", "/admin/audit", "Administrative audit log"],
];
const paths: Record<string, any> = {};
for (const [method, path, summary, schema] of operations) {
  const publicEndpoint =
    path === "/health" ||
    path === "/time" ||
    path.startsWith("/auth/") ||
    path.startsWith("/discovery/") ||
    (path === "/categories" && method === "get") ||
    path.startsWith("/shops/") ||
    path.startsWith("/products/");
  const parameters: any[] = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1],
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  }));
  if (
    (path === "/orders" && method === "post") ||
    (path === "/merchant/offline-sales" && method === "post")
  )
    parameters.push({
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: { type: "string", minLength: 8, maxLength: 100 },
    });
  if (path === "/discovery/search")
    parameters.push(
      ...[
        "q",
        "lat",
        "lng",
        "radius",
        "categoryId",
        "sort",
        "available",
        "limit",
        "offset",
      ].map((name) => ({
        name,
        in: "query",
        required: ["lat", "lng"].includes(name),
        schema: ["lat", "lng", "radius", "limit", "offset"].includes(name)
          ? { type: "number" }
          : { type: "string" },
        description:
          name === "radius"
            ? "Omit for 1→2→5→10 km; manual 1,2,5,10,15,25"
            : undefined,
      })),
    );
  const operation: any = {
    summary,
    security: publicEndpoint ? [] : [{ bearerAuth: [] }],
    parameters,
    responses: {
      "200": {
        description:
          "Success; some mutations return 201 Created or 204 No Content",
      },
      "201": { description: "Record created" },
      "204": { description: "Mutation completed" },
      "400": { description: "Invalid input" },
      "401": { description: "Authentication required" },
      "403": { description: "Role or ownership denied" },
      "409": { description: "State, stock, quote or idempotency conflict" },
      "429": { description: "Request or verification attempt limit" },
    },
  };
  if (schema)
    operation.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/" + schema },
        },
      },
    };
  (paths[path] ??= {})[method] = operation;
}
export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "LocalKart V2 API",
    version: "0.2.0",
    description:
      "Money is integer INR paise; quantities are thousandths of the displayed unit. Delivery and payment simulations are explicitly labelled. Domain details and non-schema request bodies are documented in docs/api-reference.md.",
  },
  servers: [{ url: "/api/v1" }],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: Object.fromEntries(
      Object.entries({
        AddressInput: addressSchema,
        OrderInput: orderSchema,
        ProductInput: productSchema,
        OfflineSaleInput: saleSchema,
        Registration: registerSchema,
        Login: loginSchema,
      }).map(([name, schema]) => [
        name,
        z.toJSONSchema(schema, { io: "input" }),
      ]),
    ),
  },
};
