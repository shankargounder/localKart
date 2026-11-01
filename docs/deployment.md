Current staging preparation and two-phone acceptance gate: [Live demo staging](live-demo-staging.md). No cloud resources or APKs have been created. The older baseline below predates push dispatch, storage uploads and barcode support.

# Deployment preparation

No deployment has been performed. Keep development/staging/production databases and secrets separate. Never run demo seeds in production.

1. Create a Supabase PostgreSQL project. Copy its TLS-enabled connection URL into the backend DATABASE_URL secret. Prefer direct/session connectivity for migrations; configure pooling appropriately for Prisma according to your Supabase project settings.
2. In a trusted deployment shell, set DATABASE_URL and run `npm ci`, `npm run db:generate`, `npm run db:migrate` before routing traffic to the new API version.
3. Create the Render service using `render.yaml`. Set a production DATABASE_URL and exact HTTPS admin CORS_ORIGINS. Preserve PICKUP_SECRET across deploys. The free service may sleep; polling jobs resume when the service wakes.
4. Build the admin with VITE_API_URL pointing to the HTTPS API (`/api/v1`). Deploy `apps/admin-web/dist` to static hosting. Configure all routes to rewrite to index.html for BrowserRouter. Do not place secrets in Vite environment variables.
5. Provision the first administrator using a trusted database/bootstrap procedure with a bcrypt password hash, then log in and approve merchants. Public registration cannot create an ADMIN.
6. Configure EAS and public mobile API URL. Test on an Android device over HTTPS. Follow the APK guide.
7. Verify health, CORS, registration, role denial, approval, map discovery, ordering, reservation, pickup, cancellation and concurrency in staging before public traffic.

Server filesystem is not used for persistent data. Image uploads/storage are not implemented; add Supabase Storage signed uploads, MIME/content/size validation and access policies before exposing uploads. Real payments, email delivery and push dispatch require implementation and account configuration; simply supplying keys does not enable them.

Before production: dependency audit and upgrade, device/accessibility QA, database backup/restore exercise, least-privilege DB roles, admin bootstrap, reset email delivery, push retries, provider reconciliation/refunds if enabling online payments, observability, moderation/support workflows, and rate-limit proxy review. The default in-memory rate limiter is per process; multi-instance deployments need a database-backed/shared implementation.
