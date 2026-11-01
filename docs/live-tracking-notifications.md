# Live tracking, notifications and product images

This update extends the existing LocalKart apps and yellow theme. All order screens use authenticated persisted API data. Browser previews are customer http://localhost:8081, merchant http://localhost:8082 and admin http://localhost:5173; API is http://localhost:4000/api/v1.

## Database and migration

Apply `npm run db:migrate` after backing up your database. Migration `202610310003_live_tracking` adds nullable preparation timestamps, order versions, product image provenance, notification preferences, device identities, realtime events, an outbox, delivery jobs and attempt history. Existing rows are retained; legacy device identities and read timestamps are backfilled. Legacy accepted orders without an ETA say no confirmed estimate rather than inventing one.

The existing local database used WIN1252 and could not store notification emoji or the rupee symbol. `node scripts/migrate-local-utf8.mjs` created a separate UTF8 database, copied and checked the existing records and changed only the local DATABASE_URL after validation. The original database is retained. Local ignored backups and the count verification are in `.local/backups/`. Do not run this local-only helper on a hosted database. New local/test PostgreSQL instances use UTF8 and UTC. Existing timestamp values were preserved exactly.

## Order events and tracking

Checkout and state transitions insert a unique realtime event and recipient-specific notification/outbox in the same serializable database transaction as the order and inventory changes. No provider I/O runs inside those transactions. Duplicate checkout and repeated state transitions do not create another order or reservation.

Socket.IO shares the API HTTP server. Pass the current access JWT in handshake `auth.token`. The server verifies the user, rejects suspended users, disconnects expired JWTs and automatically joins a private user room. `subscribe.order(orderId, ack)` allows only the customer, shop owner or administrator; `subscribe.shop(shopId, ack)` allows its owner. Subscription attempts are bounded. `order.event` carries eventId, orderId, type, version and serverTime; it never carries an address, pickup code or product/customer data. Clients invalidate authorized API queries, deduplicate events and resync after reconnect/focus. A database event poll every second supports multiple API processes without requiring Redis; clients also poll every five seconds. Historical invalidations can be replayed harmlessly. This is a small-deployment design; introduce a shared broker and managed worker scheduling before high-volume scaling.

Merchant acceptance uses the preparation modal (10, 15, 20, 30, 45 minutes or custom 1–240). `POST /merchant/orders/:id/accept` accepts `preparationDurationMinutes`; old callers default to 20. acceptedAt and estimatedReadyAt use one server timestamp. `PATCH /merchant/orders/:id/estimated-ready-time` takes `{minutes}` measured from now and a required Idempotency-Key. Reusing the key with a different duration returns 409. Only accepted/preparing orders can change the estimate.

Customer confirmation opens saved order details immediately. Countdown = estimatedReadyAt minus server-adjusted current time, never a component-local start time. Server time is sampled at `/time`; the latest offset and order snapshot are stored per authenticated user/order. Navigation, reload and app foregrounding do not restart preparation. Timer expiry says the estimate has passed and waits for a merchant update; it never marks ready automatically. READY_FOR_PICKUP stops the countdown. Delivery shows confirmed shop preparation and verified dispatch status, without a fabricated pickup countdown or live rider location. Pickup codes remain ownership protected.

## Push setup (external delivery is unverified)

`ENABLE_EXPO_PUSH=false` is the default. Queue creation, notification center, sockets and polling work without push credentials. Local automated tests use an injected synthetic provider and real database jobs, not actual Expo delivery.

Configure these server variables using secret storage:

| Variable                 | Purpose                                                                           |
| ------------------------ | --------------------------------------------------------------------------------- |
| ENABLE_EXPO_PUSH         | Set true only after configuring the build and provider                            |
| EXPO_ACCESS_TOKEN        | Server-only Expo push access token when enhanced push security is enabled         |
| EXPO_CUSTOMER_PROJECT_ID | UUID of the customer EAS project; also supplied when evaluating its app.config.ts |
| EXPO_MERCHANT_PROJECT_ID | Separate merchant EAS project UUID; also supplied during its native build         |
| CORS_ORIGINS             | Comma-separated exact browser origins for deployed API and Socket.IO              |

Each app has its own Android application ID: `in.localkart.customer` and `in.localkart.merchant`. In each Firebase Android app, obtain its matching client `google-services.json`. Set `GOOGLE_SERVICES_JSON` to its build-time file path (an EAS file environment variable works). Register the correct Firebase package and configure the project's FCM V1 service-account credentials through EAS credentials. The service-account private key belongs only in the credentials service; it must never be bundled or committed. Configure APNs separately for iOS. Set `EXPO_PUBLIC_API_URL` to an HTTPS API reachable from the device. Root `.env` is for the server; supply native build variables through the build environment, not by copying server secrets into app folders.

`LOCALKART_TEST_DEVICE=true` at build/config evaluation marks registrations as opted-in test devices. Leave false for normal distributions. A native rebuild is required after changing native Firebase files or notification plugins. The Android notifications plugin uses the yellow accent; runtime channels are `orders` (default sound/high importance) and `orders-silent`. Sound preference selects the channel; Android OS channel settings still control actual sound.

Use a physical Android development/preview build, not a web preview or Expo Go. Enable notifications from the app's notification center. Permission denial is explicit and order tracking continues. Stable device IDs use SecureStore; token rotation updates the record, account reassociation removes the prior ownership, and logout disables that user's device before revoking the refresh token. More than one device can register for a merchant. Optional shop scoping is checked server-side. No tokens or provider secrets are exposed in the admin monitor.

The API process expands the durable outbox and claims jobs with SKIP LOCKED leases. Every send attempt is saved before external I/O. Network errors retry with bounded exponential backoff (30 seconds to one hour; five send attempts); invalid tokens are disabled. Provider tickets are polled after 15 minutes, with a 24-hour receipt timeout. Pending outbox older than 24 hours is expired. Restarting the process retains all database jobs. Ambiguous network failures can produce repeated provider submissions, so stable event IDs also deduplicate app handling. A provider receipt means provider acceptance, not confirmed OS display or human receipt. No device-delivered claim is made.

Admin → Notifications lists queue state, retries, ticket/receipt status and controlled errors. Expand a row for attempt history. The fixed test action targets one enabled opted-in registered device, is rate limited and audited, and returns queued status. It cannot send arbitrary content or broadcasts. There is no actual test device registered in this local setup.

Official setup references: [Expo sending/receipts](https://docs.expo.dev/push-notifications/sending-notifications/), [FCM V1 credentials](https://docs.expo.dev/push-notifications/fcm-credentials/), [Socket.IO authentication middleware](https://socket.io/docs/v4/middlewares/).

## Images and uploads

`npm run db:seed-images` assigns 19 reviewed, optimized WebP photographs to 70 existing demo products across ten product categories. Only demo merchant accounts are eligible; any product already having an image is skipped. The seed is local-only and idempotent. It does not replace merchant photographs. Generic photos do not assert brand/SKU identity. Locally hosted hashed assets are in `assets/catalog/`; original source, author, license, modifications and license links are in `assets/catalog/ATTRIBUTION.md` and `manifest.json`. Keep this attribution with redistributed assets and comply with each indicated CC license, including ShareAlike where applicable. Do not use these generic images to imply supplier authorization.

Product cards, details, search results and new order-item snapshots use image records. Photo galleries show provenance and generic-demo labels; missing/broken images show a fallback. `expo-image` caches and sizes photos without stretching. Old orders without image snapshots retain a placeholder.

Merchant product maintenance provides a rights-confirmation control and image picker. `POST /merchant/products/:id/images` is owned multipart upload (`image` plus `rightsConfirmed=true`). Limits: one JPEG/PNG/WebP, 5 MB, 16 megapixels, no animation, at most eight images per product. Decoded format must match MIME. Images are rotated, resized within 1200×1200 and encoded as WebP; metadata including location is stripped. Content hashing deduplicates uploads. Uploaded images take priority over generic demo assets. Database failures clean up newly created objects; committed objects remain to preserve order snapshot URLs.

Development `UPLOAD_DRIVER=local` stores randomized files under ignored `.local/uploads` and serves `/media/uploads`. Production refuses local uploads. Configure `UPLOAD_DRIVER=supabase`, `SUPABASE_URL`, server-only `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_STORAGE_BUCKET=product-images`. Create a dedicated public-read bucket with client writes denied; only the API uploads. Assets get immutable cache headers. Supabase upload integration is implemented but has not been tested against a live storage account. Serve the bundled `/media/catalog` assets with the API deployment. See [Supabase upload reference](https://supabase.com/docs/reference/javascript/storage-from-upload) and [Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia).

## Android demonstration checklist

1. Configure separate customer and merchant EAS/Firebase projects as above; build/install both preview APKs on separate physical devices. EAS source upload is a separate pending approval from the earlier APK request; no upload or APK build was performed for this update.
2. Start the API/worker with real push enabled and reachable HTTPS, sign in as a customer and the owner of the chosen shop. Grant notification permission. Confirm registrations in the database without exposing tokens.
3. Place one pickup order. Background the merchant app. Verify actual OS notification title/body and tap routing, the in-app new-order badge and that the order appears once. Record device model, Android version, build/project IDs, ticket and receipt statuses. OS display must be observed independently of a provider receipt.
4. Accept with 20 minutes on the merchant device. Verify persisted acceptedAt/estimatedReadyAt and observe the customer's actual push. Customer details must show the confirmed absolute readiness time and a decreasing countdown.
5. Navigate away, restart and foreground the customer app. The countdown must retain elapsed time. Move the automated test clock across expiry; the order must remain accepted/preparing until an explicit merchant action.
6. Change the estimate, start preparation and mark ready. Confirm the customer notification, stopped countdown, pickup code and ready status. Complete with the correct code and payment confirmation; stock must move only once.
7. Deny OS notifications, reconnect and temporarily disconnect a client. Confirm sockets/polling recover persisted state. Test a second signed-in merchant device; both should receive the event, with one reservation. Sign out one device and confirm subsequent push stops for it.
8. Use notification center read-one/read-all/preferences and the admin opted-in-device test. Check invalid-token handling, safe monitoring and persisted retries across worker restart.
9. Browse demo photos, inspect source/credits, deliberately use a broken image URL in a test fixture, upload a permitted merchant photo and rerun the seed. Existing merchant photos must remain unchanged. Test file/type/size and cross-merchant upload denial.
10. Run `npm run typecheck`, `npm run lint`, `npm run test:integration`, `npm run build` and `npm run test:e2e`. Export each Android JS bundle separately before native builds. Automated synthetic-provider success does not satisfy steps 3–4 physical push delivery.

## Customer header drawer update — 1 November 2026

The customer bell and unread badge are in the fixed header. Clicking opens an animated right-hand drawer without changing the current page; close/backdrop controls dismiss it, and opening an order closes it and navigates to the authorized detail. Notification preferences are collapsed under Settings; low-stock preferences are merchant-only in the UI. The drawer reads persisted notifications and receives live invalidations/polling. A connected browser test creates an isolated shop/order, accepts it, verifies the real notification and unread count, marks it read and opens its order on desktop and phone widths. The preparation/ready browser regression also passes.

On supported browsers, Enable device push notifications requests browser permission and enables desktop notifications for fresh server events while the page is open in the background. The app still shows its in-app badge/drawer if permission is denied. Browser alerts are not closed-browser push; actual desktop OS display remains subject to browser settings and was not physically verified. Expo/FCM project configuration is still missing in the local environment, so native closed-app push remains disabled.

Notification read/navigation fix: development HTTP and Socket.IO allow both localhost and 127.0.0.1 for ports 5173/8081/8082; production still uses only configured origins. Notification text rows are the order links, with no separate Open order button. Mark-all-read reports connection errors inline, preserves unread state on failure and permits retry. The browser test now runs on 127.0.0.1, interrupts a PATCH to verify no alert popup, retries successfully, verifies the unread count and opens the order by clicking the notification text.

Order-page pickup wording: the compact Back to orders icon sits beside an Order details heading. Accepted pickup orders explicitly show Order accepted and explain that collection must wait for the shop to mark Ready for pickup. Ready state adds a collection confirmation, stops the timer and queues a customer notification explicitly saying the order is ready for pickup. A connected two-client browser journey signs the merchant in before checkout, verifies its new-order drawer notification, opens that order from the notification, accepts it, starts preparation and marks ready; the customer page and ready notification are verified against the saved order. Device-level push remains subject to the Expo/FCM setup described above.
