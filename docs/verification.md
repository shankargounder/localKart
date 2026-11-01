# Barcode and staging preparation — 1 November 2026

- Six migrations applied to the existing local database and a disposable test database. The new migration adds a unique per-shop index over optional barcode metadata; prior products remain unchanged.
- **37 API/unit/integration tests passed**, including GTIN check digits/UPC aliases, source metadata constraints, missing/provider-error paths, owned barcode lookup, duplicate creation prevention, demo build validation and the existing order/stock/push-queue suite.
- **Three targeted connected browser journeys passed**: reviewed barcode product creation/duplicate refusal, merchant dashboard/floating product creation, and two-client merchant acceptance/customer ready notification tracking.
- One real public packaged-food barcode lookup returned Nutella metadata from Open Food Facts. This is a single provider check; no universal catalog coverage is implied. The local demo API's optional food catalog is enabled; staging defaults off until configured.
- All workspace typechecks and ESLint passed. API/admin production builds and both Android Hermes/JavaScript exports passed (1,442 modules each). JavaScript exports are not signed APKs.
- Render staging blueprint, guarded EAS demo profiles, configuration readiness check and physical two-phone acceptance guide are prepared. The readiness check correctly reports missing hosted API/database, project IDs, push enablement and Firebase client files. No cloud resources were created or purchased, and no source upload or APK build was performed.
- **Not verified:** physical camera decoding, native permission behavior, FCM/APNs OS display, native terminated-app navigation, or internet-based two-phone interaction. Follow [Live demo staging](live-demo-staging.md) before presenting the APKs as ready for the shop.

---

# Live notification and tracking verification — 31 October 2026

- All five migrations applied to disposable UTF8 PostgreSQL; the existing local database was safely cloned from WIN1252 to UTF8. The original database remains intact. Before this upgrade the verified copy preserved 26 users, 21 shops, 300 products, 8 orders, 300 inventory rows and all prior payment/session/history records. Row counts and every original User, Inventory and Order field were checked; `.local/backups/live-encoding-verification.json` records the result without credentials.
- **32 API/unit/integration tests passed** against real PostgreSQL. New cases cover server-confirmed 20-minute timestamps, ETA request deduplication, countdown restart/clock movement/expiry without automatic ready state, device rotation, two authorized merchant Socket.IO clients plus a customer, denial of other-customer subscriptions/read access, fake-provider durable retry/ticket/receipt/invalid-token handling, preference suppression, safe admin monitoring, upload ownership/MIME/content/deduplication, rollback event isolation and preserving merchant photos during demo seeding. Original inventory, payment, delivery and concurrency tests remain passing.
- **4 connected Playwright journeys passed.** Customer searches and places an actual order; merchant reporting/inventory and admin dispatch remain working; a customer and merchant complete preparation/ready tracking at phone-sized viewports. Reload preserves the countdown and ready stops it. The two affected journeys were rerun with explicit broken-photo fallback and admin notification-monitor checks; both passed. Browser permission-free tracking uses real sockets/polling, not OS push.
- TypeScript and ESLint passed. API/admin production builds passed. Vite reports a non-blocking admin bundle-size warning and strips unsupported purity comments in Zod.
- Both customer and merchant Android Hermes/JavaScript exports passed with 1,407 modules. These are not APKs and do not verify native permissions or OS notification delivery.
- Nineteen locally hosted, visually reviewed, license-recorded WebP assets now cover **70 demo products in ten categories**. Rerunning the image seed added zero rows and left existing images untouched. Source/author/license/modification metadata accompanies the assets. Generic demo photos do not verify brand/SKU appearance.
- New screenshots: `.local/screenshots/customer-live-tracking.png` and `merchant-live-order.png`; reviewed alongside existing admin/customer/merchant screenshots. The preparation countdown uses saved absolute time and the shared yellow theme is retained.
- OpenAPI regenerated with tracking, notification, test-device and image-upload routes. See [setup and Android checklist](live-tracking-notifications.md).

Not verified: physical Expo/FCM/APNs push delivery, native background/terminated-app navigation, native photo/map permissions, live Supabase storage, actual payment/delivery providers, signed APKs or public deployment. Push dispatch defaults off. Provider receipts are never reported as confirmed physical delivery. No privileged source upload was attempted for this update.

---

## Historical V2 milestone verification

# V2 verification — 31 October 2026

Verified in the local Windows workspace:

- All four Prisma migrations applied to disposable PostgreSQL 18.4 and the existing local database.
- Before migration: a repeatable-read logical row backup was saved under ignored `.local/backups`. All 17 original users, 15 shops, 150 products and 3 orders retained their IDs; all original password hashes and 150 inventory balances were unchanged by migration/seeding.
- Additive seed: 22 demo accounts, 20 synthetic shops, 300 products and 4 seed/existing orders before browser tests. Browser tests add isolated synthetic customer accounts and cancelled test orders; they do not overwrite existing carts or orders.
- API/unit integration run: **22 passed**, including original pickup concurrency, smart radius/synonyms, address privacy, expired quotes, shop-specific carts, delivery proof/idempotency, failed return replay/wastage, fractional offline sales/reserved-stock protection, immutable fee snapshots, concurrent refund caps, verified reviews, manual refund transitions and five-attempt pickup locking.
- Connected Playwright journeys: **3 passed**. Administrator sees actual fee/GMV metrics and delivery records; an isolated customer searches tomatoes, opens a shop, creates a persisted pickup order, cancels it and views OSM pins; merchant sees gross sales/reporting and billing controls.
- Source typechecks, ESLint, API and admin production builds passed. Admin has a non-blocking large-chunk warning; Vite removes unsupported purity comments from Zod.
- Customer and merchant Android Hermes/JavaScript exports passed. These are not native APKs or device tests.
- Yellow UI screenshots saved to `.local/screenshots/admin-v2.png`, `customer-v2.png`, and `merchant-v2.png`. Review found and fixed a literal newline, stale pre-debounce search click, info-panel contrast and map/list filter mismatch. The customer UI test now waits for the actual tomatoes response.
- OpenAPI generation succeeded. Server request logging strips URL query strings so search coordinates are not included in request logs.

Remaining: physical device/map-permission QA, React Native Testing Library coverage, real provider integrations, production hardening and the modules in [V2 progress](v2-progress.md). Browser map CSS emits unused local-image warnings; circle markers do not depend on those icons. A signed APK/source upload and cloud deployment have not run. The EAS upload remains blocked by the earlier automatic approval review pending explicit source-upload authorization.

Dependency installation reports unresolved transitive advisories in the retained Expo/Prisma-compatible toolchain. No production security clearance is claimed; upgrade and audit before a production launch.

---

## Historical first implementation

# Implementation verification — 29 October 2026

Verified in this Windows workspace:

- Prisma 6.19 client generation and both SQL migrations against actual project-local PostgreSQL 18.4.
- Local development seed: 15 shops, 150 products, one synthetic completed order and inventory movements.
- All workspace TypeScript checks.
- Unit suite: 3 passed.
- PostgreSQL integration suite: 8 passed (11 total with unit tests). Includes registration/login, role denial, discovery/search, persisted cart, reservation 20→17, cancellation release, concurrent last-item acceptance, duplicate acceptance/completion, failed pickup attempt persistence and idempotent simulation/refund.
- Concurrency test initially exposed a raw-SQL serialization retry failure. PostgreSQL SQLSTATE 40001/40P01 wrapped in Prisma P2010 is now retried alongside P2034.
- API and admin production bundles built successfully. Admin has a non-blocking large-chunk warning.
- Customer and merchant Android JavaScript/Hermes exports succeeded (1,361 modules each). These exports are not signed APKs.
- API `/health` returned `{status:ok}`; public nearby discovery returned 14 approved synthetic shops.
- Admin UI logged in using a seeded administrator and displayed real database counts: 17 users, 15 shops, one completed order and ₹65 value. Narrow viewport layout inspected in the in-app browser.

Not verified: native map rendering/permissions, physical device journeys, EAS APK/signing, cloud deployment, real payment collection, email/push delivery and all production hardening. See README for missing features and dependency advisories. No production readiness claim is made.

## Supabase pilot preparation — 2026-11-01

Added server secret-key storage support, API-only table RLS/grant migration, isolated migration connection override, storage bucket setup/readiness commands, and admin pilot URL validation. All 38 tests passed against disposable PostgreSQL with all seven migrations, including a real unprivileged-role SELECT denial while API order flows succeed. Workspace typechecks, lint, and API/admin production builds passed (existing bundle/annotation warnings). Blank staging configuration correctly reports NOT READY without printing secrets. No hosted Supabase project, storage upload, physical push delivery or new public-API APK has been verified. See supabase-pilot.md for handoff.

