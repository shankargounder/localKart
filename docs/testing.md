# Testing and continuation checklist

Unit tests validate decimal-safe line totals, duplicate quantity rejection and allowed state transitions. Integration tests use real PostgreSQL and cover registration/login, role denial, discovery/search, cart persistence, 20→17 pickup, invalid code attempts, duplicate/concurrent acceptance/completion, cancellation release, last-item concurrency, order idempotency and simulated payment deduplication/refund.

## Run PostgreSQL integration tests

The simplest option is `npm run test:integration`. It starts actual PostgreSQL on an available loopback port, applies all five migrations and executes all tests. Ignored `.local/integration-*` directories remain for diagnosis. The current suite passes 32 tests, including the original pickup cases.

Alternatively use a new disposable database (the suite leaves its tagged rows in place). Never use production.

```powershell
$env:DATABASE_URL='postgresql://localkart:local-development-only@localhost:5432/localkart_test'
# Create localkart_test with createdb or your DB client first.
npm run db:migrate
$env:TEST_DATABASE_URL=$env:DATABASE_URL
npm test
```

Without TEST_DATABASE_URL, integration tests are **skipped**, not passed. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and each app's `npm run export` separately. See `docs/verification.md` for actual results recorded during implementation.

## Required continuation

1. Keep `npm run db:local` and the API/admin terminals running when using the demo. Migrations, seed and PostgreSQL tests have been executed successfully.
2. Use Node 22 LTS (project-local runtime included). Both Android exports pass; signed APK builds and device checks remain.
3. Complete the 23-step acceptance journey with all three clients; record screenshots and database inventory snapshots.
4. Complete the remaining modules in docs/v2-progress.md. V2 already implements hours editing, support, reports and smart geographic search.
5. Configure a real provider only after verified webhook/refund/reconciliation tests exist. Keep collection disabled until then.
6. Test background expiration, failed payment, replay and manual adjustments under contention, refresh/logout/reset behavior and small-screen accessibility.

No cloud deployment, APK installation, visual device QA or production readiness is implied by successful TypeScript compilation.

## Connected browser tests

Start the local database and API, seed it, start admin on 5173 and Expo web previews on 8081/8082 (commands in README), then run:

```powershell
npm exec -- playwright install chromium
npm run test:e2e
```

Three journeys verify admin analytics/delivery monitoring, customer tomato search/cart/persisted ordering and merchant reports/offline billing controls. They use synthetic local data, preserve existing demo carts, and cancel their own test order. Screenshots and traces remain in ignored `.local`. This does not replace physical Android or React Native Testing Library coverage.

Live upgrade coverage includes authenticated two-merchant-client events, another customer being denied subscriptions/read state, server-based ETA/idempotency, countdown clock movement/restart/expiry, durable push retries/receipts/invalid tokens, preference suppression, image validation and upload deduplication, rollback event isolation and preservation of merchant photos during seeding. Four connected Playwright journeys pass, including the preparation modal, customer reload/countdown/ready lifecycle, broken-photo fallback and admin notification monitor. See [setup and physical-device checklist](live-tracking-notifications.md).
