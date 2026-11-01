import { it, expect } from "vitest";
import { createRequire } from "node:module";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
const { validateDemoBuild } = createRequire(import.meta.url)(
  "../../../scripts/native-demo-config.cjs",
);
it("rejects localhost/LAN demo builds and mismatched Firebase packages", () => {
  const original = { ...process.env };
  const path = join(
    tmpdir(),
    "localkart-firebase-test-" + randomUUID() + ".json",
  );
  try {
    process.env.LOCALKART_DEMO_BUILD = "true";
    process.env.EXPO_PUBLIC_API_URL = "http://localhost:4000/api/v1";
    expect(() => validateDemoBuild("merchant", randomUUID(), path)).toThrow();
    process.env.EXPO_PUBLIC_API_URL = "https://192.168.1.38/api/v1";
    expect(() => validateDemoBuild("merchant", randomUUID(), path)).toThrow();
    process.env.EXPO_PUBLIC_API_URL = "https://staging.example.com/api/v1";
    expect(() => validateDemoBuild("merchant", "", path)).toThrow(
      "EAS project",
    );
    writeFileSync(
      path,
      JSON.stringify({
        client: [
          {
            client_info: {
              android_client_info: { package_name: "in.localkart.customer" },
            },
          },
        ],
      }),
    );
    expect(() => validateDemoBuild("merchant", randomUUID(), path)).toThrow(
      "does not match",
    );
    delete process.env.LOCALKART_ALLOW_HTTP;
    expect(() =>
      validateDemoBuild("customer", randomUUID(), path),
    ).not.toThrow();
    process.env.LOCALKART_ALLOW_HTTP = "true";
    expect(() => validateDemoBuild("customer", randomUUID(), path)).toThrow(
      "cleartext",
    );
  } finally {
    try {
      unlinkSync(path);
    } catch {
      /* Test file may not have been created. */
    }
    for (const key of Object.keys(process.env))
      if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});
