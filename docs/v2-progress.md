Latest live-tracking upgrade: see [setup and Android checklist](live-tracking-notifications.md). Durable push dispatch, live tracking, notification monitoring, merchant image uploads and 70 demo product photos now extend this milestone; actual physical push remains unverified. The older milestone details below are historical.

# LocalKart V2 implementation status

This is a working V2 core milestone, not the entire production scope in the master brief. Existing pickup behavior is preserved. No public deployment, EAS source upload or APK build was performed for V2.

## Validation

22 API/unit tests pass against actual PostgreSQL; three connected Playwright journeys pass. Existing IDs/password hashes/stock were verified preserved. Both Android JavaScript exports and API/admin production builds pass. See docs/verification.md for limits.

## Implemented and integrated

| Phase           | Delivered in source                                                                                                                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation      | Existing npm workspace retained; shared yellow design tokens and reusable mobile controls; typed discovery client; error boundary; existing email auth, rotation and role checks                                                                    |
| Shop/catalogue  | Merchant approval retained; delivery/COD toggles; hours editing; product brand/SKU/keywords/specifications; six selling units; variant creation and daily price changes; stock ledger and offline billing                                           |
| Discovery       | PostgreSQL generated full-text vector + GIN; normalized synonyms; bounding-box prefilter; exact great-circle distance; smart 1→2→5→10 km radius; manual 15/25 km; availability/price/distance sort; stable pagination; suggestions; no-key OSM maps |
| Checkout        | Separate shop carts; fractional quantities; server-calculated merchandise and delivery totals; delivery address snapshots; expiring customer/shop/address-bound quotes; immutable commission snapshots; packing notes                               |
| Pickup          | Acceptance reservations, preparation, code attempts, verified completion, cancellation, expiration and database notifications retained                                                                                                              |
| Delivery        | Explicit MOCK/manual pilot provider boundary; merchant ready/request rider; admin assignment/handover/out-for-delivery events; code-verified delivery; event idempotency; failed delivery/confirmed return/wastage handling                         |
| Offline sales   | Owned-shop billing; cash/UPI/card recording; idempotency; whole-unit validation where required; atomic unreserved-stock consumption; immutable movement history                                                                                     |
| Admin/reports   | Recharts; GMV versus fee revenue; completed-time reporting; delivery monitor and dispatch; future-order commission rules; support resolution; refund approval/manual reimbursement states; audit log                                                |
| Customer extras | Persistent addresses, favorites, wishlist, reusable manual shopping lists, reorder, support tickets, refund requests; verified-purchase review API; preference API                                                                                  |
| Quality         | Additive migrations, database invariants, historical snapshot backfill, OpenAPI inventory and shared request schemas, PostgreSQL integration suite                                                                                                  |

## Important semantics

- Distances are straight-line estimates. They are never labelled driving distance.
- Auto expansion stops at the first radius with at least one in-stock product in an accepting shop. All search pages reuse that radius. The SQL computes candidates once within the maximum bounding box.
- MOCK quotes/bookings are development simulations. No real rider is booked and no delivery ETA is invented. Production pilot delivery is disabled unless `ENABLE_MANUAL_DELIVERY=true` and a merchant opts in.
- Inventory remains reserved during transit. It is finalized only after delivery proof. Failed deliveries hold reservations until an admin confirms return; damaged returns become explicit wastage rather than available stock.
- Customer codes are revealed only to the owning customer. Delivery completion requires admin authorization, matching code and confirmed COD collection where applicable. Assignment never completes an order.
- Refund approval for cash payments becomes `MANUAL_REQUIRED`; it is not reported refunded until an admin records an actual reimbursement reference. Simulated refunds are labelled separately. Refunds do not automatically restock goods.
- GMV is merchandise value. Delivery charges are excluded from platform fee revenue. Fee rules are snapshotted at order creation and protected against later mutation.
- Existing client checkout keys remain compatible with the original pickup payload hash.
- Native maps use Leaflet in a WebView; browser maps use Leaflet directly. Both need Internet for tiles; neither needs a paid Google key. No offline tile cache or clustering is implemented.

## Remaining implementation, in priority order

1. Complete physical Android UI testing and React Native Testing Library coverage; extend the three passing browser journeys to full dispatch/support flows. JavaScript exports do not prove device behavior.
2. Add secure Supabase Storage upload validation and image management. Image upload is disabled, not represented by mock success.
3. Implement customer-approved substitution/packed-weight adjustment workflows with authorized amount caps, partial refunds/additional payment and actual-quantity inventory. These operations are currently disabled.
4. Implement provider-specific payments/webhooks/reconciliation/refunds using verified official documentation and credentials. Existing simulation remains development-only; online collection is disabled.
5. Add push/email delivery, retry/outbox processing and actual EAS project/signing setup. Source upload still requires the explicit approval requested earlier.
6. Implement staff permissions, supplier/purchase-order records, promotions/coupons, CSV bulk import and barcode scanning. `/features` advertises these modules as disabled. CSV export currently covers offline-sale records only.
7. Add settlements/payout reconciliation and broader accounting reports. Current reports show snapshots and recorded refunds; they are not bank settlement statements.
8. Complete review-creation UI, notification-preference UI, product image galleries, recommended/featured merchandising, store-history sections and richer product specification editors. Their underlying APIs/data vary by module as noted above.
9. Refine navigation into independently addressable file-based tab screens, automated accessibility checks, skeletons and reusable confirmation dialogs. Current bottom navigation updates Expo Router parameters.
10. Complete hierarchical-category restrictions across ancestor categories, category-specific markers, clustering, automatic hours policies and merchant verification documents. Current restricted-category enforcement is on directly assigned product categories.
11. Upgrade/audit the Expo/Prisma toolchain as a coordinated compatibility change; harden multi-instance rate limiting, background reconciliation, query performance and backup/restore operations before production.

The schema intentionally extends the existing simplified User/Shop role/profile model rather than migrating every brief noun into a separate table at once. Unimplemented staff, settlement and provider-configuration domains must not be claimed complete.
