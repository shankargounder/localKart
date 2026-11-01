import { z } from "zod";
export const config = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().default(4000),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    PICKUP_SECRET: z.string().min(32),
    CORS_ORIGINS: z.string().default("http://localhost:5173"),
    ENABLE_SIMULATED_PAYMENTS: z.enum(["true", "false"]).default("false"),
    ENABLE_MANUAL_DELIVERY: z.enum(["true", "false"]).default("false"),
    ENABLE_EXPO_PUSH: z.enum(["true", "false"]).default("false"),
    EXPO_ACCESS_TOKEN: z.string().default(""),
    EXPO_CUSTOMER_PROJECT_ID: z.string().default(""),
    EXPO_MERCHANT_PROJECT_ID: z.string().default(""),
    BARCODE_CATALOG_PROVIDER: z.enum(["none", "openfoodfacts"]).default("none"),
    UPLOAD_DRIVER: z.enum(["local", "supabase"]).default("local"),
    SUPABASE_URL: z.string().default(""),
    SUPABASE_SECRET_KEY: z.string().default(""),
    SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),
    SUPABASE_STORAGE_BUCKET: z.string().default("product-images"),
  })
  .parse(process.env);
export const supabaseStorageKey =
  config.SUPABASE_SECRET_KEY || config.SUPABASE_SERVICE_ROLE_KEY;
if (config.UPLOAD_DRIVER === "supabase") {
  let validUrl = false;
  try {
    const url = new URL(config.SUPABASE_URL);
    validUrl = url.protocol === "https:" && !url.username && !url.password;
  } catch {
    /* Report configuration without disclosing secrets. */
  }
  if (
    !validUrl ||
    !supabaseStorageKey ||
    supabaseStorageKey.startsWith("sb_publishable_")
  )
    throw new Error(
      "Supabase storage requires an HTTPS URL and a server secret key",
    );
}
if (
  config.NODE_ENV === "production" &&
  config.ENABLE_SIMULATED_PAYMENTS === "true"
)
  throw new Error("Simulated payments forbidden in production");

export const browserOrigins = [
  ...new Set([
    ...config.CORS_ORIGINS.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    ...(config.NODE_ENV === "development"
      ? ["localhost", "127.0.0.1"].flatMap((host) =>
          [5173, 8081, 8082].map((port) => `http://${host}:${port}`),
        )
      : []),
  ]),
];

if (
  config.NODE_ENV === "production" &&
  config.ENABLE_EXPO_PUSH === "true" &&
  (!z.string().uuid().safeParse(config.EXPO_CUSTOMER_PROJECT_ID).success ||
    !z.string().uuid().safeParse(config.EXPO_MERCHANT_PROJECT_ID).success)
)
  throw new Error(
    "Push-enabled deployments require both customer and merchant EAS project UUIDs",
  );
