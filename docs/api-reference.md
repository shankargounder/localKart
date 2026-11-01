# API reference

V2 operations and request details are documented in [V2 API](v2-api.md) and [OpenAPI](openapi.json). The original operations below remain available.

Base: `/api/v1`. JSON requests/responses. Bearer access JWT required except auth, health and public discovery. Error body: `{message, issues?}`. Lists support `limit` (1–100) and `offset`. Admin and merchant groups enforce roles. All merchant records enforce ownership. Quantities are integer thousandths, money integer paise.

| Method    | Path                                    | Contract                                                                          |
| --------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| GET       | /health                                 | PostgreSQL readiness                                                              |
| POST      | /auth/register                          | name,email,password,role CUSTOMER or MERCHANT                                     |
| POST      | /auth/login                             | email,password → user,accessToken,refreshToken                                    |
| POST      | /auth/refresh                           | refreshToken → rotated pair                                                       |
| POST      | /auth/logout                            | refreshToken → 204                                                                |
| POST      | /auth/forgot-password                   | email; local-only reset token response                                            |
| POST      | /auth/reset-password                    | token,password; revokes refresh sessions                                          |
| GET/PATCH | /users/me                               | profile; PATCH name                                                               |
| GET       | /categories                             | public categories                                                                 |
| GET       | /shops/nearby                           | lat,lng,radius≤50 km,q,categoryId                                                 |
| GET       | /shops/:id                              | approved shop, category, hours                                                    |
| GET       | /shops/:id/products                     | q, pagination                                                                     |
| GET       | /products/search                        | q, pagination                                                                     |
| GET       | /products/:id                           | product with variants                                                             |
| GET       | /cart                                   | current customer's persisted rows                                                 |
| POST      | /cart/items                             | variantId,quantity; upsert quantity                                               |
| PATCH     | /cart/items/:id                         | quantity                                                                          |
| DELETE    | /cart/items/:id                         | remove owned item                                                                 |
| POST      | /orders                                 | shopId,items[{variantId,quantity}],paymentMethod; Idempotency-Key header required |
| GET       | /orders                                 | role-scoped orders                                                                |
| GET       | /orders/:id                             | owner/merchant/admin detail                                                       |
| POST      | /orders/:id/cancel                      | permitted customer cancellation                                                   |
| POST      | /payments/create                        | orderId; simulation after reservation only                                        |
| POST      | /payments/webhook                       | 503: real collection disabled                                                     |
| GET       | /notifications                          | owned database events                                                             |
| POST      | /notifications/devices                  | Expo token registration                                                           |
| GET/POST  | /merchant/shops                         | owned shops / onboarding                                                          |
| PATCH     | /merchant/shops/:id                     | name,description,open,acceptingOrders,holidayMode,preparationMinutes              |
| GET       | /merchant/products                      | owned catalogue                                                                   |
| POST      | /merchant/shops/:id/products            | shared productSchema incl pricePaise,stockMilli                                   |
| PATCH     | /merchant/products/:id                  | name,description,active,discloseStock                                             |
| GET       | /merchant/inventory                     | stock rows and products                                                           |
| GET       | /merchant/inventory/movements           | append-only history                                                               |
| POST      | /merchant/inventory/adjustments         | variantId,delta,reason                                                            |
| POST      | /merchant/orders/:id/accept             | atomically reserves                                                               |
| POST      | /merchant/orders/:id/reject             | reason required                                                                   |
| POST      | /merchant/orders/:id/preparing          | accepted → preparing                                                              |
| POST      | /merchant/orders/:id/ready              | preparing → ready                                                                 |
| POST      | /merchant/orders/:id/complete           | code, collected true for pay-at-pickup                                            |
| POST      | /merchant/orders/:id/cancel             | merchant cancellation                                                             |
| GET       | /merchant/dashboard                     | orders, sales, low-stock summary                                                  |
| GET       | /admin/dashboard                        | platform counts and completed order value                                         |
| GET       | /admin/shops /admin/shops/pending       | approval queues                                                                   |
| POST      | /admin/shops/:id/approve,reject,suspend | audited approval changes                                                          |
| GET/PATCH | /admin/users, /admin/users/:id          | user list / suspended boolean                                                     |
| POST      | /admin/categories                       | name                                                                              |
| GET/PATCH | /admin/products, /admin/products/:id    | catalogue / active boolean                                                        |
| GET       | /admin/inventory-anomalies              | invariant violations                                                              |

HTTP: 400 invalid input, 401 authentication failure, 403 role/ownership denial, 404 missing, 409 business conflict, 429 rate/verification limit. Client-provided prices/payment states/owner IDs are never accepted as authoritative.
