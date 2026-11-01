import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const file =
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) || ".env.staging";
if (existsSync(file)) process.loadEnvFile(file);
const results = [];
const check = (name, ok) =>
  results.push({ check: name, status: ok ? "PASS" : "NOT READY" });
let url;
try {
  url = new URL(process.env.SUPABASE_URL);
} catch {
  /* Report safely below. */
}
const key =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured =
  url?.protocol === "https:" &&
  !url.username &&
  !url.password &&
  !!key &&
  !key.startsWith("sb_publishable_");
check("Supabase HTTPS URL and server key configured", configured);
check(
  "Managed image uploads selected",
  process.env.UPLOAD_DRIVER === "supabase",
);
if (configured) {
  const client = createClient(url.href, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  });
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "product-images";
  try {
    let response = await client.storage.getBucket(bucket);
    if (
      response.error &&
      (Number(response.error.status) === 404 ||
        response.error.message === "Bucket not found") &&
      process.argv.includes("--create-bucket")
    ) {
      const created = await client.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: 5 * 1024 * 1024,
        allowedMimeTypes: ["image/webp"],
      });
      if (!created.error) response = await client.storage.getBucket(bucket);
    }
    check(
      "Public image bucket with WebP-only and 5MB limit",
      !response.error &&
        response.data?.public === true &&
        Number(response.data.file_size_limit) === 5 * 1024 * 1024 &&
        response.data.allowed_mime_types?.length === 1 &&
        response.data.allowed_mime_types[0] === "image/webp",
    );
  } catch {
    check("Storage connection", false);
  }
}
const db = new PrismaClient();
try {
  const rows = await db.$queryRawUnsafe(`SELECT c.relname, c.relrowsecurity,
    pg_has_role(current_user, c.relowner, 'USAGE') OR r.rolbypassrls AS backend_access
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_roles r ON r.rolname=current_user
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ('User','Order','Product','Notification')`);
  check(
    "Application tables migrated with RLS and backend access",
    rows.length === 4 &&
      rows.every((r) => r.relrowsecurity && r.backend_access),
  );
  const grants =
    await db.$queryRawUnsafe(`SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name IN ('User','Session','Order','DeviceToken')
    AND grantee IN ('anon','authenticated','PUBLIC') LIMIT 1`);
  check("Sensitive tables have no public client grants", grants.length === 0);
} catch {
  check("Database connection and migrations", false);
} finally {
  await db.$disconnect();
}
console.log(
  JSON.stringify(
    {
      checks: results,
      note: "No secrets printed. This does not certify physical push delivery or upload success.",
    },
    null,
    2,
  ),
);
if (results.some((r) => r.status !== "PASS")) process.exitCode = 1;
