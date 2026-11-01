# LocalKart V2

**Search nearby. Compare products. Pick up or choose pilot delivery.**

Connected Expo customer/merchant applications, a React/Ant Design/Recharts admin dashboard, and an Express/Prisma/PostgreSQL API. V2 extends the existing pickup application with shared yellow branding, smart geographic search, delivery pilots, offline billing, fee snapshots, support and refund workflows.

This is a working core milestone, not a production-complete release. See [implemented scope and precise continuation checklist](docs/v2-progress.md).

## Workspace

```text
apps/customer-mobile       Customer Expo Router application
apps/merchant-mobile       Merchant Expo Router application
apps/admin-web             React / Ant Design / Recharts
services/api               API domains, schema and migrations
packages/shared            Contracts, money and state transitions
packages/design-tokens     Shared yellow branding and spacing
packages/api-client        Reusable typed discovery client
packages/mobile            Shared React Native shell/features
database/seeds            Additive synthetic Hyderabad catalogue
tests/e2e                  Connected browser journeys
docs                       API, operations and continuation
```

## Install and start

Use Node 22 LTS (22.14+), npm and PostgreSQL. A project-local Node 22 development runtime is included; upgrading host Node avoids npm engine warnings.

```powershell
npm ci
Copy-Item .env.example .env
# Set different random JWT_SECRET and PICKUP_SECRET values (32+ characters).
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api
```

Without Docker, set root DATABASE_URL to `postgresql://localkart:local-development-only@127.0.0.1:55432/localkart`, run `npm run db:local` and leave that terminal open before migration/seeding. Data persists in ignored `.local/postgres`; no Windows service is installed.

In separate terminals:

```powershell
npm run dev:admin
npm run dev:customer
npm run dev:merchant
```

Browser previews:

```powershell
npm run start -w @localkart/customer -- --web --offline --port 8081 --max-workers 2
npm run start -w @localkart/merchant -- --web --offline --max-workers 2
```

Admin: http://localhost:5173. Customer: http://localhost:8081. Merchant: http://localhost:8082.

Native apps use each app's `.env` EXPO_PUBLIC_API_URL. Android emulator: `http://10.0.2.2:4000/api/v1`. A physical phone needs the PC's LAN IP on the same Wi-Fi or an HTTPS staging API. Browser previews default to localhost:4000. Never bundle server/database secrets.

## Demo records

The local-only seed creates 20 synthetic shops, at least 300 products across multiple Hyderabad localities/categories, pickup history and an explicitly simulated delivery awaiting dispatch. It preserves existing IDs, passwords and inventory. Businesses and addresses are fictional.

Credentials are in ignored `.local/demo-credentials.txt`:

- Customer: customer@demo.localkart.test
- Merchant: merchant1@demo.localkart.test (through merchant20)
- Admin: admin@demo.localkart.test

Existing accounts retain their passwords. The seed rejects production and remote databases. Never deploy demo accounts publicly.

## Workflows

- Pickup: create → merchant acceptance/reservation → preparation → ready → code/payment verification → complete once.
- Delivery: private address → expiring quote → order/reservation → preparation → request dispatch → assignment → handover → out for delivery → customer code/payment verification → completion. Failure holds stock until confirmed return; damaged returns record wastage.
- Offline sale: select shop products/quantities → record payment method → idempotent transactional sale consuming unreserved stock only.
- Discovery: full-text/name/brand/keyword/variant/category search, synonyms, smart 1→2→5→10 km expansion, manual 15/25 km, price/distance sorting and availability filters. Distances are straight-line estimates.

MOCK delivery is an explicit development simulation with no real rider or promised ETA. Production manual delivery requires ENABLE_MANUAL_DELIVERY=true and merchant opt-in. Real online collection is disabled. Cash and development-only simulated payments remain distinct.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run docs:api
npm run export -w @localkart/customer -- --max-workers 2
npm run export -w @localkart/merchant -- --max-workers 2
# Start the four local services and seed before UI tests:
npm exec -- playwright install chromium
npm run test:e2e
```

`test:integration` starts disposable actual PostgreSQL and applies all migrations. Ordinary `npm test` skips integration cases without TEST_DATABASE_URL. [Verification results](docs/verification.md) distinguish executed checks from remaining work.

## APK and deployment

```powershell
cd apps/customer-mobile
eas login --browser
eas build --platform android --profile preview-local
```

The testing profile uses this PC's LAN API and explicitly permits HTTP; update its IP if the network changes. Normal preview/production should use HTTPS. The earlier EAS source upload approval is still pending. No APK or public deployment has been produced for V2.

See [APK guide](docs/android-apk-build.md), [deployment](docs/deployment.md), [architecture](docs/architecture.md), [database](docs/database-design.md), [API](docs/api-reference.md) and [delivery lifecycle](docs/delivery-lifecycle.md).

## Remaining scope

Real payment/webhook adapters, physical push delivery verification, email delivery, packed-weight/substitution approval, staff permissions, promotions, suppliers, CSV import, barcode scanning, settlements/payouts and physical-device verification remain. `/api/v1/features` advertises disabled modules. See [V2 progress](docs/v2-progress.md) for the precise next implementation sequence.

Live order tracking, durable Expo push dispatch, notification centers and licensed demo photos are implemented. Setup, limitations and Android demonstration steps: [Live tracking and notifications](docs/live-tracking-notifications.md). Physical push and hosted Supabase storage remain unverified until credentials are supplied.

Merchant barcode entry and the guarded two-APK staging configuration are prepared. See [Live shop demonstration](docs/live-demo-staging.md) for hosting, Firebase/EAS variables and the physical-device acceptance gate. Camera decoding, native push display and signed APKs are not yet verified.
