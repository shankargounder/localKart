# Supabase pilot for customer, merchant and admin

Prepared in source; a live Supabase project and public API have not been connected.
The existing Wi-Fi APKs still point at the PC and need rebuilding after hosting.

All three clients use the same LocalKart HTTPS API. Prisma stores users, shops,
products, carts, orders and notifications in Supabase PostgreSQL. Existing LocalKart
authentication, role checks, Socket.IO and notification workers remain in use.
Supabase Auth/Realtime are not required. Android background pushes still require
Firebase FCM credentials configured in Expo for both apps.

## Database and secrets

1. Create a dedicated pilot project. Copy `.env.staging.example` to ignored
   `.env.staging`. Fill its server secrets locally or in hosting secret storage;
   never paste private credentials into chat or place them in client variables.
2. Copy the database connection from Supabase's Connect dialog. For the persistent
   API use direct PostgreSQL where IPv6 is supported, or Supavisor **session mode**
   (port 5432) on IPv4-only hosting. Require TLS (`sslmode=require`). URL-encode
   password characters and use a modest Prisma `connection_limit`, such as 5.
   Set `MIGRATION_DATABASE_URL` to a direct/session connection if runtime uses a
   different connection. Do not run migrations through transaction mode port 6543.
3. Use the table-owning Prisma database role for this pilot. The new migration
   enables RLS and removes PUBLIC/anon/authenticated grants on application tables.
   The backend owner can still access them. If later introducing a separate runtime
   role, explicitly configure its privileges and RLS access first. Future tables
   also need API-only protection in their migrations.
4. Disable Supabase's Data API in project settings when unused. Do not add client
   read/write policies for LocalKart tables. Existing API JWTs are not Supabase
   Auth JWTs. Keep the storage API available.
5. From PowerShell, apply migrations to the selected staging file:

   ```powershell
   $env:LOCALKART_ENV_FILE = '.env.staging'
   npm run db:migrate
   Remove-Item Env:LOCALKART_ENV_FILE
   ```

   Externally managed environment variables take precedence over the file. Verify
   the target privately before applying. This does not copy local users/orders or
   run demo seeds; provision dedicated pilot accounts through the existing app
   signup and admin approval flow. Bootstrap the first admin through a trusted
   operator before handing out access.

## Product images

Set `UPLOAD_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (backend-only
`sb_secret_...`) and `SUPABASE_STORAGE_BUCKET=product-images`. Legacy
`SUPABASE_SERVICE_ROLE_KEY` remains supported as a fallback. A publishable/anon
key cannot perform backend storage administration.

```powershell
npm run supabase:setup -- .env.staging
npm run supabase:check -- .env.staging
```

Setup creates only a missing public-read bucket, restricted to WebP and 5 MB.
It does not overwrite existing bucket settings or migrate data. Fix incompatible
existing bucket settings in the dashboard. Leave client write policies absent;
merchant uploads go through authenticated API ownership checks and image processing.
Product photos are public, so do not upload private documents. Existing local-upload
files need a separate reviewed transfer; switching drivers does not move them.
The checks do not upload probe images or prove end-to-end upload delivery.

## Connect all three apps

- Customer EAS environment: `EXPO_PUBLIC_API_URL=https://YOUR-API/api/v1`.
- Merchant EAS environment: exactly the same `EXPO_PUBLIC_API_URL`.
- Admin build environment: `VITE_API_URL=https://YOUR-API/api/v1` (see
  `apps/admin-web/.env.example`). Also set `LOCALKART_DEMO_BUILD=true` to reject
  missing, HTTP and local-network API URLs. Set API `CORS_ORIGINS` to the hosted admin origin
  and any hosted Expo web client origins, comma separated. Build admin after setting
  its URL; Vite embeds this value at build time.
- No Supabase secret/database connection belongs in any of these three clients.
  Configure Firebase client files/FCM V1 and use both APK `demo` profiles as described
  in `live-demo-staging.md`. Run `npm run demo:check -- .env.staging` before builds.

Complete the two-phone acceptance gate in `live-demo-staging.md`, on separate
networks, including merchant product upload, customer order, acceptance, ready,
pickup completion, admin visibility, unrelated-account denial and reconnect.
Check actual OS notification delivery before inviting shops/customers.

References: [Prisma connections](https://supabase.com/docs/guides/database/prisma),
[database connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[API security](https://supabase.com/docs/guides/database/secure-data),
[bucket restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets).
