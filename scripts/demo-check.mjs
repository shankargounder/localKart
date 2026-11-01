import { existsSync, readFileSync } from "node:fs";
const file = process.argv[2] || ".env";
if (existsSync(file)) process.loadEnvFile(file);
const report = [];
const check = (name, ok) =>
  report.push({ check: name, status: ok ? "PASS" : "MISSING / NOT READY" });
let api;
try {
  api = new URL(process.env.EXPO_PUBLIC_API_URL || "");
} catch {
  /* Missing configuration is reported below. */
}
const privateHost = (host) =>
  /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/i.test(
    host,
  ) || host.endsWith(".local");
check(
  "Shared public HTTPS API URL",
  !!api &&
    api.protocol === "https:" &&
    !api.username &&
    !api.password &&
    !privateHost(api.hostname) &&
    api.pathname.endsWith("/api/v1"),
);
let database;
try {
  database = new URL(process.env.DATABASE_URL || "");
} catch {
  /* Missing configuration is reported below. */
}
check(
  "Hosted PostgreSQL configured",
  !!database && !privateHost(database.hostname),
);
const uuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value || "",
  );
check("Customer EAS project", uuid(process.env.EXPO_CUSTOMER_PROJECT_ID));
check("Merchant EAS project", uuid(process.env.EXPO_MERCHANT_PROJECT_ID));
check("Server push dispatch enabled", process.env.ENABLE_EXPO_PUSH === "true");
check(
  "Managed Supabase image storage configured",
  process.env.UPLOAD_DRIVER === "supabase" &&
    /^https:\/\//.test(process.env.SUPABASE_URL || "") &&
    !!(
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
);
check(
  "Admin uses the same hosted API",
  !!api && process.env.VITE_API_URL === process.env.EXPO_PUBLIC_API_URL,
);
check(
  "Server JWT and pickup secrets configured",
  (process.env.JWT_SECRET || "").length >= 32 &&
    (process.env.PICKUP_SECRET || "").length >= 32,
);
for (const role of ["customer", "merchant"]) {
  const path = process.env[role.toUpperCase() + "_GOOGLE_SERVICES_JSON"];
  let valid = false;
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    valid = data.client?.some(
      (c) =>
        c.client_info?.android_client_info?.package_name ===
        "in.localkart." + role,
    );
  } catch {
    /* Missing configuration is reported below. */
  }
  check(role + " Firebase Android client file", valid);
}
if (api && api.protocol === "https:" && !privateHost(api.hostname))
  try {
    const response = await fetch(api.href.replace(/\/$/, "") + "/health", {
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();
    check(
      "Hosted API and database health",
      response.ok && data.status === "ok",
    );
  } catch {
    check("Hosted API and database health", false);
  }
console.log(
  JSON.stringify(
    {
      configurationChecks: report,
      physicalDevicePush:
        "NOT VERIFIED — observe real OS display on both installed builds; tickets/receipts alone are insufficient",
      cloudProvisioning:
        "This command does not create hosting, upload source, build APKs, or send notifications.",
    },
    null,
    2,
  ),
);
if (report.some((r) => r.status !== "PASS")) process.exitCode = 1;
