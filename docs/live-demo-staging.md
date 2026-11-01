# Live shop demonstration: staging handoff

Cloud staging is prepared locally and is not deployed. Customer and merchant Wi-Fi APKs were built through Expo with user authorization; public HTTPS pilot builds are still required. No hosting resources have been created or paid hosting plan purchased. Physical device push is not yet verified. For Supabase setup see [supabase-pilot.md](supabase-pilot.md).

## What the two phones connect to

Customer APK → one shared HTTPS API + durable PostgreSQL ← Merchant APK.

The API commits an order and its notifications together. Authenticated Socket.IO invalidations and 5-second polling refresh open apps. Expo pushes through each app's configured FCM project for background notifications. Acceptance and Ready for pickup are saved backend states; phones do not communicate directly and do not infer ready state from a timer. The merchant must own the shop receiving the order. Multiple shops/devices remain independently authorized.

## Staging resources and configuration

1. Connect a hosting account and choose a region near the demonstration. `render.staging.yaml` is a reviewable blueprint with an always-on starter API, health check and pre-deploy migrations. **The selected hosting plan is paid; nothing has been provisioned or purchased.** The old free/sleeping service configuration is not the demonstration target. Review current plan costs before deployment. A sleeping API cannot provide prompt background dispatch.
2. Create a separate managed PostgreSQL staging database and backups; set DATABASE_URL in server secret storage. Use `.env.staging.example` as the variable-name reference. Do not migrate/copy real customer data or overwrite the existing local database. Apply all checked-in migrations with `npm run db:migrate`. Run one API instance for this initial demo; it runs the durable push and expiry workers.
3. Set stable JWT_SECRET and PICKUP_SECRET, both EAS project UUIDs, ENABLE_EXPO_PUSH=true, and EXPO_ACCESS_TOKEN if enhanced Expo push security requires it. Never place these server secrets in an APK. Push-enabled production startup refuses missing/invalid project IDs. Keep simulated payment and manual delivery flags false for a pickup/cash demo. Set exact HTTPS admin CORS origins.
4. For persistent product uploads, configure the dedicated Supabase public-read product-images bucket, server-only write key and URL. Client uploads must go through the authenticated API. Bundled catalog photos remain hosted by the API. Hosted storage is not yet tested against a live account.
5. Use the two existing separate EAS app projects. Use Android IDs `in.localkart.customer` and `in.localkart.merchant`. Register the matching Firebase Android clients. Put each app's client google-services.json in its own EAS project file environment variable GOOGLE_SERVICES_JSON. Configure that Firebase project's FCM V1 service-account credentials through EAS credentials. Service-account JSON/private keys never belong in source or the APK.
6. In each EAS project's preview environment, set **the identical** EXPO_PUBLIC_API_URL (`https://your-api-host/api/v1`), its own EXPO_CUSTOMER_PROJECT_ID or EXPO_MERCHANT_PROJECT_ID, and GOOGLE_SERVICES_JSON. Use each app's `demo` build profile. The profile produces an internal APK, opts devices into admin test capability and enables build-time validation: public HTTPS API, EAS UUID, Firebase client/package match, and no cleartext HTTP. Set a matching readable local Firebase client file when evaluating demo config locally; EAS secret file availability differs between local evaluation and cloud builds.
7. After hosting and credentials are ready, run `npm run demo:check -- .env.staging` from a trusted local shell. In that ignored staging file, also set EXPO_PUBLIC_API_URL, CUSTOMER_GOOGLE_SERVICES_JSON and MERCHANT_GOOGLE_SERVICES_JSON. The check prints only readiness statuses, never secret values. Passing configuration checks does not certify FCM credentials or OS delivery.
8. Build with `eas build --platform android --profile demo` from each app folder after source-upload authorization and configuration are complete. The user approved Expo source upload for both APKs; the existing Wi-Fi APKs have already been built. No store publishing is needed for the demonstration.

## Two-physical-phone acceptance gate

- Install both matching APKs. Use separate customer/shopkeeper accounts against staging. Choose the real test shop and correct nearby location. Grant OS notification permissions and check Android battery/channel settings.
- Use different networks (for example Wi-Fi and mobile data). Confirm both fetch the same staging shop/catalog and current order state.
- Keep the merchant app backgrounded. Place a single customer order. Observe the actual merchant OS notification, tap it and verify the exact order/shop/customer items. Confirm one persisted order and one acceptance reservation.
- Accept with a confirmed preparation duration. Background the customer app and observe its actual OS notification. Reopen/restart and check accepted state and persisted countdown.
- Start preparing and mark Ready for pickup. Observe the customer's actual ready notification and saved ready state; countdown must stop. Notification tap must open that order. Complete with the correct pickup code/payment acknowledgment and verify stock moves once.
- Repeat with notifications denied and then intermittent network access: open apps must recover via sockets/polling. Test account logout/device reassociation and unrelated-user access denial.
- Record app build IDs, both project IDs, API release identifier, Android/device versions, order IDs, provider ticket/receipt statuses and independently observed OS display times. Do not record full tokens or private credentials. A successful provider receipt does not prove physical delivery. Android force-stop and device policy may prevent timely push; test normal background and terminated states separately.

Do not call the demonstration ready until these steps succeed. Browser tests and Android JS exports do not substitute for installed APK testing.

## Barcode product entry

Open merchant Products → floating Add product → scan or type an EAN-8/UPC-A/EAN-13/GTIN-14 barcode. Native builds request camera permission; web/manual entry also supports keyboard-style scanners. A scan only pre-fills a draft. Merchant reviews details and enters selling price/stock before saving. No price, inventory or purchase is inferred from a barcode.

Barcodes are check-digit validated and normalized to GTIN-14. The API checks the owned shop first and refuses a duplicate barcode, including UPC/EAN aliases; optional barcode metadata has an additive unique index per shop. Existing products remain unchanged. Unmatched/invalid/provider-failed lookups support manual entry. A duplicate points the merchant to editing the existing item/stock.

`BARCODE_CATALOG_PROVIDER=none` is the default. `openfoodfacts` enables server-side metadata lookup with timeout and rate limits for packaged foods. It does not promise coverage for footwear, loose goods or all Indian retail products. Imported suggestions preserve source/license metadata; review Open Food Facts ODbL attribution/share-alike obligations before publishing imports. Images are not automatically copied or hotlinked; use permitted merchant uploads. Brand/description/pack text are suggestions, never verified product claims. An external catalog failure must not block manual product creation.

Camera decoding and permission behavior need testing in the rebuilt merchant APK. Synthetic provider fixtures validate lookup handling locally without claiming universal catalog coverage or physical scanning success.

References: [Expo FCM V1](https://docs.expo.dev/push-notifications/fcm-credentials/), [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [Render blueprint specification](https://render.com/docs/blueprint-spec), [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/), [Open Food Facts API](https://openfoodfacts.github.io/openfoodfacts-server/api/).
